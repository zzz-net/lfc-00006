import type {
  QualityEvent,
  HandoverEventSnapshot,
  HandoverPackage,
  HandoverPackageStatus,
  HandoverPriority,
  HandoverCommunicationRecord,
  HandoverUndoRecord,
  HandoverPackageAuditLog,
  HandoverPackageActionType,
  ImportHandoverPackageConflict,
  ImportHandoverPackageResult,
  ImportHandoverConflictResolution,
  HandoverEventFilter,
  EventStatus,
  QualityEventType,
} from '@/types'
import { uid, reviveDates } from '@/utils'

const OPERATOR = '当前用户'

export const STATUS_LABEL_MAP: Record<HandoverPackageStatus, string> = {
  pending: '待接手',
  processing: '处理中',
  completed: '已完成',
  cancelled: '已撤销',
}

export const STATUS_COLOR_MAP: Record<HandoverPackageStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
}

export const PRIORITY_LABEL_MAP: Record<HandoverPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export const PRIORITY_COLOR_MAP: Record<HandoverPriority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export function createHandoverEventSnapshot(event: QualityEvent): HandoverEventSnapshot {
  return {
    id: event.id,
    customer_id: event.customer_id,
    title: event.title,
    types: [...event.types],
    status: event.status,
    review_note: event.review_note,
    reviewed_at: event.reviewed_at,
    closed_at: event.closed_at,
    first_seen_at: event.first_seen_at,
    last_seen_at: event.last_seen_at,
    evidence_count: event.evidence_count,
    total_refund: event.total_refund,
    snapshotted_at: new Date(),
  }
}

export function createHandoverPackage(
  title: string,
  assignee: string,
  deadline: Date | null,
  priority: HandoverPriority,
  description: string,
  events: QualityEvent[]
): HandoverPackage {
  const now = new Date()
  const eventSnapshots = events.map(createHandoverEventSnapshot)

  return {
    id: uid('hpkg'),
    title: title.trim(),
    assignee: assignee.trim(),
    deadline,
    priority,
    description: description.trim(),
    status: 'pending',
    event_snapshots: eventSnapshots,
    event_ids: events.map((e) => e.id),
    communication_records: [],
    undo_records: [],
    created_at: now,
    updated_at: now,
    completed_at: null,
  }
}

export function createHandoverAuditLog(
  action: HandoverPackageActionType,
  pkg: HandoverPackage,
  options: {
    oldStatus?: HandoverPackageStatus
    newStatus?: HandoverPackageStatus
    recordContent?: string
    undoReason?: string
    importSource?: string
    note?: string
  } = {}
): HandoverPackageAuditLog {
  return {
    id: uid('hpkg_audit'),
    action,
    package_id: pkg.id,
    package_title: pkg.title,
    operator: OPERATOR,
    operated_at: new Date(),
    old_status: options.oldStatus,
    new_status: options.newStatus,
    record_content: options.recordContent,
    undo_reason: options.undoReason,
    import_source: options.importSource,
    note: options.note,
  }
}

export function addCommunicationRecord(
  pkg: HandoverPackage,
  content: string
): { package: HandoverPackage; auditLog: HandoverPackageAuditLog } {
  const trimmedContent = content.trim()
  const record: HandoverCommunicationRecord = {
    id: uid('hcomm'),
    content: trimmedContent,
    operator: OPERATOR,
    created_at: new Date(),
  }

  const updated: HandoverPackage = {
    ...pkg,
    communication_records: [...pkg.communication_records, record],
    updated_at: new Date(),
  }

  const auditLog = createHandoverAuditLog('add_record', updated, {
    recordContent: trimmedContent,
    note: '追加沟通记录',
  })

  return { package: updated, auditLog }
}

export function markAsCompleted(
  pkg: HandoverPackage
): { package: HandoverPackage; auditLog: HandoverPackageAuditLog } {
  const oldStatus = pkg.status
  const now = new Date()

  const updated: HandoverPackage = {
    ...pkg,
    status: 'completed',
    updated_at: now,
    completed_at: now,
  }

  const auditLog = createHandoverAuditLog('complete', updated, {
    oldStatus,
    newStatus: 'completed',
    note: '标记交接包为已完成',
  })

  return { package: updated, auditLog }
}

export function undoComplete(
  pkg: HandoverPackage,
  reason: string
): { package: HandoverPackage; auditLog: HandoverPackageAuditLog } {
  const oldStatus = pkg.status
  const trimmedReason = reason.trim()
  const now = new Date()

  const undoRecord: HandoverUndoRecord = {
    id: uid('hundo'),
    reason: trimmedReason,
    operator: OPERATOR,
    created_at: now,
    previous_status: oldStatus,
  }

  const updated: HandoverPackage = {
    ...pkg,
    status: 'processing',
    updated_at: now,
    completed_at: null,
    undo_records: [...pkg.undo_records, undoRecord],
  }

  const auditLog = createHandoverAuditLog('undo_complete', updated, {
    oldStatus,
    newStatus: 'processing',
    undoReason: trimmedReason,
    note: '撤销完成，恢复为处理中',
  })

  return { package: updated, auditLog }
}

export function updateHandoverStatus(
  pkg: HandoverPackage,
  newStatus: HandoverPackageStatus
): { package: HandoverPackage; auditLog: HandoverPackageAuditLog } {
  const oldStatus = pkg.status
  const now = new Date()

  const updated: HandoverPackage = {
    ...pkg,
    status: newStatus,
    updated_at: now,
    completed_at: newStatus === 'completed' ? now : pkg.completed_at,
  }

  const auditLog = createHandoverAuditLog('update', updated, {
    oldStatus,
    newStatus,
    note: `状态变更：${oldStatus} → ${newStatus}`,
  })

  return { package: updated, auditLog }
}

export function exportHandoverPackageToJSON(pkg: HandoverPackage): string {
  const data = {
    ...pkg,
    created_at: pkg.created_at.toISOString(),
    updated_at: pkg.updated_at.toISOString(),
    completed_at: pkg.completed_at ? pkg.completed_at.toISOString() : null,
    deadline: pkg.deadline ? pkg.deadline.toISOString() : null,
    event_snapshots: pkg.event_snapshots.map((s) => ({
      ...s,
      reviewed_at: s.reviewed_at ? s.reviewed_at.toISOString() : null,
      closed_at: s.closed_at ? s.closed_at.toISOString() : null,
      first_seen_at: s.first_seen_at.toISOString(),
      last_seen_at: s.last_seen_at.toISOString(),
      snapshotted_at: s.snapshotted_at.toISOString(),
    })),
    communication_records: pkg.communication_records.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
    })),
    undo_records: pkg.undo_records.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
    })),
  }
  return JSON.stringify(data, null, 2)
}

export function exportHandoverPackagesToJSON(packages: HandoverPackage[]): string {
  const data = packages.map((pkg) => ({
    ...pkg,
    created_at: pkg.created_at.toISOString(),
    updated_at: pkg.updated_at.toISOString(),
    completed_at: pkg.completed_at ? pkg.completed_at.toISOString() : null,
    deadline: pkg.deadline ? pkg.deadline.toISOString() : null,
    event_snapshots: pkg.event_snapshots.map((s) => ({
      ...s,
      reviewed_at: s.reviewed_at ? s.reviewed_at.toISOString() : null,
      closed_at: s.closed_at ? s.closed_at.toISOString() : null,
      first_seen_at: s.first_seen_at.toISOString(),
      last_seen_at: s.last_seen_at.toISOString(),
      snapshotted_at: s.snapshotted_at.toISOString(),
    })),
    communication_records: pkg.communication_records.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
    })),
    undo_records: pkg.undo_records.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
    })),
  }))
  return JSON.stringify({ version: 1, exported_at: new Date().toISOString(), packages: data }, null, 2)
}

export function parseHandoverPackageJSON(jsonStr: string): HandoverPackage | null {
  try {
    const parsed = JSON.parse(jsonStr)
    const revived = reviveDates(parsed) as HandoverPackage
    if (!revived.id || !revived.title || !Array.isArray(revived.event_snapshots)) {
      return null
    }
    return revived
  } catch {
    return null
  }
}

export function parseHandoverPackagesJSON(jsonStr: string): HandoverPackage[] | null {
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.packages && Array.isArray(parsed.packages)) {
      return parsed.packages.map((p: any) => reviveDates(p) as HandoverPackage)
    }
    const single = parseHandoverPackageJSON(jsonStr)
    return single ? [single] : null
  } catch {
    return null
  }
}

export function validateHandoverPackageImport(
  pkg: HandoverPackage,
  existingPackages: HandoverPackage[],
  existingEvents: QualityEvent[]
): { conflicts: ImportHandoverPackageConflict[]; isValid: boolean } {
  const conflicts: ImportHandoverPackageConflict[] = []
  const existingIds = new Set(existingPackages.map((p) => p.id))
  const existingTitles = new Set(existingPackages.map((p) => p.title))
  const existingEventIds = new Set(existingEvents.map((e) => e.id))

  if (existingIds.has(pkg.id)) {
    conflicts.push({
      type: 'duplicate_id',
      package_id: pkg.id,
      package_title: pkg.title,
      existing_id: pkg.id,
    })
  }

  if (existingTitles.has(pkg.title)) {
    conflicts.push({
      type: 'duplicate_title',
      package_id: pkg.id,
      package_title: pkg.title,
      existing_title: pkg.title,
    })
  }

  for (const snapshot of pkg.event_snapshots) {
    const currentEvent = existingEvents.find((e) => e.id === snapshot.id)
    
    if (!currentEvent) {
      conflicts.push({
        type: 'event_not_found',
        package_id: pkg.id,
        package_title: pkg.title,
        event_id: snapshot.id,
        event_title: snapshot.title,
      })
    } else if (currentEvent.status !== snapshot.status) {
      conflicts.push({
        type: 'event_status_conflict',
        package_id: pkg.id,
        package_title: pkg.title,
        event_id: snapshot.id,
        event_title: snapshot.title,
        expected_status: snapshot.status,
        actual_status: currentEvent.status,
      })
    }
  }

  return { conflicts, isValid: conflicts.length === 0 }
}

export function importHandoverPackages(
  jsonStr: string,
  existingPackages: HandoverPackage[],
  existingEvents: QualityEvent[],
  conflictResolutions: Record<string, ImportHandoverConflictResolution> = {}
): ImportHandoverPackageResult {
  const result: ImportHandoverPackageResult = {
    success: true,
    imported: [],
    skipped: [],
    warnings: [],
    errors: [],
  }

  const parsed = parseHandoverPackagesJSON(jsonStr)
  if (!parsed) {
    result.success = false
    result.errors.push('JSON 格式无效，无法解析交接包数据')
    return result
  }

  const existingIds = new Set(existingPackages.map((p) => p.id))
  const existingTitles = new Set(existingPackages.map((p) => p.title))

  for (const pkg of parsed) {
    const validation = validateHandoverPackageImport(pkg, existingPackages, existingEvents)
    
    if (validation.conflicts.length > 0) {
      const firstConflict = validation.conflicts[0]
      const conflictKey = `${pkg.id}_${firstConflict.type}`
      const resolution = conflictResolutions[conflictKey] || 'skip'

      if (resolution === 'skip') {
        result.skipped.push(firstConflict)
        for (const conflict of validation.conflicts) {
          if (conflict.type === 'duplicate_id') {
            result.warnings.push(`交接包「${pkg.title}」ID 已存在，已跳过`)
          } else if (conflict.type === 'duplicate_title') {
            result.warnings.push(`交接包「${pkg.title}」标题已存在，已跳过`)
          } else if (conflict.type === 'event_not_found') {
            result.warnings.push(`交接包「${pkg.title}」中事件「${conflict.event_title}」已不存在，已跳过`)
          } else if (conflict.type === 'event_status_conflict') {
            result.warnings.push(
              `交接包「${pkg.title}」中事件「${conflict.event_title}」状态不匹配（期望：${conflict.expected_status}，实际：${conflict.actual_status}），已跳过`
            )
          }
        }
        continue
      } else if (resolution === 'rename') {
        let newTitle = `${pkg.title} (导入)`
        let counter = 1
        while (existingTitles.has(newTitle)) {
          counter++
          newTitle = `${pkg.title} (导入 ${counter})`
        }
        const renamedPkg = { ...pkg, title: newTitle }
        result.imported.push(renamedPkg)
        existingIds.add(renamedPkg.id)
        existingTitles.add(newTitle)
        result.warnings.push(`交接包「${pkg.title}」已重命名为「${newTitle}」导入`)
      } else if (resolution === 'import_as_snapshot') {
        result.imported.push(pkg)
        existingIds.add(pkg.id)
        existingTitles.add(pkg.title)
        result.warnings.push(`交接包「${pkg.title}」按快照方式导入，忽略事件状态冲突`)
      }
    } else {
      result.imported.push(pkg)
      existingIds.add(pkg.id)
      existingTitles.add(pkg.title)
    }
  }

  if (result.imported.length === 0 && result.skipped.length > 0) {
    result.success = false
    result.errors.push('所有交接包均因冲突被跳过，请选择其他处理方式或修改后重新导入')
  }

  return result
}

export function filterHandoverEvents(
  events: QualityEvent[],
  filter: HandoverEventFilter
): QualityEvent[] {
  return events.filter((event) => {
    if (filter.statuses && filter.statuses.length > 0) {
      if (!filter.statuses.includes(event.status)) return false
    }

    if (filter.types && filter.types.length > 0) {
      const hasMatchingType = event.types.some((t) => filter.types!.includes(t))
      if (!hasMatchingType) return false
    }

    if (filter.customer_id && filter.customer_id.trim()) {
      if (!event.customer_id.toLowerCase().includes(filter.customer_id.toLowerCase().trim())) {
        return false
      }
    }

    if (filter.min_refund !== undefined && filter.min_refund > 0) {
      if (event.total_refund < filter.min_refund) return false
    }

    if (filter.max_refund !== undefined && filter.max_refund > 0) {
      if (event.total_refund > filter.max_refund) return false
    }

    if (filter.search && filter.search.trim()) {
      const keyword = filter.search.trim().toLowerCase()
      const searchFields = [
        event.title,
        event.customer_id,
        event.review_note,
        ...event.types,
      ]
      return searchFields.some((f) => f.toLowerCase().includes(keyword))
    }

    return true
  })
}

export function filterHandoverPackages(
  packages: HandoverPackage[],
  filters: {
    status?: HandoverPackageStatus
    priority?: HandoverPriority
    assignee?: string
    search?: string
  }
): HandoverPackage[] {
  return packages.filter((pkg) => {
    if (filters.status && pkg.status !== filters.status) return false
    if (filters.priority && pkg.priority !== filters.priority) return false
    if (filters.assignee && filters.assignee.trim()) {
      if (!pkg.assignee.toLowerCase().includes(filters.assignee.toLowerCase().trim())) {
        return false
      }
    }
    if (filters.search && filters.search.trim()) {
      const keyword = filters.search.trim().toLowerCase()
      const searchFields = [
        pkg.title,
        pkg.assignee,
        pkg.description,
        ...pkg.event_snapshots.map((e) => e.title),
        ...pkg.event_snapshots.map((e) => e.customer_id),
      ]
      return searchFields.some((f) => f.toLowerCase().includes(keyword))
    }
    return true
  })
}
