import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import {
  ArrowLeft,
  Calendar,
  User,
  Tag,
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
} from 'lucide-react'
import type {
  ReviewPackageStatus,
  ReviewPackageCauseCategory,
  QualityEventType,
  EventStatus,
} from '@/types'
import {
  STATUS_LABEL_MAP,
  CAUSE_CATEGORY_LABEL_MAP,
} from '@/services/reviewPackageService'
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

const statusTransitionConfig: Array<{
  status: ReviewPackageStatus
  label: string
  description: string
  variant: string
}> = [
  {
    status: 'draft',
    label: '设为草稿',
    description: '暂存，继续编辑',
    variant: 'from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 shadow-slate-500/20',
  },
  {
    status: 'analyzing',
    label: '开始分析',
    description: '进入分析阶段',
    variant: 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/20',
  },
  {
    status: 'resolved',
    label: '标记解决',
    description: '问题已处理完成',
    variant: 'from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/20',
  },
  {
    status: 'archived',
    label: '归档结案',
    description: '关闭并归档',
    variant: 'from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 shadow-gray-500/20',
  },
]

const statusColorMap: Record<ReviewPackageStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  analyzing: 'bg-blue-50 text-blue-700 border-blue-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived: 'bg-gray-50 text-gray-600 border-gray-200',
}

export default function ReviewPackageDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()

  const getReviewPackage = useAppStore((s) => s.getReviewPackage)
  const updateReviewPackageStatus = useAppStore((s) => s.updateReviewPackageStatus)
  const addReviewPackageRemark = useAppStore((s) => s.addReviewPackageRemark)
  const exportReviewPackages = useAppStore((s) => s.exportReviewPackages)
  const getReviewPackageAuditLogsByPackageId = useAppStore(
    (s) => s.getReviewPackageAuditLogsByPackageId
  )
  const events = useAppStore((s) => s.events)

  const pkg = id ? getReviewPackage(id) : undefined
  const auditLogs = id ? getReviewPackageAuditLogsByPackageId(id) : []

  const [remarkContent, setRemarkContent] = useState('')
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [activeTab, setActiveTab] = useState<'events' | 'remarks' | 'logs'>('events')

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
      <AppLayout title="复盘包详情">
        <div className="flex flex-col items-center justify-center py-20">
          <XCircle className="w-16 h-16 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">复盘包不存在</h3>
          <p className="text-sm text-slate-400 mb-6">该复盘包可能已被删除或 ID 无效</p>
          <button
            onClick={() => navigate('/review-packages')}
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

  const handleAddRemark = () => {
    if (!remarkContent.trim()) {
      toast.warning('请输入备注内容')
      return
    }

    const result = addReviewPackageRemark(pkg.id, remarkContent)
    if (result.success) {
      toast.success('备注添加成功')
      setRemarkContent('')
    } else {
      toast.error(result.error || '添加失败')
    }
  }

  const handleStatusChange = (status: ReviewPackageStatus) => {
    if (pkg.status === status) {
      setShowStatusMenu(false)
      return
    }

    const result = updateReviewPackageStatus(pkg.id, status)
    if (result.success) {
      toast.success(`状态已更新为「${STATUS_LABEL_MAP[status]}」`)
    } else {
      toast.error(result.error || '更新失败')
    }
    setShowStatusMenu(false)
  }

  const handleExport = () => {
    exportReviewPackages([pkg.id])
    toast.success(`已导出复盘包「${pkg.title}」`)
  }

  const actionLabelMap: Record<string, string> = {
    create: '创建',
    add_remark: '追加备注',
    status_change: '状态变更',
    import: '导入',
    delete: '删除',
  }

  return (
    <AppLayout title="复盘包详情">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/review-packages')}
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

            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md transition-all bg-gradient-to-r',
                  statusTransitionConfig.find((c) => c.status === pkg.status)?.variant ||
                    'from-slate-500 to-slate-600'
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
                    {statusTransitionConfig.map((config) => (
                      <button
                        key={config.status}
                        onClick={() => handleStatusChange(config.status)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                          pkg.status === config.status
                            ? 'bg-slate-100'
                            : 'hover:bg-slate-50'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full',
                              config.status === 'draft'
                                ? 'bg-slate-400'
                                : config.status === 'analyzing'
                                  ? 'bg-blue-500'
                                  : config.status === 'resolved'
                                    ? 'bg-emerald-500'
                                    : 'bg-gray-400'
                            )}
                          />
                          <span
                            className={cn(
                              'text-sm font-medium',
                              pkg.status === config.status
                                ? 'text-slate-400'
                                : 'text-slate-700'
                            )}
                          >
                            {config.label}
                          </span>
                          {pkg.status === config.status && (
                            <CheckCircle2 className="w-4 h-4 text-slate-400 ml-auto" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 ml-4 mt-0.5">
                          {config.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={cn(
          'rounded-2xl border p-5 shadow-sm',
          statusColorMap[pkg.status]
        )}>
          <h1 className="text-xl font-bold text-slate-800 mb-4">{pkg.title}</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <User className="w-3.5 h-3.5" />
                负责人
              </div>
              <p className="text-sm font-medium text-slate-800">{pkg.responsible}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <Tag className="w-3.5 h-3.5" />
                原因分类
              </div>
              <p className="text-sm font-medium text-slate-800">
                {CAUSE_CATEGORY_LABEL_MAP[pkg.cause_category]}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <Calendar className="w-3.5 h-3.5" />
                创建时间
              </div>
              <p className="text-sm font-medium text-slate-800">
                {formatDateCN(pkg.created_at)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                截止日期
              </div>
              <p className="text-sm font-medium text-slate-800">
                {pkg.deadline ? formatDateCN(pkg.deadline) : '未设置'}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200/60">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              <FileText className="w-3.5 h-3.5" />
              处理建议
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {pkg.handling_suggestion || '暂无处理建议'}
            </p>
          </div>
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
              onClick={() => setActiveTab('remarks')}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'remarks'
                  ? 'text-indigo-600 border-indigo-500'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              )}
            >
              <MessageSquare className="w-4 h-4" />
              处理备注 ({pkg.remarks.length})
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
                      <p className="font-medium">以下为创建复盘包时的事件快照</p>
                      <p className="text-amber-600 mt-0.5">
                        即使原事件被修改或删除，此处数据保持不变，确保历史结论可追溯
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

            {activeTab === 'remarks' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <textarea
                    value={remarkContent}
                    onChange={(e) => setRemarkContent(e.target.value)}
                    placeholder="输入新的处理备注..."
                    rows={3}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all resize-none"
                  />
                  <button
                    onClick={handleAddRemark}
                    disabled={!remarkContent.trim()}
                    className={cn(
                      'self-end px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all',
                      remarkContent.trim()
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-indigo-500/20'
                        : 'bg-slate-300 cursor-not-allowed'
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>

                {pkg.remarks.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">暂无处理备注</p>
                    <p className="text-xs mt-1">在上方输入框添加第一条备注</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...pkg.remarks].reverse().map((remark) => (
                      <div
                        key={remark.id}
                        className="bg-slate-50 rounded-xl p-4 border border-slate-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                              {remark.operator.slice(0, 1)}
                            </div>
                            <span className="text-sm font-semibold text-slate-700">
                              {remark.operator}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">
                            {formatDateCN(remark.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                          {remark.content}
                        </p>
                      </div>
                    ))}
                  </div>
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
                            : log.action === 'add_remark'
                              ? 'bg-blue-100'
                              : log.action === 'status_change'
                                ? 'bg-amber-100'
                                : log.action === 'import'
                                  ? 'bg-purple-100'
                                  : 'bg-red-100'
                        )}
                      >
                        {log.action === 'create' ? (
                          <CheckCircle2
                            className={cn(
                              'w-4 h-4',
                              log.action === 'create'
                                ? 'text-emerald-600'
                                : 'text-slate-600'
                            )}
                          />
                        ) : log.action === 'add_remark' ? (
                          <MessageSquare className="w-4 h-4 text-blue-600" />
                        ) : log.action === 'status_change' ? (
                          <Clock className="w-4 h-4 text-amber-600" />
                        ) : log.action === 'import' ? (
                          <Download className="w-4 h-4 text-purple-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
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
                        {log.remark_content && (
                          <p className="text-xs text-blue-600 mt-1 bg-blue-50 rounded px-2 py-1 mt-2">
                            备注：{log.remark_content}
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
    </AppLayout>
  )
}
