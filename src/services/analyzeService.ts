import type { CustomerTicket, VisitScore, Refund, QualityRule, Evidence, QualityEvent, QualityEventType, EvidenceSourceType, EventStatus } from '@/types';
import { uid, hoursDiff, daysDiff, deterministicId } from '@/utils';

const TYPE_LABELS: Record<QualityEventType, string> = {
  timeout: '超时工单',
  low_score: '低分投诉',
  high_refund: '高额退款',
  repeat_complaint: '重复投诉',
};

function getMainType(types: QualityEventType[]): string {
  if (types.length === 0) return '异常行为';
  const priority: QualityEventType[] = ['repeat_complaint', 'high_refund', 'low_score', 'timeout'];
  for (const t of priority) {
    if (types.includes(t)) return TYPE_LABELS[t];
  }
  return TYPE_LABELS[types[0]] || types[0];
}

function buildEventTitle(customerId: string, types: QualityEventType[], evCount: number): string {
  return `${customerId} - ${getMainType(types)}(${evCount}条证据)`;
}

export function runAnalysis(
  tickets: CustomerTicket[],
  scores: VisitScore[],
  refunds: Refund[],
  rules: QualityRule
): { events: QualityEvent[]; evidences: Evidence[] } {
  const ticketHitMap: Map<string, QualityEventType[]> = new Map();
  const scoreHitMap: Map<string, QualityEventType[]> = new Map();
  const refundHitMap: Map<string, QualityEventType[]> = new Map();

  tickets.forEach(t => {
    const hits: QualityEventType[] = [];
    if (t.resolved_at) {
      const diff = hoursDiff(t.resolved_at, t.created_at);
      if (diff > rules.timeout_hours) {
        hits.push('timeout');
      }
    }
    if (hits.length > 0) {
      ticketHitMap.set(t.id, hits);
    }
  });

  scores.forEach(s => {
    const hits: QualityEventType[] = [];
    if (s.score < rules.min_score) {
      hits.push('low_score');
    }
    if (hits.length > 0) {
      scoreHitMap.set(s.id, hits);
    }
  });

  refunds.forEach(r => {
    const hits: QualityEventType[] = [];
    if (r.amount > rules.high_refund_amount) {
      hits.push('high_refund');
    }
    if (hits.length > 0) {
      refundHitMap.set(r.id, hits);
    }
  });

  const customerTicketMap: Map<string, CustomerTicket[]> = new Map();
  tickets.forEach(t => {
    const arr = customerTicketMap.get(t.customer_id) || [];
    arr.push(t);
    customerTicketMap.set(t.customer_id, arr);
  });

  customerTicketMap.forEach((custTickets) => {
    const sorted = [...custTickets].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const n = sorted.length;
    const repeatMarked: Set<string> = new Set();
    for (let i = 0; i < n; i++) {
      const windowTickets: CustomerTicket[] = [sorted[i]];
      for (let j = i + 1; j < n; j++) {
        const diff = daysDiff(sorted[j].created_at, sorted[i].created_at);
        if (diff <= rules.repeat_days) {
          windowTickets.push(sorted[j]);
        } else {
          break;
        }
      }
      if (windowTickets.length >= rules.repeat_count) {
        windowTickets.forEach(t => repeatMarked.add(t.id));
      }
    }
    repeatMarked.forEach(id => {
      const arr = ticketHitMap.get(id) || [];
      if (!arr.includes('repeat_complaint')) {
        arr.push('repeat_complaint');
        ticketHitMap.set(id, arr);
      }
    });
  });

  const evidences: Evidence[] = [];

  tickets.forEach(t => {
    const hits = ticketHitMap.get(t.id);
    if (!hits || hits.length === 0) return;
    const raw = {
      id: t.id,
      ticket_no: t.ticket_no,
      customer_id: t.customer_id,
      title: t.title,
      category: t.category,
      created_at: t.created_at.toISOString(),
      resolved_at: t.resolved_at ? t.resolved_at.toISOString() : null,
      status: t.status,
    };
    evidences.push({
      id: uid(),
      event_id: '',
      source_type: 'ticket' as EvidenceSourceType,
      source_id: t.id,
      hit_rules: [...hits],
      raw_data: raw,
      occurred_at: new Date(t.created_at.getTime()),
    });
  });

  scores.forEach(s => {
    const hits = scoreHitMap.get(s.id);
    if (!hits || hits.length === 0) return;
    const raw = {
      id: s.id,
      customer_id: s.customer_id,
      ticket_no: s.ticket_no,
      score: s.score,
      comment: s.comment,
      visited_at: s.visited_at.toISOString(),
    };
    evidences.push({
      id: uid(),
      event_id: '',
      source_type: 'score' as EvidenceSourceType,
      source_id: s.id,
      hit_rules: [...hits],
      raw_data: raw,
      occurred_at: new Date(s.visited_at.getTime()),
    });
  });

  refunds.forEach(r => {
    const hits = refundHitMap.get(r.id);
    if (!hits || hits.length === 0) return;
    const raw = {
      id: r.id,
      refund_no: r.refund_no,
      customer_id: r.customer_id,
      order_no: r.order_no,
      amount: r.amount,
      reason: r.reason,
      refunded_at: r.refunded_at.toISOString(),
    };
    evidences.push({
      id: uid(),
      event_id: '',
      source_type: 'refund' as EvidenceSourceType,
      source_id: r.id,
      hit_rules: [...hits],
      raw_data: raw,
      occurred_at: new Date(r.refunded_at.getTime()),
    });
  });

  const refundAmountMap: Map<string, number> = new Map();
  refunds.forEach(r => {
    refundAmountMap.set(r.id, r.amount);
  });

  const events: QualityEvent[] = [];
  const customerEvidenceMap: Map<string, Evidence[]> = new Map();

  evidences.forEach(ev => {
    const raw = ev.raw_data as { customer_id?: string };
    const customerId: string = raw.customer_id || '';
    if (!customerId) return;
    const arr = customerEvidenceMap.get(customerId) || [];
    arr.push(ev);
    customerEvidenceMap.set(customerId, arr);
  });

  const repeatWindowDays = rules.repeat_days * 2;

  customerEvidenceMap.forEach((custEvidences, customerId) => {
    const sorted = [...custEvidences].sort(
      (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime()
    );
    const custEvents: QualityEvent[] = [];

    sorted.forEach(ev => {
      const evTime = ev.occurred_at;
      let matchedEvent: QualityEvent | null = null;
      let bestDiff = Infinity;

      custEvents.forEach(evt => {
        const diff = daysDiff(evTime, evt.last_seen_at);
        if (diff >= 0 && diff <= repeatWindowDays) {
          if (diff < bestDiff) {
            bestDiff = diff;
            matchedEvent = evt;
          }
        }
      });

      let refundDelta = 0;
      if (ev.source_type === 'refund') {
        refundDelta = refundAmountMap.get(ev.source_id) || 0;
      }

      if (matchedEvent) {
        const me = matchedEvent;
        const allTypes = new Set<QualityEventType>([...me.types, ...ev.hit_rules as QualityEventType[]]);
        me.types = Array.from(allTypes);
        me.evidence_count += 1;
        me.total_refund += refundDelta;
        if (ev.occurred_at.getTime() < me.first_seen_at.getTime()) {
          me.first_seen_at = new Date(ev.occurred_at.getTime());
        }
        if (ev.occurred_at.getTime() > me.last_seen_at.getTime()) {
          me.last_seen_at = new Date(ev.occurred_at.getTime());
        }
        ev.event_id = me.id;
        me.title = buildEventTitle(me.customer_id, me.types, me.evidence_count);
      } else {
        const initTypes = ev.hit_rules as QualityEventType[];
        const status: EventStatus = 'pending';
        const newEvent: QualityEvent = {
          id: uid(),
          customer_id: customerId,
          title: '',
          types: initTypes,
          status: status,
          review_note: '',
          reviewed_at: null,
          closed_at: null,
          first_seen_at: new Date(ev.occurred_at.getTime()),
          last_seen_at: new Date(ev.occurred_at.getTime()),
          evidence_count: 1,
          total_refund: refundDelta,
        };
        newEvent.title = buildEventTitle(newEvent.customer_id, newEvent.types, newEvent.evidence_count);
        ev.event_id = newEvent.id;
        custEvents.push(newEvent);
      }
    });

    events.push(...custEvents);
  });

  const eventIdMap = new Map<string, string>();
  for (const event of events) {
    const eventEvidences = evidences.filter(e => e.event_id === event.id);
    const sourceIds = eventEvidences.map(e => e.source_id).sort();
    const seed = `${event.customer_id}:${sourceIds.join(',')}`;
    const newId = deterministicId('evt', seed);
    eventIdMap.set(event.id, newId);
  }

  for (const event of events) {
    event.id = eventIdMap.get(event.id)!;
  }

  for (const evidence of evidences) {
    if (evidence.event_id && eventIdMap.has(evidence.event_id)) {
      evidence.event_id = eventIdMap.get(evidence.event_id)!;
    }
  }

  return { events, evidences };
}
