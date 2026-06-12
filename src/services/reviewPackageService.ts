import type {
  QualityEvent,
  QualityEventSnapshot,
  ReviewPackage,
  ReviewPackageStatus,
  ReviewPackageCauseCategory,
  ReviewPackageRemark,
  ReviewPackageAuditLog,
  ReviewPackageActionType,
  ImportReviewPackageConflict,
  ImportReviewPackageResult,
} from '@/types'
import { uid, reviveDates } from '@/utils'

const OPERATOR = '当前用户'

export function createEventSnapshot(event: QualityEvent): QualityEventSnapshot {
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

export function createReviewPackage(
  title: string,
  responsible: string,
  causeCategory: ReviewPackageCauseCategory,
  handlingSuggestion: string,
  deadline: Date | null,
  events: QualityEvent[]
): ReviewPackage {
  const now = new Date()
  const eventSnapshots = events.map(createEventSnapshot)

  return {
    id: uid('rpkg'),
    title: title.trim(),
    responsible: responsible.trim(),
    cause_category: causeCategory,
    handling_suggestion: handlingSuggestion.trim(),
    deadline,
    status: 'draft',
    event_snapshots: eventSnapshots,
    event_ids: events.map((e) => e.id),
    remarks: [],
    created_at: now,
    updated_at: now,
    closed_at: null,
  }
}

export function createReviewPackageAuditLog(
  action: ReviewPackageActionType,
  pkg: ReviewPackage,
  options: {
    oldStatus?: ReviewPackageStatus
    newStatus?: ReviewPackageStatus
    remarkContent?: string
    importSource?: string
    note?: string
  } = {}
): ReviewPackageAuditLog {
  return {
    id: uid('rpkg_audit'),
    action,
    package_id: pkg.id,
    package_title: pkg.title,
    operator: OPERATOR,
    operated_at: new Date(),
    old_status: options.oldStatus,
    new_status: options.newStatus,
    remark_content: options.remarkContent,
    import_source: options.importSource,
    note: options.note,
  }
}

export function addRemark(
  pkg: ReviewPackage,
  content: string
): { package: ReviewPackage; auditLog: ReviewPackageAuditLog } {
  const trimmedContent = content.trim()
  const remark: ReviewPackageRemark = {
    id: uid('remark'),
    content: trimmedContent,
    operator: OPERATOR,
    created_at: new Date(),
  }

  const updated: ReviewPackage = {
    ...pkg,
    remarks: [...pkg.remarks, remark],
    updated_at: new Date(),
  }

  const auditLog = createReviewPackageAuditLog('add_remark', updated, {
    remarkContent: trimmedContent,
    note: '追加处理备注',
  })

  return { package: updated, auditLog }
}

export function updateStatus(
  pkg: ReviewPackage,
  newStatus: ReviewPackageStatus
): { package: ReviewPackage; auditLog: ReviewPackageAuditLog } {
  const oldStatus = pkg.status
  const now = new Date()

  const updated: ReviewPackage = {
    ...pkg,
    status: newStatus,
    updated_at: now,
    closed_at: newStatus === 'archived' ? now : pkg.closed_at,
  }

  const auditLog = createReviewPackageAuditLog('status_change', updated, {
    oldStatus,
    newStatus,
    note: `状态变更：${oldStatus} → ${newStatus}`,
  })

  return { package: updated, auditLog }
}

export function exportReviewPackageToJSON(pkg: ReviewPackage): string {
  const data = {
    ...pkg,
    created_at: pkg.created_at.toISOString(),
    updated_at: pkg.updated_at.toISOString(),
    closed_at: pkg.closed_at ? pkg.closed_at.toISOString() : null,
    deadline: pkg.deadline ? pkg.deadline.toISOString() : null,
    event_snapshots: pkg.event_snapshots.map((s) => ({
      ...s,
      reviewed_at: s.reviewed_at ? s.reviewed_at.toISOString() : null,
      closed_at: s.closed_at ? s.closed_at.toISOString() : null,
      first_seen_at: s.first_seen_at.toISOString(),
      last_seen_at: s.last_seen_at.toISOString(),
      snapshotted_at: s.snapshotted_at.toISOString(),
    })),
    remarks: pkg.remarks.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
    })),
  }
  return JSON.stringify(data, null, 2)
}

export function exportReviewPackagesToJSON(packages: ReviewPackage[]): string {
  const data = packages.map((pkg) => ({
    ...pkg,
    created_at: pkg.created_at.toISOString(),
    updated_at: pkg.updated_at.toISOString(),
    closed_at: pkg.closed_at ? pkg.closed_at.toISOString() : null,
    deadline: pkg.deadline ? pkg.deadline.toISOString() : null,
    event_snapshots: pkg.event_snapshots.map((s) => ({
      ...s,
      reviewed_at: s.reviewed_at ? s.reviewed_at.toISOString() : null,
      closed_at: s.closed_at ? s.closed_at.toISOString() : null,
      first_seen_at: s.first_seen_at.toISOString(),
      last_seen_at: s.last_seen_at.toISOString(),
      snapshotted_at: s.snapshotted_at.toISOString(),
    })),
    remarks: pkg.remarks.map((r) => ({
      ...r,
      created_at: r.created_at.toISOString(),
    })),
  }))
  return JSON.stringify({ version: 1, exported_at: new Date().toISOString(), packages: data }, null, 2)
}

export function parseReviewPackageJSON(jsonStr: string): ReviewPackage | null {
  try {
    const parsed = JSON.parse(jsonStr)
    const revived = reviveDates(parsed) as ReviewPackage
    if (!revived.id || !revived.title || !Array.isArray(revived.event_snapshots)) {
      return null
    }
    return revived
  } catch {
    return null
  }
}

export function parseReviewPackagesJSON(jsonStr: string): ReviewPackage[] | null {
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.packages && Array.isArray(parsed.packages)) {
      return parsed.packages.map((p: any) => reviveDates(p) as ReviewPackage)
    }
    const single = parseReviewPackageJSON(jsonStr)
    return single ? [single] : null
  } catch {
    return null
  }
}

export function importReviewPackages(
  jsonStr: string,
  existingPackages: ReviewPackage[]
): ImportReviewPackageResult {
  const result: ImportReviewPackageResult = {
    success: true,
    imported: [],
    skipped: [],
    warnings: [],
    errors: [],
  }

  const parsed = parseReviewPackagesJSON(jsonStr)
  if (!parsed) {
    result.success = false
    result.errors.push('JSON 格式无效，无法解析复盘包数据')
    return result
  }

  const existingIds = new Set(existingPackages.map((p) => p.id))
  const existingTitles = new Set(existingPackages.map((p) => p.title))

  for (const pkg of parsed) {
    const hasIdConflict = existingIds.has(pkg.id)
    const hasTitleConflict = existingTitles.has(pkg.title)

    if (hasIdConflict) {
      result.skipped.push({
        type: 'duplicate_id',
        package_id: pkg.id,
        package_title: pkg.title,
        existing_id: pkg.id,
      })
      result.warnings.push(`复盘包「${pkg.title}」ID 已存在，已跳过`)
      continue
    }

    if (hasTitleConflict) {
      result.skipped.push({
        type: 'duplicate_title',
        package_id: pkg.id,
        package_title: pkg.title,
        existing_title: pkg.title,
      })
      result.warnings.push(`复盘包「${pkg.title}」标题已存在，已跳过`)
      continue
    }

    result.imported.push(pkg)
    existingIds.add(pkg.id)
    existingTitles.add(pkg.title)
  }

  if (result.imported.length === 0 && result.skipped.length > 0) {
    result.success = false
    result.errors.push('所有复盘包均因冲突被跳过，请修改后重新导入')
  }

  return result
}

export function filterReviewPackages(
  packages: ReviewPackage[],
  filters: {
    status?: ReviewPackageStatus
    search?: string
    causeCategory?: ReviewPackageCauseCategory
  }
): ReviewPackage[] {
  return packages.filter((pkg) => {
    if (filters.status && pkg.status !== filters.status) {
      return false
    }
    if (filters.causeCategory && pkg.cause_category !== filters.causeCategory) {
      return false
    }
    if (filters.search && filters.search.trim()) {
      const keyword = filters.search.trim().toLowerCase()
      const searchFields = [
        pkg.title,
        pkg.responsible,
        pkg.handling_suggestion,
        ...pkg.event_snapshots.map((e) => e.title),
        ...pkg.event_snapshots.map((e) => e.customer_id),
      ]
      return searchFields.some((f) => f.toLowerCase().includes(keyword))
    }
    return true
  })
}

export const STATUS_LABEL_MAP: Record<ReviewPackageStatus, string> = {
  draft: '草稿',
  analyzing: '分析中',
  resolved: '已解决',
  archived: '已归档',
}

export const CAUSE_CATEGORY_LABEL_MAP: Record<ReviewPackageCauseCategory, string> = {
  process_issue: '流程问题',
  training_issue: '培训问题',
  system_issue: '系统问题',
  personnel_issue: '人员问题',
  customer_issue: '客户问题',
  other: '其他原因',
}
