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
} from '@/types'
import { uid } from '@/utils'
import { runAnalysis } from '@/services/analyzeService'
import { importTicketsFile, importScoresFile, importRefundsFile } from '@/services/importService'
import { generateSampleFiles } from '@/sample/generator'
import { buildExportFilteredEvents, eventsToCSV, eventsToJSON, evidencesToCSV, buildFullBackup, parseFullBackup, downloadBlob } from '@/services/exportService'
import { parseDate } from '@/utils'
import dayjs from 'dayjs'

const DEFAULT_RULES: QualityRule = {
  timeout_hours: 24,
  min_score: 3,
  repeat_days: 7,
  repeat_count: 3,
  high_refund_amount: 500,
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

  setSelectedEvent: (id: string | null) => void
  setDrawerOpen: (open: boolean) => void

  importTickets: (file: File) => Promise<{ success: boolean; warnings: string[]; errors: string[]; record?: ImportRecord }>
  importScores: (file: File) => Promise<{ success: boolean; warnings: string[]; errors: string[]; record?: ImportRecord }>
  importRefunds: (file: File) => Promise<{ success: boolean; warnings: string[]; errors: string[]; record?: ImportRecord }>

  generateSampleData: () => Promise<{ ticketCount: number; scoreCount: number; refundCount: number; eventCount: number }>

  runAnalysis: () => void

  saveRules: (rules: QualityRule) => void

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
  restoreFromBackup: (file: File) => Promise<{ eventCount: number; success: boolean; error?: string }>

  getEventEvidences: (eventId: string) => Evidence[]

  resetAll: () => void
}

function textToFile(text: string, filename: string, type: string): File {
  const blob = new Blob([text], { type })
  return new File([blob], filename, { type })
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

function reviveDates(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) return obj
  if (typeof obj === 'string') {
    if (ISO_DATE_REGEX.test(obj)) {
      const d = parseDate(obj)
      return d || obj
    }
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(reviveDates)
  }
  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const k of Object.keys(obj)) {
      result[k] = reviveDates(obj[k])
    }
    return result
  }
  return obj
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

          if (event.status === 'closed' && action !== 'reopen') {
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
            return {
              ...e,
              status: targetStatus,
              review_note: hasNote ? note.trim() : e.review_note,
              reviewed_at: targetStatus === 'reviewing' || targetStatus === 'closed' ? now : e.reviewed_at,
              closed_at: targetStatus === 'closed' ? now : e.closed_at,
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
        const { events, evidences } = get()
        const { filteredEvents, filteredEvidences } = buildExportFilteredEvents(events, evidences, filter)
        const ts = dayjs().format('YYYYMMDD_HHmmss')
        if (format === 'csv') {
          const csv = eventsToCSV(filteredEvents)
          downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `events_${ts}.csv`)
        } else {
          const json = eventsToJSON(filteredEvents, filteredEvidences, filter.includeEvidences)
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
        })
        const ts = dayjs().format('YYYYMMDD_HHmmss')
        downloadBlob(new Blob([backup], { type: 'application/json' }), `full_backup_${ts}.json`)
      },

      restoreFromBackup: async (file) => {
        try {
          const text = await file.text()
          const parsed = parseFullBackup(text)
          if (!parsed) return { eventCount: 0, success: false, error: '备份文件格式无效' }

          const s = reviveDates(parsed) as any
          const tickets: CustomerTicket[] = s.tickets || []
          const scores: VisitScore[] = s.scores || []
          const refunds: Refund[] = s.refunds || []
          const events: QualityEvent[] = s.events || []
          const evidences: Evidence[] = s.evidences || []
          const importRecords: ImportRecord[] = s.importRecords || []
          const rules: QualityRule = s.rules || { ...DEFAULT_RULES }

          set({ tickets, scores, refunds, events, evidences, importRecords, rules })
          return { eventCount: events.length, success: true }
        } catch (e: any) {
          return { eventCount: 0, success: false, error: e?.message || '恢复失败' }
        }
      },

      getEventEvidences: (eventId) => {
        return get().evidences.filter((ev) => ev.event_id === eventId)
      },

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
      }),
    }
  )
)
