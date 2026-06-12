export interface CustomerTicket {
  id: string
  source_file: string
  ticket_no: string
  customer_id: string
  title: string
  content: string
  category: string
  created_at: Date
  resolved_at: Date | null
  status: string
  agent_id: string
}

export interface VisitScore {
  id: string
  source_file: string
  customer_id: string
  ticket_no: string
  score: number
  comment: string
  visited_at: Date
}

export interface Refund {
  id: string
  source_file: string
  file_hash: string
  refund_no: string
  customer_id: string
  order_no: string
  amount: number
  reason: string
  refunded_at: Date
}

export interface QualityRule {
  timeout_hours: number
  min_score: number
  repeat_days: number
  repeat_count: number
  high_refund_amount: number
}

export type QualityEventType = 'timeout' | 'low_score' | 'repeat_complaint' | 'high_refund'

export type EventStatus = 'pending' | 'reviewing' | 'closed'

export interface QualityEvent {
  id: string
  customer_id: string
  title: string
  types: QualityEventType[]
  status: EventStatus
  review_note: string
  reviewed_at: Date | null
  closed_at: Date | null
  first_seen_at: Date
  last_seen_at: Date
  evidence_count: number
  total_refund: number
}

export type EvidenceSourceType = 'ticket' | 'score' | 'refund'

export interface Evidence {
  id: string
  event_id: string
  source_type: EvidenceSourceType
  source_id: string
  hit_rules: string[]
  raw_data: any
  occurred_at: Date
}

export interface ImportError {
  line: number
  field: string
  message: string
  value: any
}

export interface ImportRecord {
  id: string
  file_name: string
  file_type: 'ticket' | 'score' | 'refund'
  total_count: number
  valid_count: number
  invalid_count: number
  file_hash: string
  imported_at: Date
  errors: ImportError[]
  raw_content: string
}

export interface ImportResult {
  success: boolean
  record?: ImportRecord
  warnings: string[]
  errors: string[]
}

export interface ValidationResult {
  valid: boolean
  fieldErrors: Record<string, string>
}

export interface AnalysisResult {
  eventCount: number
  evidenceCount: number
  byType: Record<QualityEventType, number>
}

export interface ExportFilter {
  statuses?: EventStatus[]
  types?: QualityEventType[]
  includeEvidences: boolean
}

export type BatchActionType = 'confirm' | 'ignore' | 'reopen'

export interface BatchActionTarget {
  id: string
  originalStatus: EventStatus
  originalNote: string
  originalReviewedAt: Date | null
  originalClosedAt: Date | null
}

export interface BatchActionSkipReason {
  id: string
  reason: 'not_found' | 'already_closed' | 'status_changed'
  expectedStatus?: EventStatus
  actualStatus?: EventStatus
}

export interface BatchActionResult {
  action: BatchActionType
  targetStatus: EventStatus
  totalRequested: number
  successCount: number
  skipCount: number
  skipped: BatchActionSkipReason[]
  targets: BatchActionTarget[]
  note: string
  executedAt: Date
  operationId: string
}

export interface BatchOperation {
  id: string
  action: BatchActionType
  targetStatus: EventStatus
  note: string
  targets: BatchActionTarget[]
  executedAt: Date
}

export interface SnapshotBatchSummary {
  total_count: number
  valid_count: number
  file_count: number
}

export interface SnapshotTypeStats {
  timeout: number
  low_score: number
  repeat_complaint: number
  high_refund: number
}

export interface SnapshotStatusStats {
  pending: number
  reviewing: number
  closed: number
}

export interface SnapshotEventBrief {
  id: string
  customer_id: string
  title: string
  types: QualityEventType[]
  status: EventStatus
  evidence_count: number
  total_refund: number
}

export interface AnalysisSnapshot {
  id: string
  name: string
  description?: string
  rules: QualityRule
  batch_summary: SnapshotBatchSummary
  event_count: number
  by_type: SnapshotTypeStats
  by_status: SnapshotStatusStats
  events: SnapshotEventBrief[]
  created_at: Date
}

export interface DeletedSnapshot {
  snapshot: AnalysisSnapshot
  deleted_at: Date
}

export type SnapshotDiffChangeType = 'added' | 'removed' | 'status_changed' | 'type_changed' | 'unchanged'

export interface SnapshotEventDiff {
  id: string
  change_type: SnapshotDiffChangeType
  customer_id: string
  title: string
  old_status?: EventStatus
  new_status?: EventStatus
  old_types?: QualityEventType[]
  new_types?: QualityEventType[]
  old_evidence_count?: number
  new_evidence_count?: number
  old_total_refund?: number
  new_total_refund?: number
}

export interface SnapshotRuleDiff {
  field: keyof QualityRule
  old_value: number
  new_value: number
  change_direction: 'increased' | 'decreased'
  impact_note: string
}

export interface SnapshotDiffResult {
  old_snapshot_id: string
  new_snapshot_id: string
  old_snapshot_name: string
  new_snapshot_name: string
  total_added: number
  total_removed: number
  total_status_changed: number
  total_type_changed: number
  total_unchanged: number
  event_diffs: SnapshotEventDiff[]
  rule_diffs: SnapshotRuleDiff[]
  type_stats_diff: Record<QualityEventType, number>
  status_stats_diff: Record<EventStatus, number>
}
