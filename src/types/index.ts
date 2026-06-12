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
