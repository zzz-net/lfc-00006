import type { QualityEvent, Evidence, ExportFilter, EventStatus, QualityEventType } from '@/types';
import { toCSV, formatDate } from '@/utils';
import dayjs from 'dayjs';

export function buildExportFilteredEvents(
  events: QualityEvent[],
  evidences: Evidence[],
  filter: ExportFilter
): { filteredEvents: QualityEvent[]; filteredEvidences: Evidence[] } {
  let filteredEvents = [...events];

  if (filter.statuses && filter.statuses.length > 0) {
    const s = new Set<EventStatus>(filter.statuses);
    filteredEvents = filteredEvents.filter(e => s.has(e.status));
  }

  if (filter.types && filter.types.length > 0) {
    const s = new Set<QualityEventType>(filter.types);
    filteredEvents = filteredEvents.filter(e => e.types.some(t => s.has(t)));
  }

  const eventIdSet = new Set(filteredEvents.map(e => e.id));
  let filteredEvidences = evidences.filter(ev => ev.event_id && eventIdSet.has(ev.event_id));

  if (!filter.includeEvidences) {
    filteredEvidences = [];
  }

  return { filteredEvents, filteredEvidences };
}

export function eventsToCSV(events: QualityEvent[], schemeInfo?: Record<string, string | number>): string {
  const columns = [
    'id',
    'customer_id',
    'title',
    'types',
    'status',
    'review_note',
    'reviewed_at',
    'closed_at',
    'first_seen_at',
    'last_seen_at',
    'evidence_count',
    'total_refund',
    'scheme_name',
    'scheme_id',
    'scheme_created_at',
    'scheme_timeout_hours',
    'scheme_min_score',
    'scheme_repeat_days',
    'scheme_repeat_count',
    'scheme_high_refund_amount',
  ];
  const rows = events.map(e => ({
    id: e.id,
    customer_id: e.customer_id,
    title: e.title,
    types: e.types.join('|'),
    status: e.status,
    review_note: e.review_note || '',
    reviewed_at: e.reviewed_at ? formatDate(e.reviewed_at) : '',
    closed_at: e.closed_at ? formatDate(e.closed_at) : '',
    first_seen_at: formatDate(e.first_seen_at),
    last_seen_at: formatDate(e.last_seen_at),
    evidence_count: e.evidence_count,
    total_refund: e.total_refund,
    scheme_name: String(schemeInfo?.scheme_name ?? ''),
    scheme_id: String(schemeInfo?.scheme_id ?? ''),
    scheme_created_at: String(schemeInfo?.scheme_created_at ?? ''),
    scheme_timeout_hours: String(schemeInfo?.timeout_hours ?? ''),
    scheme_min_score: String(schemeInfo?.min_score ?? ''),
    scheme_repeat_days: String(schemeInfo?.repeat_days ?? ''),
    scheme_repeat_count: String(schemeInfo?.repeat_count ?? ''),
    scheme_high_refund_amount: String(schemeInfo?.high_refund_amount ?? ''),
  }));
  return toCSV(rows, columns);
}

export function eventsToJSON(
  events: QualityEvent[],
  evidences: Evidence[],
  includeEvidences: boolean,
  schemeInfo?: Record<string, string | number>
): string {
  const data: { exported_at: string; event_count: number; events: unknown[]; evidence_count?: number; evidences?: unknown[]; scheme?: Record<string, string | number> } = {
    exported_at: dayjs().toISOString(),
    event_count: events.length,
    events: events.map(e => ({
      ...e,
      first_seen_at: e.first_seen_at.toISOString(),
      last_seen_at: e.last_seen_at.toISOString(),
      reviewed_at: e.reviewed_at ? e.reviewed_at.toISOString() : null,
      closed_at: e.closed_at ? e.closed_at.toISOString() : null,
    })),
  };
  if (schemeInfo) {
    data.scheme = {
      scheme_name: String(schemeInfo.scheme_name ?? ''),
      scheme_id: String(schemeInfo.scheme_id ?? ''),
      scheme_created_at: String(schemeInfo.scheme_created_at ?? ''),
      timeout_hours: schemeInfo.timeout_hours ?? '',
      min_score: schemeInfo.min_score ?? '',
      repeat_days: schemeInfo.repeat_days ?? '',
      repeat_count: schemeInfo.repeat_count ?? '',
      high_refund_amount: schemeInfo.high_refund_amount ?? '',
    };
  }
  if (includeEvidences) {
    data.evidence_count = evidences.length;
    data.evidences = evidences.map(ev => ({
      ...ev,
      occurred_at: ev.occurred_at.toISOString(),
    }));
  }
  return JSON.stringify(data, null, 2);
}

export function evidencesToCSV(evidences: Evidence[]): string {
  const columns = [
    'id',
    'event_id',
    'source_type',
    'source_id',
    'hit_rules',
    'occurred_at',
  ];
  const rows = evidences.map(e => ({
    id: e.id,
    event_id: e.event_id,
    source_type: e.source_type,
    source_id: e.source_id,
    hit_rules: e.hit_rules.join('|'),
    occurred_at: formatDate(e.occurred_at),
  }));
  return toCSV(rows, columns);
}

export function buildFullBackup(state: unknown): string {
  return JSON.stringify(
    {
      version: 1,
      backup_at: dayjs().toISOString(),
      state,
    },
    null,
    2
  );
}

export function parseFullBackup(jsonStr: string): unknown | null {
  try {
    const obj = JSON.parse(jsonStr);
    if (!obj || typeof obj !== 'object' || !('state' in obj)) {
      return null;
    }
    return obj.state;
  } catch {
    return null;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
