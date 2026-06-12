import { useState, useMemo } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import ReviewQueue from '@/components/ui/ReviewQueue'
import ReviewEditor from '@/components/ui/ReviewEditor'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import { CheckSquare, CheckCircle2, XCircle, RotateCcw, Clock, AlertTriangle, X, FileText } from 'lucide-react'
import type { EventStatus, BatchActionType, BatchActionResult, BatchActionSkipReason } from '@/types'
import { cn, formatDateCN } from '@/lib/utils'

type FilterStatus = 'all' | EventStatus

interface BatchConfirmState {
  open: boolean
  action: BatchActionType | null
}

const BATCH_ACTION_CONFIG: Record<BatchActionType, {
  label: string
  targetStatus: EventStatus
  description: string
  confirmText: string
  variant: 'default' | 'danger'
  icon: typeof CheckCircle2
  className: string
}> = {
  confirm: {
    label: '已确认',
    targetStatus: 'closed',
    description: '批量标记为已确认并关闭',
    confirmText: '确认批量处理',
    variant: 'default',
    icon: CheckCircle2,
    className: 'from-emerald-500 to-emerald-600 shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700',
  },
  ignore: {
    label: '已忽略',
    targetStatus: 'closed',
    description: '批量标记为已忽略并关闭',
    confirmText: '确认批量忽略',
    variant: 'default',
    icon: XCircle,
    className: 'from-slate-500 to-slate-600 shadow-slate-500/20 hover:from-slate-600 hover:to-slate-700',
  },
  reopen: {
    label: '退回待处理',
    targetStatus: 'pending',
    description: '批量退回为待处理状态',
    confirmText: '确认批量退回',
    variant: 'danger',
    icon: Clock,
    className: 'from-amber-500 to-amber-600 shadow-amber-500/20 hover:from-amber-600 hover:to-amber-700',
  },
}

const statusLabelMap: Record<EventStatus, string> = {
  pending: '待复核',
  reviewing: '复核中',
  closed: '已关闭',
}

export default function ReviewPage() {
  const events = useAppStore((s) => s.events)
  const executeBatchAction = useAppStore((s) => s.executeBatchAction)
  const undoLastBatchOperation = useAppStore((s) => s.undoLastBatchOperation)
  const canUndoBatchOperation = useAppStore((s) => s.canUndoBatchOperation)
  const lastBatchOperation = useAppStore((s) => s.lastBatchOperation)
  const toast = useToast()

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expectedStatuses, setExpectedStatuses] = useState<Record<string, EventStatus>>({})
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [batchConfirm, setBatchConfirm] = useState<BatchConfirmState>({ open: false, action: null })
  const [batchNote, setBatchNote] = useState('')
  const [batchResult, setBatchResult] = useState<BatchActionResult | null>(null)
  const [showResult, setShowResult] = useState(false)

  const selectedEvents = useMemo(() => {
    return events.filter((e) => selectedIds.has(e.id))
  }, [events, selectedIds])

  const statusDistribution = useMemo(() => {
    const dist: Record<EventStatus, number> = { pending: 0, reviewing: 0, closed: 0 }
    for (const e of selectedEvents) {
      dist[e.status]++
    }
    return dist
  }, [selectedEvents])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = (ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        next.add(id)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setExpectedStatuses({})
  }

  const handleExpectedStatusesChange = (statuses: Record<string, EventStatus>) => {
    setExpectedStatuses(statuses)
  }

  const openBatchConfirm = (action: BatchActionType) => {
    if (selectedIds.size === 0) {
      toast.warning('请先选择要处理的事件')
      return
    }
    setBatchConfirm({ open: true, action })
    setBatchNote('')
  }

  const handleBatchAction = () => {
    if (!batchConfirm.action) return

    const result = executeBatchAction(
      Array.from(selectedIds),
      batchConfirm.action,
      batchNote,
      expectedStatuses
    )

    setBatchResult(result)
    setShowResult(true)
    setBatchConfirm({ open: false, action: null })

    if (result.successCount > 0) {
      toast.success(
        `批量操作完成：成功 ${result.successCount} 条` +
        (result.skipCount > 0 ? `，跳过 ${result.skipCount} 条` : '')
      )
    } else if (result.skipCount > 0) {
      toast.warning(`批量操作完成：全部 ${result.skipCount} 条被跳过`)
    }

    setSelectedIds(new Set())
    setExpectedStatuses({})
  }

  const handleUndo = () => {
    const result = undoLastBatchOperation()
    if (result.success) {
      toast.success(result.message)
    } else {
      toast.error(result.message)
    }
  }

  const getSkippedMessage = (skip: BatchActionSkipReason): string => {
    switch (skip.reason) {
      case 'not_found':
        return `事件 ${skip.id.slice(-8)} 不存在`
      case 'already_closed':
        return `事件 ${skip.id.slice(-8)} 已关闭，无法${batchConfirm.action === 'confirm' ? '确认' : batchConfirm.action === 'ignore' ? '忽略' : '操作'}`
      case 'status_changed':
        return `事件 ${skip.id.slice(-8)} 状态已变更：${skip.expectedStatus ? statusLabelMap[skip.expectedStatus] : '未知'} → ${skip.actualStatus ? statusLabelMap[skip.actualStatus] : '未知'}`
      default:
        return `事件 ${skip.id.slice(-8)} 被跳过`
    }
  }

  const canPerformAction = (action: BatchActionType): boolean => {
    if (selectedIds.size === 0) return false
    if (action === 'reopen') {
      return selectedEvents.some((e) => e.status !== 'pending')
    }
    return selectedEvents.some((e) => e.status !== 'closed')
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null

  return (
    <AppLayout title="事件复核">
      <div className="space-y-4 h-[calc(100vh-10rem)] min-h-[600px]">
        <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-3.5 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
              <CheckSquare className="w-3.5 h-3.5" />
              已选 {selectedIds.size} 个事件
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className={statusDistribution.pending > 0 ? 'text-amber-600' : ''}>
                  待复核 {statusDistribution.pending}
                </span>
                <span className="text-slate-300">|</span>
                <span className={statusDistribution.reviewing > 0 ? 'text-blue-600' : ''}>
                  复核中 {statusDistribution.reviewing}
                </span>
                <span className="text-slate-300">|</span>
                <span className={statusDistribution.closed > 0 ? 'text-emerald-600' : ''}>
                  已关闭 {statusDistribution.closed}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canUndoBatchOperation() && lastBatchOperation && (
              <button
                onClick={handleUndo}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                撤销
                <span className="text-[10px] opacity-70">
                  {lastBatchOperation.targets.length}条
                </span>
              </button>
            )}
            {selectedIds.size > 0 && (
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                清空选择
              </button>
            )}
            {(Object.keys(BATCH_ACTION_CONFIG) as BatchActionType[]).map((action) => {
              const config = BATCH_ACTION_CONFIG[action]
              const Icon = config.icon
              const enabled = canPerformAction(action)
              return (
                <button
                  key={action}
                  onClick={() => openBatchConfirm(action)}
                  disabled={!enabled}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
                    'bg-gradient-to-r',
                    config.className
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {config.label}
                  {selectedIds.size > 0 && (
                    <span className="bg-white/25 px-1.5 py-0.5 rounded-md text-xs">
                      {selectedIds.size}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 h-full min-h-0">
          <div className="col-span-2 min-h-0">
            <ReviewQueue
              selectedEventId={selectedEventId}
              onSelect={setSelectedEventId}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectAll={handleSelectAll}
              onClearSelection={clearSelection}
              filterStatus={filterStatus}
              onFilterChange={setFilterStatus}
              expectedStatuses={expectedStatuses}
              onExpectedStatusesChange={handleExpectedStatusesChange}
            />
          </div>
          <div className="col-span-3 min-h-0">
            <ReviewEditor
              event={selectedEvent}
              onClose={() => setSelectedEventId(null)}
            />
          </div>
        </div>
      </div>

      {batchConfirm.open && batchConfirm.action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setBatchConfirm({ open: false, action: null })}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-modal-in">
            <button
              onClick={() => setBatchConfirm({ open: false, action: null })}
              className="absolute right-4 top-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className={cn(
              'w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center',
              batchConfirm.action === 'reopen' ? 'bg-amber-50' : 'bg-emerald-50'
            )}>
              {(() => {
                const Icon = BATCH_ACTION_CONFIG[batchConfirm.action!].icon
                return <Icon className={cn(
                  'w-7 h-7',
                  batchConfirm.action === 'reopen' ? 'text-amber-500' : 'text-emerald-500'
                )} />
              })()}
            </div>
            <h3 className="text-lg font-bold text-center text-slate-800 mb-4">
              批量{BATCH_ACTION_CONFIG[batchConfirm.action].label}
            </h3>

            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-600">选中事件总数</span>
                <span className="text-lg font-bold text-slate-800">{selectedIds.size}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-amber-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-amber-600 mb-0.5">待复核</p>
                  <p className="text-base font-bold text-amber-700">{statusDistribution.pending}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-blue-600 mb-0.5">复核中</p>
                  <p className="text-base font-bold text-blue-700">{statusDistribution.reviewing}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-emerald-600 mb-0.5">已关闭</p>
                  <p className="text-base font-bold text-emerald-700">{statusDistribution.closed}</p>
                </div>
              </div>
              {batchConfirm.action !== 'reopen' && statusDistribution.closed > 0 && (
                <div className="mt-3 flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">注意：{statusDistribution.closed} 个已关闭事件将被跳过</p>
                    <p className="text-amber-600 mt-0.5">已关闭事件无法通过确认/忽略操作修改状态</p>
                  </div>
                </div>
              )}
              {batchConfirm.action === 'reopen' && statusDistribution.pending === selectedIds.size && (
                <div className="mt-3 flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p className="font-medium">选中事件全部为待复核状态，无需退回</p>
                </div>
              )}
            </div>

            <div className="mb-5">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  批量备注（可选）
                </label>
              </div>
              <textarea
                value={batchNote}
                onChange={(e) => setBatchNote(e.target.value)}
                placeholder="输入批量备注，将应用到所有成功处理的事件..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all resize-none leading-relaxed"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                备注将覆盖每条事件原有的备注。留空则保留原备注。
              </p>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => setBatchConfirm({ open: false, action: null })}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleBatchAction}
                disabled={!canPerformAction(batchConfirm.action)}
                className={cn(
                  'flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                  'bg-gradient-to-r',
                  BATCH_ACTION_CONFIG[batchConfirm.action].className
                )}
              >
                {BATCH_ACTION_CONFIG[batchConfirm.action].confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResult && batchResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowResult(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-modal-in">
            <button
              onClick={() => setShowResult(false)}
              className="absolute right-4 top-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className={cn(
              'w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center',
              batchResult.successCount > 0 ? 'bg-emerald-50' : 'bg-amber-50'
            )}>
              {batchResult.successCount > 0 ? (
                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-7 h-7 text-amber-500" />
              )}
            </div>
            <h3 className="text-lg font-bold text-center text-slate-800 mb-2">
              批量操作完成
            </h3>
            <p className="text-sm text-center text-slate-500 mb-4">
              操作类型：{BATCH_ACTION_CONFIG[batchResult.action].label}
              <br />
              执行时间：{formatDateCN(batchResult.executedAt)}
            </p>

            <div className="bg-slate-50 rounded-xl p-4 mb-5">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-white rounded-lg p-3 text-center border border-slate-100">
                  <p className="text-[10px] text-slate-500 mb-0.5">请求处理</p>
                  <p className="text-xl font-bold text-slate-800">{batchResult.totalRequested}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-emerald-600 mb-0.5">成功处理</p>
                  <p className="text-xl font-bold text-emerald-700">{batchResult.successCount}</p>
                </div>
              </div>
              {batchResult.skipCount > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <p className="text-xs font-semibold text-amber-700">
                      跳过 {batchResult.skipCount} 条：
                    </p>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {batchResult.skipped.map((skip, idx) => (
                      <div
                        key={idx}
                        className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5"
                      >
                        {getSkippedMessage(skip)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowResult(false)}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-md hover:from-slate-900 hover:to-black transition-all"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
