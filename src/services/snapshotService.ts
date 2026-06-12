import type {
  QualityEvent,
  QualityRule,
  ImportRecord,
  AnalysisSnapshot,
  SnapshotEventBrief,
  SnapshotBatchSummary,
  SnapshotTypeStats,
  SnapshotStatusStats,
  SnapshotDiffResult,
  SnapshotEventDiff,
  SnapshotRuleDiff,
  QualityEventType,
  EventStatus,
} from '@/types'
import { uid } from '@/utils'

const RULE_FIELD_LABELS: Record<keyof QualityRule, string> = {
  timeout_hours: '超时阈值（小时）',
  min_score: '最低评分',
  repeat_days: '重复投诉窗口（天）',
  repeat_count: '重复投诉次数',
  high_refund_amount: '高额退款阈值（元）',
}

const RULE_IMPACT_NOTES: Record<keyof QualityRule, (increased: boolean) => string> = {
  timeout_hours: (increased) => increased ? '阈值提高，超时事件将减少' : '阈值降低，超时事件将增加',
  min_score: (increased) => increased ? '标准提高，低分事件将增加' : '标准降低，低分事件将减少',
  repeat_days: (increased) => increased ? '窗口扩大，重复投诉事件将增加' : '窗口缩小，重复投诉事件将减少',
  repeat_count: (increased) => increased ? '门槛提高，重复投诉事件将减少' : '门槛降低，重复投诉事件将增加',
  high_refund_amount: (increased) => increased ? '阈值提高，高额退款事件将减少' : '阈值降低，高额退款事件将增加',
}

export function buildBatchSummary(importRecords: ImportRecord[]): SnapshotBatchSummary {
  let total_count = 0
  let valid_count = 0
  for (const r of importRecords) {
    total_count += r.total_count
    valid_count += r.valid_count
  }
  return {
    total_count,
    valid_count,
    file_count: importRecords.length,
  }
}

export function buildTypeStats(events: QualityEvent[]): SnapshotTypeStats {
  const stats: SnapshotTypeStats = {
    timeout: 0,
    low_score: 0,
    repeat_complaint: 0,
    high_refund: 0,
  }
  for (const e of events) {
    for (const t of e.types) {
      stats[t] += 1
    }
  }
  return stats
}

export function buildStatusStats(events: QualityEvent[]): SnapshotStatusStats {
  const stats: SnapshotStatusStats = {
    pending: 0,
    reviewing: 0,
    closed: 0,
  }
  for (const e of events) {
    stats[e.status] += 1
  }
  return stats
}

export function buildEventBriefs(events: QualityEvent[]): SnapshotEventBrief[] {
  return events.map((e) => ({
    id: e.id,
    customer_id: e.customer_id,
    title: e.title,
    types: [...e.types],
    status: e.status,
    evidence_count: e.evidence_count,
    total_refund: e.total_refund,
  }))
}

export function createSnapshot(
  name: string,
  description: string | undefined,
  events: QualityEvent[],
  rules: QualityRule,
  importRecords: ImportRecord[]
): AnalysisSnapshot {
  return {
    id: uid(),
    name: name.trim(),
    description: description?.trim() || undefined,
    rules: { ...rules },
    batch_summary: buildBatchSummary(importRecords),
    event_count: events.length,
    by_type: buildTypeStats(events),
    by_status: buildStatusStats(events),
    events: buildEventBriefs(events),
    created_at: new Date(),
  }
}

export function computeSnapshotDiff(
  oldSnapshot: AnalysisSnapshot,
  newSnapshot: AnalysisSnapshot
): SnapshotDiffResult {
  const oldEventMap = new Map(oldSnapshot.events.map((e) => [e.id, e]))
  const newEventMap = new Map(newSnapshot.events.map((e) => [e.id, e]))

  const event_diffs: SnapshotEventDiff[] = []
  let total_added = 0
  let total_removed = 0
  let total_status_changed = 0
  let total_type_changed = 0
  let total_unchanged = 0

  const allIds = new Set([...oldEventMap.keys(), ...newEventMap.keys()])

  for (const id of allIds) {
    const oldEv = oldEventMap.get(id)
    const newEv = newEventMap.get(id)

    if (!oldEv && newEv) {
      event_diffs.push({
        id,
        change_type: 'added',
        customer_id: newEv.customer_id,
        title: newEv.title,
        new_status: newEv.status,
        new_types: [...newEv.types],
        new_evidence_count: newEv.evidence_count,
        new_total_refund: newEv.total_refund,
      })
      total_added += 1
    } else if (oldEv && !newEv) {
      event_diffs.push({
        id,
        change_type: 'removed',
        customer_id: oldEv.customer_id,
        title: oldEv.title,
        old_status: oldEv.status,
        old_types: [...oldEv.types],
        old_evidence_count: oldEv.evidence_count,
        old_total_refund: oldEv.total_refund,
      })
      total_removed += 1
    } else if (oldEv && newEv) {
      const statusChanged = oldEv.status !== newEv.status
      const typesChanged =
        oldEv.types.length !== newEv.types.length ||
        oldEv.types.some((t) => !newEv.types.includes(t))

      if (statusChanged && typesChanged) {
        event_diffs.push({
          id,
          change_type: 'status_changed',
          customer_id: newEv.customer_id,
          title: newEv.title,
          old_status: oldEv.status,
          new_status: newEv.status,
          old_types: [...oldEv.types],
          new_types: [...newEv.types],
          old_evidence_count: oldEv.evidence_count,
          new_evidence_count: newEv.evidence_count,
          old_total_refund: oldEv.total_refund,
          new_total_refund: newEv.total_refund,
        })
        total_status_changed += 1
        total_type_changed += 1
      } else if (statusChanged) {
        event_diffs.push({
          id,
          change_type: 'status_changed',
          customer_id: newEv.customer_id,
          title: newEv.title,
          old_status: oldEv.status,
          new_status: newEv.status,
          old_types: [...oldEv.types],
          new_types: [...newEv.types],
          old_evidence_count: oldEv.evidence_count,
          new_evidence_count: newEv.evidence_count,
          old_total_refund: oldEv.total_refund,
          new_total_refund: newEv.total_refund,
        })
        total_status_changed += 1
      } else if (typesChanged) {
        event_diffs.push({
          id,
          change_type: 'type_changed',
          customer_id: newEv.customer_id,
          title: newEv.title,
          old_status: oldEv.status,
          new_status: newEv.status,
          old_types: [...oldEv.types],
          new_types: [...newEv.types],
          old_evidence_count: oldEv.evidence_count,
          new_evidence_count: newEv.evidence_count,
          old_total_refund: oldEv.total_refund,
          new_total_refund: newEv.total_refund,
        })
        total_type_changed += 1
      } else {
        event_diffs.push({
          id,
          change_type: 'unchanged',
          customer_id: newEv.customer_id,
          title: newEv.title,
          old_status: oldEv.status,
          new_status: newEv.status,
          old_types: [...oldEv.types],
          new_types: [...newEv.types],
          old_evidence_count: oldEv.evidence_count,
          new_evidence_count: newEv.evidence_count,
          old_total_refund: oldEv.total_refund,
          new_total_refund: newEv.total_refund,
        })
        total_unchanged += 1
      }
    }
  }

  const rule_diffs: SnapshotRuleDiff[] = []
  const ruleFields: (keyof QualityRule)[] = [
    'timeout_hours',
    'min_score',
    'repeat_days',
    'repeat_count',
    'high_refund_amount',
  ]

  for (const field of ruleFields) {
    const oldVal = oldSnapshot.rules[field]
    const newVal = newSnapshot.rules[field]
    if (oldVal !== newVal) {
      const increased = newVal > oldVal
      rule_diffs.push({
        field,
        old_value: oldVal,
        new_value: newVal,
        change_direction: increased ? 'increased' : 'decreased',
        impact_note: RULE_IMPACT_NOTES[field](increased),
      })
    }
  }

  const type_stats_diff = {} as Record<QualityEventType, number>
  const typeKeys: QualityEventType[] = ['timeout', 'low_score', 'repeat_complaint', 'high_refund']
  for (const t of typeKeys) {
    type_stats_diff[t] = newSnapshot.by_type[t] - oldSnapshot.by_type[t]
  }

  const status_stats_diff = {} as Record<EventStatus, number>
  const statusKeys: EventStatus[] = ['pending', 'reviewing', 'closed']
  for (const s of statusKeys) {
    status_stats_diff[s] = newSnapshot.by_status[s] - oldSnapshot.by_status[s]
  }

  return {
    old_snapshot_id: oldSnapshot.id,
    new_snapshot_id: newSnapshot.id,
    old_snapshot_name: oldSnapshot.name,
    new_snapshot_name: newSnapshot.name,
    total_added,
    total_removed,
    total_status_changed,
    total_type_changed,
    total_unchanged,
    event_diffs,
    rule_diffs,
    type_stats_diff,
    status_stats_diff,
  }
}

export function generateUniqueSnapshotName(existingNames: string[], baseName?: string): string {
  const base = baseName?.trim() || '分析快照'
  if (!existingNames.includes(base)) {
    return base
  }
  let counter = 2
  while (existingNames.includes(`${base} ${counter}`)) {
    counter += 1
  }
  return `${base} ${counter}`
}

export function isSnapshotEmpty(snapshot: AnalysisSnapshot): boolean {
  return snapshot.event_count === 0 && snapshot.batch_summary.total_count === 0
}

export function snapshotsAreEqual(a: AnalysisSnapshot, b: AnalysisSnapshot): boolean {
  if (a.event_count !== b.event_count) return false
  if (a.rules.timeout_hours !== b.rules.timeout_hours) return false
  if (a.rules.min_score !== b.rules.min_score) return false
  if (a.rules.repeat_days !== b.rules.repeat_days) return false
  if (a.rules.repeat_count !== b.rules.repeat_count) return false
  if (a.rules.high_refund_amount !== b.rules.high_refund_amount) return false
  if (a.by_type.timeout !== b.by_type.timeout) return false
  if (a.by_type.low_score !== b.by_type.low_score) return false
  if (a.by_type.repeat_complaint !== b.by_type.repeat_complaint) return false
  if (a.by_type.high_refund !== b.by_type.high_refund) return false
  if (a.by_status.pending !== b.by_status.pending) return false
  if (a.by_status.reviewing !== b.by_status.reviewing) return false
  if (a.by_status.closed !== b.by_status.closed) return false
  if (a.events.length !== b.events.length) return false

  const aIds = new Set(a.events.map((e) => e.id))
  const bIds = new Set(b.events.map((e) => e.id))
  if (aIds.size !== bIds.size) return false
  for (const id of aIds) {
    if (!bIds.has(id)) return false
  }

  const bMap = new Map(b.events.map((e) => [e.id, e]))
  for (const ae of a.events) {
    const be = bMap.get(ae.id)
    if (!be) return false
    if (ae.status !== be.status) return false
    if (ae.evidence_count !== be.evidence_count) return false
    if (ae.total_refund !== be.total_refund) return false
    if (ae.types.length !== be.types.length) return false
    for (const t of ae.types) {
      if (!be.types.includes(t)) return false
    }
  }

  return true
}

export function getRuleFieldLabel(field: keyof QualityRule): string {
  return RULE_FIELD_LABELS[field]
}
