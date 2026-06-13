import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import ConfirmModal from '@/components/ui/ConfirmModal'
import {
  ArrowLeft,
  Calendar,
  User,
  Flag,
  FileText,
  Clock,
  AlertTriangle,
  Download,
  MessageSquare,
  Send,
  History,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Eye,
  Users,
  Undo2,
  Check,
  X,
  AlertCircle,
} from 'lucide-react'
import type {
  HandoverPackageStatus,
  HandoverPriority,
  QualityEventType,
  EventStatus,
} from '@/types'
import {
  STATUS_LABEL_MAP,
  PRIORITY_LABEL_MAP,
  PRIORITY_COLOR_MAP,
} from '@/services/handoverPackageService'
import { cn, formatDateCN } from '@/lib/utils'

const eventTypeLabelMap: Record<QualityEventType, string> = {
  timeout: '超时工单',
  low_score: '低分回访',
  repeat_complaint: '重复投诉',
  high_refund: '高额退款',
}

const eventTypeColorMap: Record<QualityEventType, string> = {
  timeout: 'bg-amber-100 text-amber-700',
  low_score: 'bg-red-100 text-red-700',
  repeat_complaint: 'bg-purple-100 text-purple-700',
  high_refund: 'bg-rose-100 text-rose-700',
}

const eventStatusLabelMap: Record<EventStatus, string> = {
  pending: '待复核',
  reviewing: '复核中',
  closed: '已关闭',
}

const eventStatusColorMap: Record<EventStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  reviewing: 'bg-blue-100 text-blue-700',
  closed: 'bg-emerald-100 text-emerald-700',
}

const statusColorMap: Record<HandoverPackageStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
}

const actionLabelMap: Record<string, string> = {
  create: '创建',
  add_record: '追加沟通记录',
  complete: '标记完成',
  undo_complete: '撤销完成',
  import: '导入',
  delete: '删除',
  update: '状态更新',
}

export default function HandoverPackageDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()

  const getHandoverPackage = useAppStore((s) => s.getHandoverPackage)
  const updateHandoverPackageStatus = useAppStore((s) => s.updateHandoverPackageStatus)
  const addHandoverCommunicationRecord = useAppStore((s) => s.addHandoverCommunicationRecord)
  const markHandoverAsCompleted = useAppStore((s) => s.markHandoverAsCompleted)
  const undoHandoverComplete = useAppStore((s) => s.undoHandoverComplete)
  const exportHandoverPackages = useAppStore((s) => s.exportHandoverPackages)
  const getHandoverPackageAuditLogsByPackageId = useAppStore(
    (s) => s.getHandoverPackageAuditLogsByPackageId
  )
  const events = useAppStore((s) => s.events)

  const pkg = id ? getHandoverPackage(id) : undefined
  const auditLogs = id ? getHandoverPackageAuditLogsByPackageId(id) : []

  const [recordContent, setRecordContent] = useState('')
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [activeTab, setActiveTab] = useState<'events' | 'records' | 'undo' | 'logs'>('events')
  const [undoConfirm, setUndoConfirm] = useState<{ open: boolean; reason: string }>({
    open: false,
    reason: '',
  })
  const [completeConfirm, setCompleteConfirm] = useState<{ open: boolean }>({ open: false })

  const currentEvents = useMemo(() => {
    if (!pkg) return {}
    const map: Record<string, { exists: boolean; current?: any }> = {}
    for (const snap of pkg.event_snapshots) {
      const current = events.find((e) => e.id === snap.id)
      map[snap.id] = {
        exists: !!current,
        current,
      }
    }
    return map
  }, [pkg, events])

  if (!pkg) {
    return (
      <AppLayout title="交接包详情">
        <div className="flex flex-col items-center justify-center py-20">
          <XCircle className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">交接包不存在</h3>
          <p className="text-sm text-slate-400 mb-6">该交接包可能已被删除或 ID 无效</p>
          <button
            onClick={() => navigate('/handover-packages')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回列表
          </button>
        </div>
      </AppLayout>
    )
  }

  const toggleEventExpand = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }

  const handleAddRecord = () => {
    if (!recordContent.trim()) {
      toast.warning('请输入沟通记录内容')
      return
    }

    const result = addHandoverCommunicationRecord(pkg.id, recordContent)
    if (result.success) {
      toast.success('沟通记录添加成功')
      setRecordContent('')
    } else {
      toast.error(result.error || '添加失败')
    }
  }

  const handleStatusChange = (status: HandoverPackageStatus) => {
    if (pkg.status === status) {
      setShowStatusMenu(false)
      return
    }

    const result = updateHandoverPackageStatus(pkg.id, status)
    if (result.success) {
      toast.success(`状态已更新为「${STATUS_LABEL_MAP[status]}」`)
    } else {
      toast.error(result.error || '更新失败')
    }
    setShowStatusMenu(false)
  }

  const handleMarkComplete = () => {
    const result = markHandoverAsCompleted(pkg.id)
    if (result.success) {
      toast.success('交接包已标记为已完成')
    } else {
      toast.error(result.error || '操作失败')
    }
    setCompleteConfirm({ open: false })
  }

  const handleUndoComplete = () => {
    if (!undoConfirm.reason.trim()) {
      toast.warning('请填写撤销原因')
      return
    }

    const result = undoHandoverComplete(pkg.id, undoConfirm.reason)
    if (result.success) {
      toast.success('已撤销完成状态，恢复为处理中')
    } else {
      toast.error(result.error || '操作失败')
    }
    setUndoConfirm({ open: false, reason: '' })
  }

  const handleExport = () => {
    exportHandoverPackages([pkg.id])
    toast.success(`已导出交接包「${pkg.title}」`)
  }

  const canComplete = pkg.status !== 'completed'
  const canUndo = pkg.status === 'completed'

  return (
    <AppLayout title="交接包详情">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/handover-packages')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回列表
            </button>
            <div className="h-5 w-px bg-slate-300" />
            <span className="text-xs text-slate-400">ID: {pkg.id.slice(-12)}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <Download className="w-4 h-4" />
              导出 JSON
            </button>

            {canComplete && (
              <button
                onClick={() => setCompleteConfirm({ open: true })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all"
              >
                <Check className="w-4 h-4" />
                标记完成
              </button>
            )}

            {canUndo && (
              <button
                onClick={() => setUndoConfirm({ open: true, reason: '' })}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 shadow-md shadow-amber-500/20 hover:from-amber-600 hover:to-orange-600 transition-all"
              >
                <Undo2 className="w-4 h-4" />
                撤销完成
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all bg-gradient-to-r',
                  pkg.status === 'pending'
                    ? 'from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-amber-500/20'
                    : pkg.status === 'processing'
                      ? 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/20'
                      : pkg.status === 'completed'
                        ? 'from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/20'
                        : 'from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 shadow-gray-500/20'
                )}
              >
                状态：{STATUS_LABEL_MAP[pkg.status]}
                <ChevronDown className="w-4 h-4" />
              </button>

              {showStatusMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-modal-in">
                  <div className="p-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-2">
                      切换状态
                    </p>
                    {(['pending', 'processing', 'completed', 'cancelled'] as HandoverPackageStatus[]).map(
                      (status) => (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(status)}
                          className={cn(
                            'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                            pkg.status === status ? 'bg-slate-100' : 'hover:bg-slate-50'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'w-2 h-2 rounded-full',
                                status === 'pending'
                                  ? 'bg-amber-500'
                                  : status === 'processing'
                                    ? 'bg-blue-500'
                                    : status === 'completed'
                                      ? 'bg-emerald-500'
                                      : 'bg-gray-400'
                              )}
                            />
                            <span
                              className={cn(
                                'text-sm font-medium',
                                pkg.status === status ? 'text-slate-400' : 'text-slate-700'
                              )}
                            >
                              {STATUS_LABEL_MAP[status]}
                            </span>
                            {pkg.status === status && (
                              <CheckCircle2 className="w-4 h-4 text-slate-400 ml-auto" />
                            )}
                          </div>
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={cn('rounded-2xl border p-5 shadow-sm', statusColorMap[pkg.status])}>
          <h1 className="text-xl font-bold text-slate-800 mb-4">{pkg.title}</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <User className="w-3.5 h-3.5" />
                接手人
              </div>
              <p className="text-sm font-medium text-slate-800">{pkg.assignee}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <Flag className="w-3.5 h-3.5" />
                优先级
              </div>
              <p className="text-sm font-medium text-slate-800">
                <span className={cn('px-2 py-0.5 rounded text-xs', PRIORITY_COLOR_MAP[pkg.priority])}>
                  {PRIORITY_LABEL_MAP[pkg.priority]}
                </span>
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <Calendar className="w-3.5 h-3.5" />
                创建时间
              </div>
              <p className="text-sm font-medium text-slate-800">{formatDateCN(pkg.created_at)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                截止时间
              </div>
              <p className="text-sm font-medium text-slate-800">
                {pkg.deadline ? formatDateCN(pkg.deadline) : '未设置'}
              </p>
            </div>
          </div>

          {pkg.completed_at && (
            <div className="mt-4 pt-4 border-t border-slate-200/60">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                完成时间
              </div>
              <p className="text-sm font-medium text-emerald-700">
                {formatDateCN(pkg.completed_at)}
              </p>
            </div>
          )}

          {pkg.description && (
            <div className="mt-4 pt-4 border-t border-slate-200/60">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <FileText className="w-3.5 h-3.5" />
                处理说明
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                {pkg.description}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="flex items-center gap-1 px-4 border-b border-slate-200">
            <button
              onClick={() => setActiveTab('events')}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'events'
                  ? 'text-indigo-600 border-indigo-500'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              )}
            >
              <Eye className="w-4 h-4" />
              事件快照 ({pkg.event_snapshots.length})
            </button>
            <button
              onClick={() => setActiveTab('records')}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'records'
                  ? 'text-indigo-600 border-indigo-500'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              )}
            >
              <MessageSquare className="w-4 h-4" />
              沟通记录 ({pkg.communication_records.length})
            </button>
            <button
              onClick={() => setActiveTab('undo')}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'undo'
                  ? 'text-indigo-600 border-indigo-500'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              )}
            >
              <Undo2 className="w-4 h-4" />
              撤销记录 ({pkg.undo_records.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'logs'
                  ? 'text-indigo-600 border-indigo-500'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              )}
            >
              <History className="w-4 h-4" />
              操作日志 ({auditLogs.length})
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'events' && (
              <div className="space-y-3">
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-700">
                      <p className="font-medium">以下为创建交接包时的事件快照</p>
                      <p className="text-amber-600 mt-0.5">
                        即使原事件被修改或删除，此处数据保持不变，确保历史交接内容可追溯
                      </p>
                    </div>
                  </div>
                </div>

                {pkg.event_snapshots.map((snap) => {
                  const isExpanded = expandedEvents.has(snap.id)
                  const currentEvent = currentEvents[snap.id]
                  const hasChanges =
                    currentEvent?.exists &&
                    currentEvent.current &&
                    (currentEvent.current.status !== snap.status ||
                      currentEvent.current.review_note !== snap.review_note)

                  return (
                    <div
                      key={snap.id}
                      className="border border-slate-200 rounded-xl overflow-hidden"
                    >
                      <div
                        onClick={() => toggleEventExpand(snap.id)}
                        className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800 truncate">
                              {snap.title}
                            </span>
                            {!currentEvent?.exists && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                                原事件已删除
                              </span>
                            )}
                            {hasChanges && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-medium">
                                原事件已修改
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400">
                              {snap.customer_id}
                            </span>
                            <span
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
                                eventStatusColorMap[snap.status]
                              )}
                            >
                              快照状态：{eventStatusLabelMap[snap.status]}
                            </span>
                            {currentEvent?.current && (
                              <span
                                className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
                                  eventStatusColorMap[currentEvent.current.status]
                                )}
                              >
                                当前状态：{eventStatusLabelMap[currentEvent.current.status]}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                            {snap.types.map((type) => (
                              <span
                                key={type}
                                className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
                                  eventTypeColorMap[type]
                                )}
                              >
                                {eventTypeLabelMap[type]}
                              </span>
                            ))}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-4 bg-white border-t border-slate-200">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="text-slate-400 mb-1">证据数量</p>
                              <p className="font-semibold text-slate-700">{snap.evidence_count} 条</p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-1">涉及退款</p>
                              <p className="font-semibold text-slate-700">
                                ¥{snap.total_refund.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-1">首次出现</p>
                              <p className="font-semibold text-slate-700">
                                {formatDateCN(snap.first_seen_at)}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-1">最后出现</p>
                              <p className="font-semibold text-slate-700">
                                {formatDateCN(snap.last_seen_at)}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-1">快照时间</p>
                              <p className="font-semibold text-slate-700">
                                {formatDateCN(snap.snapshotted_at)}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-1">复核备注（快照）</p>
                              <p className="font-semibold text-slate-700">
                                {snap.review_note || '无'}
                              </p>
                            </div>
                          </div>

                          {hasChanges && currentEvent?.current && (
                            <div className="mt-4 pt-4 border-t border-slate-200">
                              <p className="text-[11px] font-semibold text-amber-600 mb-2">
                                ⚠ 原事件已发生以下变化（不影响本快照）：
                              </p>
                              <div className="bg-amber-50 rounded-lg p-3 text-xs">
                                {currentEvent.current.status !== snap.status && (
                                  <p className="text-amber-700">
                                    状态：{eventStatusLabelMap[snap.status]} →{' '}
                                    {eventStatusLabelMap[currentEvent.current.status]}
                                  </p>
                                )}
                                {currentEvent.current.review_note !== snap.review_note && (
                                  <p className="text-amber-700 mt-1">
                                    备注：{snap.review_note || '(空)'} →{' '}
                                    {currentEvent.current.review_note || '(空)'}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {activeTab === 'records' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <textarea
                    value={recordContent}
                    onChange={(e) => setRecordContent(e.target.value)}
                    placeholder="输入新的沟通记录..."
                    rows={3}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all resize-none"
                  />
                  <button
                    onClick={handleAddRecord}
                    disabled={!recordContent.trim()}
                    className={cn(
                      'self-end px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all',
                      recordContent.trim()
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-indigo-500/20'
                        : 'bg-slate-300 cursor-not-allowed'
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>

                {pkg.communication_records.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">暂无沟通记录</p>
                    <p className="text-xs mt-1">在上方输入框添加第一条记录</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...pkg.communication_records].reverse().map((record) => (
                      <div
                        key={record.id}
                        className="bg-slate-50 rounded-xl p-4 border border-slate-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                              {record.operator.slice(0, 1)}
                            </div>
                            <span className="text-sm font-semibold text-slate-700">
                              {record.operator}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">
                            {formatDateCN(record.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                          {record.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'undo' && (
              <div className="space-y-3">
                {pkg.undo_records.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Undo2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">暂无撤销记录</p>
                    <p className="text-xs mt-1">当标记完成后撤销时会记录撤销原因和操作人</p>
                  </div>
                ) : (
                  [...pkg.undo_records].reverse().map((undo) => (
                    <div
                      key={undo.id}
                      className="bg-amber-50 rounded-xl p-4 border border-amber-200"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-amber-800">
                                {undo.operator}
                              </span>
                              <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                                撤销完成
                              </span>
                            </div>
                            <span className="text-xs text-amber-500 shrink-0">
                              {formatDateCN(undo.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-amber-600 mb-1">
                            之前状态：{STATUS_LABEL_MAP[undo.previous_status]}
                          </p>
                          <p className="text-sm text-amber-700 font-medium">
                            撤销原因：{undo.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="space-y-3">
                {auditLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">暂无操作日志</p>
                  </div>
                ) : (
                  [...auditLogs].reverse().map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200"
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          log.action === 'create'
                            ? 'bg-emerald-100'
                            : log.action === 'add_record'
                              ? 'bg-blue-100'
                              : log.action === 'complete'
                                ? 'bg-emerald-100'
                                : log.action === 'undo_complete'
                                  ? 'bg-amber-100'
                                  : log.action === 'import'
                                    ? 'bg-purple-100'
                                    : log.action === 'delete'
                                      ? 'bg-red-100'
                                      : 'bg-slate-100'
                        )}
                      >
                        {log.action === 'create' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : log.action === 'add_record' ? (
                          <MessageSquare className="w-4 h-4 text-blue-600" />
                        ) : log.action === 'complete' ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : log.action === 'undo_complete' ? (
                          <Undo2 className="w-4 h-4 text-amber-600" />
                        ) : log.action === 'import' ? (
                          <Download className="w-4 h-4 text-purple-600" />
                        ) : log.action === 'delete' ? (
                          <XCircle className="w-4 h-4 text-red-600" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-700">
                            {actionLabelMap[log.action] || log.action}
                          </span>
                          <span className="text-xs text-slate-400 shrink-0">
                            {formatDateCN(log.operated_at)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          操作者：{log.operator}
                        </p>
                        {log.note && (
                          <p className="text-xs text-slate-600 mt-1">{log.note}</p>
                        )}
                        {log.old_status && log.new_status && (
                          <p className="text-xs text-amber-600 mt-1">
                            {STATUS_LABEL_MAP[log.old_status]} →{' '}
                            {STATUS_LABEL_MAP[log.new_status]}
                          </p>
                        )}
                        {log.record_content && (
                          <p className="text-xs text-blue-600 mt-1 bg-blue-50 rounded px-2 py-1">
                            记录：{log.record_content}
                          </p>
                        )}
                        {log.undo_reason && (
                          <p className="text-xs text-amber-600 mt-1 bg-amber-50 rounded px-2 py-1">
                            撤销原因：{log.undo_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {completeConfirm.open && (
        <ConfirmModal
          open={completeConfirm.open}
          title="确认标记完成"
          description="确定要将此交接包标记为已完成吗？"
          confirmText="确认完成"
          cancelText="取消"
          variant="default"
          onConfirm={handleMarkComplete}
          onCancel={() => setCompleteConfirm({ open: false })}
        />
      )}

      {undoConfirm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setUndoConfirm({ open: false, reason: '' })}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-modal-in">
            <button
              onClick={() => setUndoConfirm({ open: false, reason: '' })}
              className="absolute right-4 top-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center">
              <Undo2 className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-800 mb-2">撤销完成</h3>
            <p className="text-sm text-center text-slate-500 mb-5">
              撤销后交接包状态将恢复为「处理中」，请填写撤销原因
            </p>

            <div className="mb-5">
              <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <AlertCircle className="w-3.5 h-3.5" />
                撤销原因 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={undoConfirm.reason}
                onChange={(e) => setUndoConfirm({ ...undoConfirm, reason: e.target.value })}
                placeholder="请详细说明撤销完成的原因..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300 transition-all resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setUndoConfirm({ open: false, reason: '' })}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUndoComplete}
                disabled={!undoConfirm.reason.trim()}
                className={cn(
                  'flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all',
                  undoConfirm.reason.trim()
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/20'
                    : 'bg-slate-300 cursor-not-allowed'
                )}
              >
                确认撤销
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
