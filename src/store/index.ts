import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  CustomerTicket,
  VisitScore,
  Refund,
  QualityRule,
  QualityEvent,
  Evidence,
  ImportRecord,
  EventStatus,
  QualityEventType,
  BatchActionType,
  BatchActionResult,
  BatchActionTarget,
  BatchActionSkipReason,
  BatchOperation,
  AnalysisSnapshot,
  DeletedSnapshot,
  RuleScheme,
  SchemeAuditLog,
  SchemeAuditActionType,
  ReviewPackage,
  ReviewPackageStatus,
  ReviewPackageCauseCategory,
  ReviewPackageAuditLog,
  ImportReviewPackageResult,
  HandoverPackage,
  HandoverPackageStatus,
  HandoverPriority,
  HandoverPackageAuditLog,
  ImportHandoverPackageResult,
  ImportHandoverConflictResolution,
} from '@/types'
import { uid } from '@/utils'
import { runAnalysis } from '@/services/analyzeService'
import { importTicketsFile, importScoresFile, importRefundsFile } from '@/services/importService'
import { generateSampleFiles } from '@/sample/generator'
import { buildExportFilteredEvents, eventsToCSV, eventsToJSON, evidencesToCSV, buildFullBackup, parseFullBackup, downloadBlob } from '@/services/exportService'
import { createSnapshot, generateUniqueSnapshotName, isSnapshotEmpty, snapshotsAreEqual } from '@/services/snapshotService'
import {
  createReviewPackage,
  addRemark,
  updateStatus,
  exportReviewPackagesToJSON,
  importReviewPackages,
  createReviewPackageAuditLog,
} from '@/services/reviewPackageService'
import {
  createHandoverPackage,
  createHandoverEventSnapshot,
  createHandoverAuditLog,
  addCommunicationRecord,
  markAsCompleted,
  undoComplete,
  updateHandoverStatus,
  exportHandoverPackageToJSON,
  exportHandoverPackagesToJSON,
  importHandoverPackages,
  filterHandoverEvents,
  filterHandoverPackages,
} from '@/services/handoverPackageService'
import { parseDate, reviveDates } from '@/utils'
import dayjs from 'dayjs'

const DEFAULT_RULES: QualityRule = {
  timeout_hours: 24,
  min_score: 3,
  repeat_days: 7,
  repeat_count: 3,
  high_refund_amount: 500,
}

const DEFAULT_SCHEME_ID = 'scheme_default'

function createDefaultScheme(): RuleScheme {
  return {
    id: DEFAULT_SCHEME_ID,
    name: '默认方案',
    rules: { ...DEFAULT_RULES },
    is_default: true,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function rulesEqual(a: QualityRule, b: QualityRule): boolean {
  return a.timeout_hours === b.timeout_hours &&
    a.min_score === b.min_score &&
    a.repeat_days === b.repeat_days &&
    a.repeat_count === b.repeat_count &&
    a.high_refund_amount === b.high_refund_amount
}

export interface UIState {
  selectedEventId: string | null
  drawerOpen: boolean
  lastAnalysisAt: Date | null
}

interface AppState {
  tickets: CustomerTicket[]
  scores: VisitScore[]
  refunds: Refund[]
  events: QualityEvent[]
  evidences: Evidence[]
  importRecords: ImportRecord[]
  rules: QualityRule
  uiState: UIState
  lastBatchOperation: BatchOperation | null
  snapshots: AnalysisSnapshot[]
  lastDeletedSnapshot: DeletedSnapshot | null
  schemes: RuleScheme[]
  activeSchemeId: string | null
  schemeAuditLogs: SchemeAuditLog[]
  reviewPackages: ReviewPackage[]
  reviewPackageAuditLogs: ReviewPackageAuditLog[]
  handoverPackages: HandoverPackage[]
  handoverPackageAuditLogs: HandoverPackageAuditLog[]

  setSelectedEvent: (id: string | null) => void
  setDrawerOpen: (open: boolean) => void

  importTickets: (file: File) => Promise<{ success: boolean; warnings: string[]; errors: string[]; record?: ImportRecord }>
  importScores: (file: File) => Promise<{ success: boolean; warnings: string[]; errors: string[]; record?: ImportRecord }>
  importRefunds: (file: File) => Promise<{ success: boolean; warnings: string[]; errors: string[]; record?: ImportRecord }>

  generateSampleData: () => Promise<{ ticketCount: number; scoreCount: number; refundCount: number; eventCount: number }>

  runAnalysis: () => void

  saveRules: (rules: QualityRule) => void

  saveScheme: (name: string) => { success: boolean; scheme?: RuleScheme; error?: string }
  updateScheme: (schemeId: string, rules: QualityRule) => { success: boolean; error?: string }
  loadScheme: (schemeId: string) => { success: boolean; error?: string }
  deleteScheme: (schemeId: string) => { success: boolean; error?: string }
  renameScheme: (schemeId: string, newName: string) => { success: boolean; error?: string }
  getActiveScheme: () => RuleScheme | null
  isSchemeDirty: () => boolean

  getSchemeAuditLogs: () => SchemeAuditLog[]
  getLatestSchemeAuditLog: () => SchemeAuditLog | null
  getSchemeAuditLogsBySchemeId: (schemeId: string) => SchemeAuditLog[]

  updateEventStatus: (eventId: string, status: EventStatus, note?: string) => void
  closeEvent: (eventId: string, note?: string) => void
  batchUpdateStatus: (eventIds: string[], status: EventStatus) => void

  executeBatchAction: (
    eventIds: string[],
    action: BatchActionType,
    note: string,
    expectedStatuses?: Record<string, EventStatus>
  ) => BatchActionResult

  undoLastBatchOperation: () => { success: boolean; restoredCount: number; message: string }
  canUndoBatchOperation: () => boolean

  exportEvents: (filter: { statuses?: EventStatus[]; types?: QualityEventType[]; includeEvidences: boolean }, format: 'csv' | 'json') => void
  exportEvidences: (filter: { statuses?: EventStatus[]; types?: QualityEventType[] }) => void
  exportFullBackup: () => void
  restoreFromBackup: (file: File) => Promise<{ eventCount: number; success: boolean; error?: string; hasSnapshots: boolean; snapshotCount: number; hasAuditLogs: boolean; auditLogCount: number }>

  getEventEvidences: (eventId: string) => Evidence[]

  saveAnalysisSnapshot: (name?: string, description?: string) => { success: boolean; snapshot?: AnalysisSnapshot; error?: string; isDuplicate?: boolean; isEmpty?: boolean }
  deleteSnapshot: (snapshotId: string) => { success: boolean; message: string }
  undoDeleteSnapshot: () => { success: boolean; snapshot?: AnalysisSnapshot; message: string }
  canUndoDeleteSnapshot: () => boolean
  renameSnapshot: (snapshotId: string, newName: string) => { success: boolean; error?: string }

  resetAll: () => void

  createReviewPackage: (
    title: string,
    responsible: string,
    causeCategory: ReviewPackageCauseCategory,
    handlingSuggestion: string,
    deadline: Date | null,
    eventIds: string[]
  ) => { success: boolean; error?: string; pkg?: ReviewPackage }

  getReviewPackage: (id: string) => ReviewPackage | undefined

  updateReviewPackageStatus: (id: string, status: ReviewPackageStatus) => { success: boolean; error?: string }

  addReviewPackageRemark: (id: string, content: string) => { success: boolean; error?: string }

  deleteReviewPackage: (id: string) => { success: boolean; error?: string }

  exportReviewPackages: (ids?: string[]) => void

  importReviewPackages: (file: File) => Promise<ImportReviewPackageResult>

  getReviewPackageAuditLogs: () => ReviewPackageAuditLog[]

  getReviewPackageAuditLogsByPackageId: (packageId: string) => ReviewPackageAuditLog[]

  createHandoverPackage: (
    title: string,
    assignee: string,
    deadline: Date | null,
    priority: HandoverPriority,
    description: string,
    eventIds: string[]
  ) => { success: boolean; error?: string; pkg?: HandoverPackage }

  getHandoverPackage: (id: string) => HandoverPackage | undefined

  updateHandoverPackageStatus: (id: string, status: HandoverPackageStatus) => { success: boolean; error?: string }

  addHandoverCommunicationRecord: (id: string, content: string) => { success: boolean; error?: string }

  markHandoverAsCompleted: (id: string) => { success: boolean; error?: string }

  undoHandoverComplete: (id: string, reason: string) => { success: boolean; error?: string }

  deleteHandoverPackage: (id: string) => { success: boolean; error?: string }

  exportHandoverPackages: (ids?: string[]) => void

  importHandoverPackages: (
    file: File,
    conflictResolutions?: Record<string, ImportHandoverConflictResolution>
  ) => Promise<ImportHandoverPackageResult>

  getHandoverPackageAuditLogs: () => HandoverPackageAuditLog[]

  getHandoverPackageAuditLogsByPackageId: (packageId: string) => HandoverPackageAuditLog[]

  filterHandoverEvents: typeof filterHandoverEvents

  filterHandoverPackages: typeof filterHandoverPackages
}

function textToFile(text: string, filename: string, type: string): File {
  const blob = new Blob([text], { type })
  return new File([blob], filename, { type })
}

const dateAwareStorage = {
  ...createJSONStorage(() => localStorage),
  getItem: async (name: string) => {
    const raw = localStorage.getItem(name)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return reviveDates(parsed)
    } catch {
      return null
    }
  },
}

const BATCH_ACTION_STATUS_MAP: Record<BatchActionType, EventStatus> = {
  confirm: 'closed',
  ignore: 'closed',
  reopen: 'pending',
}

const OPERATOR = '当前用户'

function createSchemeAuditLog(
  action: SchemeAuditActionType,
  scheme: RuleScheme,
  options: {
    oldRules?: QualityRule
    newRules?: QualityRule
    oldName?: string
    newName?: string
    note?: string
  } = {}
): SchemeAuditLog {
  return {
    id: uid('audit'),
    action,
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    operator: OPERATOR,
    operated_at: new Date(),
    old_rules: options.oldRules ? { ...options.oldRules } : undefined,
    new_rules: options.newRules ? { ...options.newRules } : undefined,
    old_name: options.oldName,
    new_name: options.newName,
    note: options.note,
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      tickets: [],
      scores: [],
      refunds: [],
      events: [],
      evidences: [],
      importRecords: [],
      rules: { ...DEFAULT_RULES },
      uiState: {
        selectedEventId: null,
        drawerOpen: false,
        lastAnalysisAt: null,
      },
      lastBatchOperation: null,
      snapshots: [],
      lastDeletedSnapshot: null,
      schemes: [createDefaultScheme()],
      activeSchemeId: DEFAULT_SCHEME_ID,
      schemeAuditLogs: [],
      reviewPackages: [],
      reviewPackageAuditLogs: [],
      handoverPackages: [],
      handoverPackageAuditLogs: [],

      setSelectedEvent: (id) => set((s) => ({ uiState: { ...s.uiState, selectedEventId: id, drawerOpen: id !== null } })),
      setDrawerOpen: (open) => set((s) => ({ uiState: { ...s.uiState, drawerOpen: open } })),

      importTickets: async (file) => {
        const { tickets, importRecords, rules } = get()
        const result = await importTicketsFile(file, tickets)
        if (result.newTickets.length > 0) {
          const newTickets = [...tickets, ...result.newTickets]
          const newRecords = result.record ? [...importRecords, result.record] : importRecords
          const { events, evidences } = runAnalysis(newTickets, get().scores, get().refunds, rules)
          set({
            tickets: newTickets,
            importRecords: newRecords,
            events,
            evidences,
            uiState: { ...get().uiState, lastAnalysisAt: new Date() },
          })
        } else if (result.record) {
          set({ importRecords: [...importRecords, result.record] })
        }
        return { success: result.success, warnings: result.warnings, errors: result.errors, record: result.record }
      },

      importScores: async (file) => {
        const { scores, importRecords, rules } = get()
        const result = await importScoresFile(file, scores)
        if (result.newScores.length > 0) {
          const newScores = [...scores, ...result.newScores]
          const newRecords = result.record ? [...importRecords, result.record] : importRecords
          const { events, evidences } = runAnalysis(get().tickets, newScores, get().refunds, rules)
          set({
            scores: newScores,
            importRecords: newRecords,
            events,
            evidences,
            uiState: { ...get().uiState, lastAnalysisAt: new Date() },
          })
        } else if (result.record) {
          set({ importRecords: [...importRecords, result.record] })
        }
        return { success: result.success, warnings: result.warnings, errors: result.errors, record: result.record }
      },

      importRefunds: async (file) => {
        const { refunds, importRecords, rules } = get()
        const result = await importRefundsFile(file, refunds, importRecords)
        if (result.newRefunds.length > 0) {
          const newRefunds = [...refunds, ...result.newRefunds]
          const newRecords = result.record ? [...importRecords, result.record] : importRecords
          const { events, evidences } = runAnalysis(get().tickets, get().scores, newRefunds, rules)
          set({
            refunds: newRefunds,
            importRecords: newRecords,
            events,
            evidences,
            uiState: { ...get().uiState, lastAnalysisAt: new Date() },
          })
        } else if (result.record) {
          set({ importRecords: [...importRecords, result.record] })
        }
        return { success: result.success, warnings: result.warnings, errors: result.errors, record: result.record }
      },

      generateSampleData: async () => {
        const samples = generateSampleFiles()
        const ticketFile = textToFile(samples.ticketsCSV, samples.ticketsName, 'text/csv')
        const scoreFile = textToFile(samples.scoresCSV, samples.scoresName, 'text/csv')
        const refundFile = textToFile(samples.refundsJSON, samples.refundsName, 'application/json')

        const { tickets: oldT, scores: oldS, refunds: oldR, rules } = get()
        const tResult = await importTicketsFile(ticketFile, oldT)
        const sResult = await importScoresFile(scoreFile, oldS)
        const rResult = await importRefundsFile(refundFile, oldR, get().importRecords)

        const newTickets = [...oldT, ...tResult.newTickets]
        const newScores = [...oldS, ...sResult.newScores]
        const newRefunds = [...oldR, ...rResult.newRefunds]
        const newRecords = [...get().importRecords]
        if (tResult.record) newRecords.push(tResult.record)
        if (sResult.record) newRecords.push(sResult.record)
        if (rResult.record) newRecords.push(rResult.record)

        const { events, evidences } = runAnalysis(newTickets, newScores, newRefunds, rules)
        set({
          tickets: newTickets,
          scores: newScores,
          refunds: newRefunds,
          importRecords: newRecords,
          events,
          evidences,
          uiState: { ...get().uiState, lastAnalysisAt: new Date() },
        })

        return {
          ticketCount: tResult.newTickets.length,
          scoreCount: sResult.newScores.length,
          refundCount: rResult.newRefunds.length,
          eventCount: events.length,
        }
      },

      runAnalysis: () => {
        const { tickets, scores, refunds, rules } = get()
        const { events, evidences } = runAnalysis(tickets, scores, refunds, rules)
        set({ events, evidences, uiState: { ...get().uiState, lastAnalysisAt: new Date() } })
      },

      saveRules: (rules) => {
        set({ rules: { ...rules } })
        get().runAnalysis()
      },

      saveScheme: (name) => {
        const trimmed = name.trim()
        if (!trimmed) {
          return { success: false, error: '方案名称不能为空' }
        }
        const { schemes, rules } = get()
        if (schemes.some((s) => s.name === trimmed)) {
          return { success: false, error: '已存在同名方案，请使用其他名称' }
        }
        const now = new Date()
        const newScheme: RuleScheme = {
          id: uid('scheme'),
          name: trimmed,
          rules: { ...rules },
          is_default: false,
          created_at: now,
          updated_at: now,
        }
        const auditLog = createSchemeAuditLog('create', newScheme, {
          newRules: rules,
          note: '新建方案',
        })
        set((s) => ({
          schemes: [...s.schemes, newScheme],
          activeSchemeId: newScheme.id,
          schemeAuditLogs: [auditLog, ...s.schemeAuditLogs],
        }))
        return { success: true, scheme: newScheme }
      },

      updateScheme: (schemeId, rules) => {
        const { schemes } = get()
        const scheme = schemes.find((s) => s.id === schemeId)
        if (!scheme) {
          return { success: false, error: '方案不存在' }
        }
        const oldRules = { ...scheme.rules }
        const now = new Date()
        const updatedScheme = { ...scheme, rules: { ...rules }, updated_at: now }
        const auditLog = createSchemeAuditLog('update', updatedScheme, {
          oldRules,
          newRules: rules,
          note: '更新方案规则',
        })
        set((s) => ({
          schemes: s.schemes.map((sc) =>
            sc.id === schemeId ? updatedScheme : sc
          ),
          rules: { ...rules },
          schemeAuditLogs: [auditLog, ...s.schemeAuditLogs],
        }))
        get().runAnalysis()
        return { success: true }
      },

      loadScheme: (schemeId) => {
        const { schemes, activeSchemeId } = get()
        const scheme = schemes.find((s) => s.id === schemeId)
        if (!scheme) {
          return { success: false, error: '方案不存在' }
        }
        const oldActiveScheme = schemes.find((s) => s.id === activeSchemeId)
        const auditLog = createSchemeAuditLog('switch', scheme, {
          oldRules: oldActiveScheme?.rules,
          newRules: scheme.rules,
          note: oldActiveScheme ? `从方案「${oldActiveScheme.name}」切换` : '切换方案',
        })
        set({
          rules: { ...scheme.rules },
          activeSchemeId: schemeId,
          schemeAuditLogs: [auditLog, ...get().schemeAuditLogs],
        })
        get().runAnalysis()
        return { success: true }
      },

      deleteScheme: (schemeId) => {
        const { schemes, activeSchemeId } = get()
        const scheme = schemes.find((s) => s.id === schemeId)
        if (!scheme) {
          return { success: false, error: '方案不存在' }
        }
        if (scheme.is_default) {
          return { success: false, error: '默认方案不能被删除' }
        }
        const auditLog = createSchemeAuditLog('delete', scheme, {
          oldRules: scheme.rules,
          note: '删除方案',
        })
        const newSchemes = schemes.filter((s) => s.id !== schemeId)
        const newActiveId = activeSchemeId === schemeId ? DEFAULT_SCHEME_ID : activeSchemeId
        const newActiveScheme = newSchemes.find((s) => s.id === newActiveId)
        set((s) => ({
          schemes: newSchemes,
          activeSchemeId: newActiveId,
          rules: activeSchemeId === schemeId && newActiveScheme ? { ...newActiveScheme.rules } : s.rules,
          schemeAuditLogs: [auditLog, ...s.schemeAuditLogs],
        }))
        if (activeSchemeId === schemeId) {
          get().runAnalysis()
        }
        return { success: true }
      },

      renameScheme: (schemeId, newName) => {
        const trimmed = newName.trim()
        if (!trimmed) {
          return { success: false, error: '方案名称不能为空' }
        }
        const { schemes } = get()
        if (schemes.some((s) => s.id !== schemeId && s.name === trimmed)) {
          return { success: false, error: '已存在同名方案，请使用其他名称' }
        }
        const oldScheme = schemes.find((s) => s.id === schemeId)
        if (!oldScheme) {
          return { success: false, error: '方案不存在' }
        }
        const oldName = oldScheme.name
        const updatedScheme = { ...oldScheme, name: trimmed, updated_at: new Date() }
        const auditLog = createSchemeAuditLog('rename', updatedScheme, {
          oldName,
          newName: trimmed,
          note: `重命名方案：「${oldName}」→「${trimmed}」`,
        })
        set((s) => ({
          schemes: s.schemes.map((sc) =>
            sc.id === schemeId ? updatedScheme : sc
          ),
          schemeAuditLogs: [auditLog, ...s.schemeAuditLogs],
        }))
        return { success: true }
      },

      getActiveScheme: () => {
        const { schemes, activeSchemeId } = get()
        return schemes.find((s) => s.id === activeSchemeId) || null
      },

      isSchemeDirty: () => {
        const { rules, schemes, activeSchemeId } = get()
        const active = schemes.find((s) => s.id === activeSchemeId)
        if (!active) return true
        return !rulesEqual(rules, active.rules)
      },

      getSchemeAuditLogs: () => {
        return get().schemeAuditLogs
      },

      getLatestSchemeAuditLog: () => {
        const logs = get().schemeAuditLogs
        return logs.length > 0 ? logs[0] : null
      },

      getSchemeAuditLogsBySchemeId: (schemeId) => {
        return get().schemeAuditLogs.filter((log) => log.scheme_id === schemeId)
      },

      updateEventStatus: (eventId, status, note) => {
        const now = new Date()
        set((s) => ({
          events: s.events.map((e) =>
            e.id === eventId
              ? {
                  ...e,
                  status,
                  review_note: note !== undefined ? note : e.review_note,
                  reviewed_at: status === 'reviewing' || status === 'closed' ? now : e.reviewed_at,
                  closed_at: status === 'closed' ? now : e.closed_at,
                }
              : e
          ),
        }))
      },

      closeEvent: (eventId, note) => {
        const now = new Date()
        set((s) => ({
          events: s.events.map((e) =>
            e.id === eventId
              ? {
                  ...e,
                  status: 'closed',
                  review_note: note !== undefined ? note : e.review_note,
                  reviewed_at: e.reviewed_at || now,
                  closed_at: now,
                }
              : e
          ),
        }))
      },

      batchUpdateStatus: (eventIds, status) => {
        const now = new Date()
        const idSet = new Set(eventIds)
        set((s) => ({
          events: s.events.map((e) =>
            idSet.has(e.id)
              ? {
                  ...e,
                  status,
                  reviewed_at: status === 'reviewing' || status === 'closed' ? now : e.reviewed_at,
                  closed_at: status === 'closed' ? now : e.closed_at,
                }
              : e
          ),
        }))
      },

      executeBatchAction: (eventIds, action, note, expectedStatuses) => {
        const now = new Date()
        const operationId = uid()
        const targetStatus = BATCH_ACTION_STATUS_MAP[action]
        const { events } = get()

        const targets: BatchActionTarget[] = []
        const skipped: BatchActionSkipReason[] = []

        for (const id of eventIds) {
          const event = events.find((e) => e.id === id)

          if (!event) {
            skipped.push({ id, reason: 'not_found' })
            continue
          }

          if (event.status === 'closed') {
            skipped.push({
              id,
              reason: 'already_closed',
              expectedStatus: expectedStatuses?.[id],
              actualStatus: event.status,
            })
            continue
          }

          if (expectedStatuses && expectedStatuses[id] !== undefined && expectedStatuses[id] !== event.status) {
            skipped.push({
              id,
              reason: 'status_changed',
              expectedStatus: expectedStatuses[id],
              actualStatus: event.status,
            })
            continue
          }

          targets.push({
            id: event.id,
            originalStatus: event.status,
            originalNote: event.review_note,
            originalReviewedAt: event.reviewed_at,
            originalClosedAt: event.closed_at,
          })
        }

        const targetIdSet = new Set(targets.map((t) => t.id))

        set((s) => ({
          events: s.events.map((e) => {
            if (!targetIdSet.has(e.id)) return e
            const hasNote = note && note.trim().length > 0
            let newReviewedAt: Date | null = e.reviewed_at
            let newClosedAt: Date | null = e.closed_at

            if (targetStatus === 'closed') {
              newReviewedAt = now
              newClosedAt = now
            } else if (targetStatus === 'reviewing') {
              newReviewedAt = now
              newClosedAt = null
            } else if (targetStatus === 'pending') {
              newClosedAt = null
            }

            return {
              ...e,
              status: targetStatus,
              review_note: hasNote ? note.trim() : e.review_note,
              reviewed_at: newReviewedAt,
              closed_at: newClosedAt,
            }
          }),
          lastBatchOperation: {
            id: operationId,
            action,
            targetStatus,
            note,
            targets: [...targets],
            executedAt: now,
          },
        }))

        return {
          action,
          targetStatus,
          totalRequested: eventIds.length,
          successCount: targets.length,
          skipCount: skipped.length,
          skipped,
          targets,
          note,
          executedAt: now,
          operationId,
        }
      },

      undoLastBatchOperation: () => {
        const { lastBatchOperation } = get()

        if (!lastBatchOperation) {
          return { success: false, restoredCount: 0, message: '没有可撤销的批量操作' }
        }

        const { targets } = lastBatchOperation
        const targetIdSet = new Set(targets.map((t) => t.id))

        set((s) => ({
          events: s.events.map((e) => {
            if (!targetIdSet.has(e.id)) return e
            const target = targets.find((t) => t.id === e.id)
            if (!target) return e
            return {
              ...e,
              status: target.originalStatus,
              review_note: target.originalNote,
              reviewed_at: target.originalReviewedAt,
              closed_at: target.originalClosedAt,
            }
          }),
          lastBatchOperation: null,
        }))

        return {
          success: true,
          restoredCount: targets.length,
          message: `已撤销批量操作，恢复了 ${targets.length} 条事件的状态`,
        }
      },

      canUndoBatchOperation: () => {
        return get().lastBatchOperation !== null
      },

      exportEvents: (filter, format) => {
        const { events, evidences, rules } = get()
        const activeScheme = get().getActiveScheme()
        const latestAuditLog = get().getLatestSchemeAuditLog()
        const schemeInfo = activeScheme ? {
          scheme_name: activeScheme.name,
          scheme_id: activeScheme.id,
          scheme_created_at: activeScheme.created_at.toISOString(),
          scheme_updated_at: activeScheme.updated_at.toISOString(),
          timeout_hours: rules.timeout_hours,
          min_score: rules.min_score,
          repeat_days: rules.repeat_days,
          repeat_count: rules.repeat_count,
          high_refund_amount: rules.high_refund_amount,
          is_dirty: get().isSchemeDirty(),
          latest_audit_action: latestAuditLog?.action,
          latest_audit_at: latestAuditLog?.operated_at.toISOString(),
          latest_audit_operator: latestAuditLog?.operator,
          latest_audit_note: latestAuditLog?.note,
        } : undefined
        const { filteredEvents, filteredEvidences } = buildExportFilteredEvents(events, evidences, filter)
        const ts = dayjs().format('YYYYMMDD_HHmmss')
        if (format === 'csv') {
          const csv = eventsToCSV(filteredEvents, schemeInfo)
          downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `events_${ts}.csv`)
        } else {
          const json = eventsToJSON(filteredEvents, filteredEvidences, filter.includeEvidences, schemeInfo)
          downloadBlob(new Blob([json], { type: 'application/json' }), `events_${ts}.json`)
        }
      },

      exportEvidences: (filter) => {
        const { events, evidences } = get()
        const { filteredEvidences } = buildExportFilteredEvents(events, evidences, { ...filter, includeEvidences: true })
        const csv = evidencesToCSV(filteredEvidences)
        const ts = dayjs().format('YYYYMMDD_HHmmss')
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `evidences_${ts}.csv`)
      },

      exportFullBackup: () => {
        const state = get()
        const backup = buildFullBackup({
          tickets: state.tickets.map((t) => ({
            ...t,
            created_at: t.created_at.toISOString(),
            resolved_at: t.resolved_at ? t.resolved_at.toISOString() : null,
          })),
          scores: state.scores.map((s) => ({ ...s, visited_at: s.visited_at.toISOString() })),
          refunds: state.refunds.map((r) => ({ ...r, refunded_at: r.refunded_at.toISOString() })),
          events: state.events.map((e) => ({
            ...e,
            reviewed_at: e.reviewed_at ? e.reviewed_at.toISOString() : null,
            closed_at: e.closed_at ? e.closed_at.toISOString() : null,
            first_seen_at: e.first_seen_at.toISOString(),
            last_seen_at: e.last_seen_at.toISOString(),
          })),
          evidences: state.evidences.map((ev) => ({ ...ev, occurred_at: ev.occurred_at.toISOString() })),
          importRecords: state.importRecords.map((r) => ({ ...r, imported_at: r.imported_at.toISOString() })),
          rules: state.rules,
          lastBatchOperation: state.lastBatchOperation
            ? {
                ...state.lastBatchOperation,
                executedAt: state.lastBatchOperation.executedAt.toISOString(),
                targets: state.lastBatchOperation.targets.map((t) => ({
                  ...t,
                  originalReviewedAt: t.originalReviewedAt?.toISOString() || null,
                  originalClosedAt: t.originalClosedAt?.toISOString() || null,
                })),
              }
            : null,
          snapshots: state.snapshots.map((snap) => ({
            ...snap,
            created_at: snap.created_at.toISOString(),
            scheme_created_at: snap.scheme_created_at ? snap.scheme_created_at.toISOString() : null,
          })),
          lastDeletedSnapshot: state.lastDeletedSnapshot
            ? {
                ...state.lastDeletedSnapshot,
                deleted_at: state.lastDeletedSnapshot.deleted_at.toISOString(),
                snapshot: {
                  ...state.lastDeletedSnapshot.snapshot,
                  created_at: state.lastDeletedSnapshot.snapshot.created_at.toISOString(),
                  scheme_created_at: state.lastDeletedSnapshot.snapshot.scheme_created_at ? state.lastDeletedSnapshot.snapshot.scheme_created_at.toISOString() : null,
                },
              }
            : null,
          schemes: state.schemes.map((sc) => ({
            ...sc,
            created_at: sc.created_at.toISOString(),
            updated_at: sc.updated_at.toISOString(),
          })),
          activeSchemeId: state.activeSchemeId,
          schemeAuditLogs: state.schemeAuditLogs.map((log) => ({
            ...log,
            operated_at: log.operated_at.toISOString(),
          })),
          reviewPackages: state.reviewPackages.map((pkg) => ({
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
          })),
          reviewPackageAuditLogs: state.reviewPackageAuditLogs.map((log) => ({
            ...log,
            operated_at: log.operated_at.toISOString(),
          })),
          handoverPackages: state.handoverPackages.map((pkg) => ({
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
          })),
          handoverPackageAuditLogs: state.handoverPackageAuditLogs.map((log) => ({
            ...log,
            operated_at: log.operated_at.toISOString(),
          })),
        })
        const ts = dayjs().format('YYYYMMDD_HHmmss')
        downloadBlob(new Blob([backup], { type: 'application/json' }), `full_backup_${ts}.json`)
      },

      restoreFromBackup: async (file) => {
        try {
          const text = await file.text()
          const parsed = parseFullBackup(text)
          if (!parsed) return { eventCount: 0, success: false, error: '备份文件格式无效', hasSnapshots: false, snapshotCount: 0, hasAuditLogs: false, auditLogCount: 0 }

          const s = reviveDates(parsed) as any
          const tickets: CustomerTicket[] = s.tickets || []
          const scores: VisitScore[] = s.scores || []
          const refunds: Refund[] = s.refunds || []
          const events: QualityEvent[] = s.events || []
          const evidences: Evidence[] = s.evidences || []
          const importRecords: ImportRecord[] = s.importRecords || []
          const rules: QualityRule = s.rules || { ...DEFAULT_RULES }
          const lastBatchOperation: BatchOperation | null = s.lastBatchOperation || null
          const snapshots: AnalysisSnapshot[] = s.snapshots || []
          const lastDeletedSnapshot: DeletedSnapshot | null = s.lastDeletedSnapshot || null
          const restoredSchemes: RuleScheme[] = s.schemes || []
          const restoredActiveSchemeId: string | null = s.activeSchemeId || null
          const restoredAuditLogs: SchemeAuditLog[] = s.schemeAuditLogs || []
          const restoredReviewPackages: ReviewPackage[] = s.reviewPackages || []
          const restoredReviewPackageAuditLogs: ReviewPackageAuditLog[] = s.reviewPackageAuditLogs || []
          const restoredHandoverPackages: HandoverPackage[] = s.handoverPackages || []
          const restoredHandoverPackageAuditLogs: HandoverPackageAuditLog[] = s.handoverPackageAuditLogs || []

          const hasDefaultScheme = restoredSchemes.some((sc: RuleScheme) => sc.is_default)
          const schemes = hasDefaultScheme ? restoredSchemes : [createDefaultScheme(), ...restoredSchemes]
          const activeSchemeId = restoredActiveSchemeId && schemes.some((sc: RuleScheme) => sc.id === restoredActiveSchemeId)
            ? restoredActiveSchemeId
            : DEFAULT_SCHEME_ID

          set({
            tickets,
            scores,
            refunds,
            events,
            evidences,
            importRecords,
            rules,
            lastBatchOperation,
            snapshots,
            lastDeletedSnapshot,
            schemes,
            activeSchemeId,
            schemeAuditLogs: restoredAuditLogs,
            reviewPackages: restoredReviewPackages,
            reviewPackageAuditLogs: restoredReviewPackageAuditLogs,
            handoverPackages: restoredHandoverPackages,
            handoverPackageAuditLogs: restoredHandoverPackageAuditLogs,
          })
          return {
            eventCount: events.length,
            success: true,
            hasSnapshots: snapshots.length > 0,
            snapshotCount: snapshots.length,
            hasAuditLogs: restoredAuditLogs.length > 0,
            auditLogCount: restoredAuditLogs.length,
            hasReviewPackages: restoredReviewPackages.length > 0,
            reviewPackageCount: restoredReviewPackages.length,
            hasHandoverPackages: restoredHandoverPackages.length > 0,
            handoverPackageCount: restoredHandoverPackages.length,
          }
        } catch (e: any) {
          return {
            eventCount: 0,
            success: false,
            error: e?.message || '恢复失败',
            hasSnapshots: false,
            snapshotCount: 0,
            hasAuditLogs: false,
            auditLogCount: 0,
            hasReviewPackages: false,
            reviewPackageCount: 0,
            hasHandoverPackages: false,
            handoverPackageCount: 0,
          }
        }
      },

      getEventEvidences: (eventId) => {
        return get().evidences.filter((ev) => ev.event_id === eventId)
      },

      saveAnalysisSnapshot: (name, description) => {
        const { events, rules, importRecords, snapshots } = get()
        const activeScheme = get().getActiveScheme()

        const existingNames = snapshots.map((s) => s.name)
        const snapshotName = generateUniqueSnapshotName(existingNames, name)

        const newSnapshot = createSnapshot(snapshotName, description, events, rules, importRecords, activeScheme ? {
          scheme_id: activeScheme.id,
          scheme_name: activeScheme.name,
          scheme_created_at: activeScheme.created_at,
        } : undefined)

        if (isSnapshotEmpty(newSnapshot)) {
          return { success: false, error: '当前没有数据和事件，无法保存空快照', isEmpty: true }
        }

        for (const existing of snapshots) {
          if (snapshotsAreEqual(existing, newSnapshot)) {
            return { success: false, snapshot: existing, error: '当前状态与已有快照内容相同', isDuplicate: true }
          }
        }

        set((s) => ({
          snapshots: [newSnapshot, ...s.snapshots],
        }))

        return { success: true, snapshot: newSnapshot }
      },

      deleteSnapshot: (snapshotId) => {
        const { snapshots } = get()
        const snapshot = snapshots.find((s) => s.id === snapshotId)

        if (!snapshot) {
          return { success: false, message: '快照不存在' }
        }

        const deleted: DeletedSnapshot = {
          snapshot,
          deleted_at: new Date(),
        }

        set((s) => ({
          snapshots: s.snapshots.filter((snap) => snap.id !== snapshotId),
          lastDeletedSnapshot: deleted,
        }))

        return { success: true, message: `已删除快照「${snapshot.name}」` }
      },

      undoDeleteSnapshot: () => {
        const { lastDeletedSnapshot } = get()

        if (!lastDeletedSnapshot) {
          return { success: false, message: '没有可撤销的删除操作' }
        }

        const { snapshot } = lastDeletedSnapshot

        set((s) => ({
          snapshots: [snapshot, ...s.snapshots].sort(
            (a, b) => b.created_at.getTime() - a.created_at.getTime()
          ),
          lastDeletedSnapshot: null,
        }))

        return { success: true, snapshot, message: `已恢复快照「${snapshot.name}」` }
      },

      canUndoDeleteSnapshot: () => {
        return get().lastDeletedSnapshot !== null
      },

      renameSnapshot: (snapshotId, newName) => {
        const trimmedName = newName.trim()
        if (!trimmedName) {
          return { success: false, error: '快照名称不能为空' }
        }

        const { snapshots } = get()
        const existing = snapshots.find((s) => s.id !== snapshotId && s.name === trimmedName)
        if (existing) {
          return { success: false, error: '已存在同名快照，请使用其他名称' }
        }

        set((s) => ({
          snapshots: s.snapshots.map((snap) =>
            snap.id === snapshotId ? { ...snap, name: trimmedName } : snap
          ),
        }))

        return { success: true }
      },

      createReviewPackage: (title, responsible, causeCategory, handlingSuggestion, deadline, eventIds) => {
        const trimmedTitle = title.trim()
        if (!trimmedTitle) {
          return { success: false, error: '复盘包标题不能为空' }
        }
        if (!responsible.trim()) {
          return { success: false, error: '负责人不能为空' }
        }
        if (eventIds.length === 0) {
          return { success: false, error: '请至少选择一个质量事件' }
        }

        const { events, reviewPackages } = get()
        const existingTitle = reviewPackages.find((p) => p.title === trimmedTitle)
        if (existingTitle) {
          return { success: false, error: '已存在同名复盘包，请使用其他标题' }
        }

        const selectedEvents = events.filter((e) => eventIds.includes(e.id))
        if (selectedEvents.length !== eventIds.length) {
          const missing = eventIds.filter((id) => !events.find((e) => e.id === id))
          return { success: false, error: `部分事件不存在：${missing.join(', ')}` }
        }

        const pkg = createReviewPackage(
          trimmedTitle,
          responsible,
          causeCategory,
          handlingSuggestion,
          deadline,
          selectedEvents
        )

        const auditLog = createReviewPackageAuditLog('create', pkg, {
          note: `创建复盘包，包含 ${selectedEvents.length} 个事件`,
        })

        set((s) => ({
          reviewPackages: [pkg, ...s.reviewPackages],
          reviewPackageAuditLogs: [auditLog, ...s.reviewPackageAuditLogs],
        }))

        return { success: true, pkg }
      },

      getReviewPackage: (id) => {
        return get().reviewPackages.find((p) => p.id === id)
      },

      updateReviewPackageStatus: (id, status) => {
        const { reviewPackages } = get()
        const pkg = reviewPackages.find((p) => p.id === id)
        if (!pkg) {
          return { success: false, error: '复盘包不存在' }
        }
        if (pkg.status === status) {
          return { success: false, error: '状态未变化' }
        }

        const { package: updated, auditLog } = updateStatus(pkg, status)

        set((s) => ({
          reviewPackages: s.reviewPackages.map((p) => (p.id === id ? updated : p)),
          reviewPackageAuditLogs: [auditLog, ...s.reviewPackageAuditLogs],
        }))

        return { success: true }
      },

      addReviewPackageRemark: (id, content) => {
        const trimmedContent = content.trim()
        if (!trimmedContent) {
          return { success: false, error: '备注内容不能为空' }
        }

        const { reviewPackages } = get()
        const pkg = reviewPackages.find((p) => p.id === id)
        if (!pkg) {
          return { success: false, error: '复盘包不存在' }
        }

        const { package: updated, auditLog } = addRemark(pkg, trimmedContent)

        set((s) => ({
          reviewPackages: s.reviewPackages.map((p) => (p.id === id ? updated : p)),
          reviewPackageAuditLogs: [auditLog, ...s.reviewPackageAuditLogs],
        }))

        return { success: true }
      },

      deleteReviewPackage: (id) => {
        const { reviewPackages } = get()
        const pkg = reviewPackages.find((p) => p.id === id)
        if (!pkg) {
          return { success: false, error: '复盘包不存在' }
        }

        const auditLog = createReviewPackageAuditLog('delete', pkg, {
          note: '删除复盘包',
        })

        set((s) => ({
          reviewPackages: s.reviewPackages.filter((p) => p.id !== id),
          reviewPackageAuditLogs: [auditLog, ...s.reviewPackageAuditLogs],
        }))

        return { success: true }
      },

      exportReviewPackages: (ids) => {
        const { reviewPackages } = get()
        let packagesToExport = reviewPackages
        if (ids && ids.length > 0) {
          packagesToExport = reviewPackages.filter((p) => ids.includes(p.id))
        }
        if (packagesToExport.length === 0) {
          return
        }
        const json = exportReviewPackagesToJSON(packagesToExport)
        const ts = dayjs().format('YYYYMMDD_HHmmss')
        const filename = ids && ids.length === 1
          ? `review_package_${packagesToExport[0].title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${ts}.json`
          : `review_packages_${ts}.json`
        downloadBlob(new Blob([json], { type: 'application/json' }), filename)
      },

      importReviewPackages: async (file) => {
        const text = await file.text()
        const { reviewPackages } = get()
        const result = importReviewPackages(text, reviewPackages)

        if (result.imported.length > 0) {
          const auditLogs = result.imported.map((pkg) =>
            createReviewPackageAuditLog('import', pkg, {
              importSource: file.name,
              note: `从文件 ${file.name} 导入复盘包`,
            })
          )

          set((s) => ({
            reviewPackages: [...result.imported, ...s.reviewPackages],
            reviewPackageAuditLogs: [...auditLogs, ...s.reviewPackageAuditLogs],
          }))
        }

        return result
      },

      getReviewPackageAuditLogs: () => {
        return get().reviewPackageAuditLogs
      },

      getReviewPackageAuditLogsByPackageId: (packageId) => {
        return get().reviewPackageAuditLogs.filter((log) => log.package_id === packageId)
      },

      createHandoverPackage: (title, assignee, deadline, priority, description, eventIds) => {
        const trimmedTitle = title.trim()
        if (!trimmedTitle) {
          return { success: false, error: '交接包标题不能为空' }
        }
        if (!assignee.trim()) {
          return { success: false, error: '接手人不能为空' }
        }
        if (eventIds.length === 0) {
          return { success: false, error: '请至少选择一个质量事件' }
        }

        const { events, handoverPackages } = get()
        const existingTitle = handoverPackages.find((p) => p.title === trimmedTitle)
        if (existingTitle) {
          return { success: false, error: '已存在同名交接包，请使用其他标题' }
        }

        const selectedEvents = events.filter((e) => eventIds.includes(e.id))
        if (selectedEvents.length !== eventIds.length) {
          const missing = eventIds.filter((id) => !events.find((e) => e.id === id))
          return { success: false, error: `部分事件不存在：${missing.join(', ')}` }
        }

        const pkg = createHandoverPackage(
          trimmedTitle,
          assignee,
          deadline,
          priority,
          description,
          selectedEvents
        )

        const auditLog = createHandoverAuditLog('create', pkg, {
          note: `创建交接包，包含 ${selectedEvents.length} 个事件`,
        })

        set((s) => ({
          handoverPackages: [pkg, ...s.handoverPackages],
          handoverPackageAuditLogs: [auditLog, ...s.handoverPackageAuditLogs],
        }))

        return { success: true, pkg }
      },

      getHandoverPackage: (id) => {
        return get().handoverPackages.find((p) => p.id === id)
      },

      updateHandoverPackageStatus: (id, status) => {
        const { handoverPackages } = get()
        const pkg = handoverPackages.find((p) => p.id === id)
        if (!pkg) {
          return { success: false, error: '交接包不存在' }
        }
        if (pkg.status === status) {
          return { success: false, error: '状态未变化' }
        }

        const { package: updated, auditLog } = updateHandoverStatus(pkg, status)

        set((s) => ({
          handoverPackages: s.handoverPackages.map((p) => (p.id === id ? updated : p)),
          handoverPackageAuditLogs: [auditLog, ...s.handoverPackageAuditLogs],
        }))

        return { success: true }
      },

      addHandoverCommunicationRecord: (id, content) => {
        const trimmedContent = content.trim()
        if (!trimmedContent) {
          return { success: false, error: '沟通记录内容不能为空' }
        }

        const { handoverPackages } = get()
        const pkg = handoverPackages.find((p) => p.id === id)
        if (!pkg) {
          return { success: false, error: '交接包不存在' }
        }

        const { package: updated, auditLog } = addCommunicationRecord(pkg, trimmedContent)

        set((s) => ({
          handoverPackages: s.handoverPackages.map((p) => (p.id === id ? updated : p)),
          handoverPackageAuditLogs: [auditLog, ...s.handoverPackageAuditLogs],
        }))

        return { success: true }
      },

      markHandoverAsCompleted: (id) => {
        const { handoverPackages } = get()
        const pkg = handoverPackages.find((p) => p.id === id)
        if (!pkg) {
          return { success: false, error: '交接包不存在' }
        }
        if (pkg.status === 'completed') {
          return { success: false, error: '交接包已是已完成状态' }
        }

        const { package: updated, auditLog } = markAsCompleted(pkg)

        set((s) => ({
          handoverPackages: s.handoverPackages.map((p) => (p.id === id ? updated : p)),
          handoverPackageAuditLogs: [auditLog, ...s.handoverPackageAuditLogs],
        }))

        return { success: true }
      },

      undoHandoverComplete: (id, reason) => {
        const trimmedReason = reason.trim()
        if (!trimmedReason) {
          return { success: false, error: '撤销原因不能为空' }
        }

        const { handoverPackages } = get()
        const pkg = handoverPackages.find((p) => p.id === id)
        if (!pkg) {
          return { success: false, error: '交接包不存在' }
        }
        if (pkg.status !== 'completed') {
          return { success: false, error: '只有已完成状态的交接包才能撤销' }
        }

        const { package: updated, auditLog } = undoComplete(pkg, trimmedReason)

        set((s) => ({
          handoverPackages: s.handoverPackages.map((p) => (p.id === id ? updated : p)),
          handoverPackageAuditLogs: [auditLog, ...s.handoverPackageAuditLogs],
        }))

        return { success: true }
      },

      deleteHandoverPackage: (id) => {
        const { handoverPackages } = get()
        const pkg = handoverPackages.find((p) => p.id === id)
        if (!pkg) {
          return { success: false, error: '交接包不存在' }
        }

        const auditLog = createHandoverAuditLog('delete', pkg, {
          note: '删除交接包',
        })

        set((s) => ({
          handoverPackages: s.handoverPackages.filter((p) => p.id !== id),
          handoverPackageAuditLogs: [auditLog, ...s.handoverPackageAuditLogs],
        }))

        return { success: true }
      },

      exportHandoverPackages: (ids) => {
        const { handoverPackages } = get()
        let packagesToExport = handoverPackages
        if (ids && ids.length > 0) {
          packagesToExport = handoverPackages.filter((p) => ids.includes(p.id))
        }
        if (packagesToExport.length === 0) {
          return
        }
        const json = exportHandoverPackagesToJSON(packagesToExport)
        const ts = dayjs().format('YYYYMMDD_HHmmss')
        const filename = ids && ids.length === 1
          ? `handover_package_${packagesToExport[0].title.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${ts}.json`
          : `handover_packages_${ts}.json`
        downloadBlob(new Blob([json], { type: 'application/json' }), filename)
      },

      importHandoverPackages: async (file, conflictResolutions) => {
        const text = await file.text()
        const { handoverPackages, events } = get()
        const result = importHandoverPackages(text, handoverPackages, events, conflictResolutions)

        if (result.imported.length > 0) {
          const auditLogs = result.imported.map((pkg) =>
            createHandoverAuditLog('import', pkg, {
              importSource: file.name,
              note: `从文件 ${file.name} 导入交接包`,
            })
          )

          set((s) => ({
            handoverPackages: [...result.imported, ...s.handoverPackages],
            handoverPackageAuditLogs: [...auditLogs, ...s.handoverPackageAuditLogs],
          }))
        }

        return result
      },

      getHandoverPackageAuditLogs: () => {
        return get().handoverPackageAuditLogs
      },

      getHandoverPackageAuditLogsByPackageId: (packageId) => {
        return get().handoverPackageAuditLogs.filter((log) => log.package_id === packageId)
      },

      filterHandoverEvents,
      filterHandoverPackages,

      resetAll: () => {
        set({
          tickets: [],
          scores: [],
          refunds: [],
          events: [],
          evidences: [],
          importRecords: [],
          rules: { ...DEFAULT_RULES },
          uiState: { selectedEventId: null, drawerOpen: false, lastAnalysisAt: null },
          lastBatchOperation: null,
          snapshots: [],
          lastDeletedSnapshot: null,
          schemes: [createDefaultScheme()],
          activeSchemeId: DEFAULT_SCHEME_ID,
          schemeAuditLogs: [],
          reviewPackages: [],
          reviewPackageAuditLogs: [],
          handoverPackages: [],
          handoverPackageAuditLogs: [],
        })
      },
    }),
    {
      name: 'quality-dashboard-state-v1',
      storage: dateAwareStorage,
      partialize: (state) => ({
        tickets: state.tickets,
        scores: state.scores,
        refunds: state.refunds,
        events: state.events,
        evidences: state.evidences,
        importRecords: state.importRecords,
        rules: state.rules,
        lastBatchOperation: state.lastBatchOperation,
        snapshots: state.snapshots,
        lastDeletedSnapshot: state.lastDeletedSnapshot,
        schemes: state.schemes,
        activeSchemeId: state.activeSchemeId,
        schemeAuditLogs: state.schemeAuditLogs,
        reviewPackages: state.reviewPackages,
        reviewPackageAuditLogs: state.reviewPackageAuditLogs,
        handoverPackages: state.handoverPackages,
        handoverPackageAuditLogs: state.handoverPackageAuditLogs,
      }),
    }
  )
)
