import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import {
  ArrowLeft,
  CheckSquare,
  Calendar,
  User,
  Tag,
  FileText,
  AlertCircle,
  CheckCircle2,
  Filter,
  DollarSign,
  Users,
  Flag,
  Search,
  X,
} from 'lucide-react'
import type { HandoverPriority, EventStatus, QualityEventType, HandoverEventFilter } from '@/types'
import {
  PRIORITY_LABEL_MAP,
  PRIORITY_COLOR_MAP,
  STATUS_LABEL_MAP as HANDOVER_STATUS_MAP,
} from '@/services/handoverPackageService'
import { cn, formatDateCN } from '@/lib/utils'

const EVENT_STATUS_LABEL_MAP: Record<EventStatus, string> = {
  pending: '待复核',
  reviewing: '复核中',
  closed: '已关闭',
}

const EVENT_STATUS_COLOR_MAP: Record<EventStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  reviewing: 'bg-blue-100 text-blue-700',
  closed: 'bg-emerald-100 text-emerald-700',
}

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

export default function HandoverPackageCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const events = useAppStore((s) => s.events)
  const createHandoverPackage = useAppStore((s) => s.createHandoverPackage)
  const filterHandoverEvents = useAppStore((s) => s.filterHandoverEvents)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<HandoverPriority>('medium')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [filter, setFilter] = useState<HandoverEventFilter>({
    statuses: [],
    types: [],
    customer_id: '',
    min_refund: undefined,
    max_refund: undefined,
    search: '',
  })

  const filteredEvents = useMemo(() => {
    return filterHandoverEvents(events, filter)
  }, [events, filter, filterHandoverEvents])

  const selectedEvents = useMemo(() => {
    return events.filter((e) => selectedIds.has(e.id))
  }, [events, selectedIds])

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

  const handleSelectAll = () => {
    if (selectedIds.size === filteredEvents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredEvents.map((e) => e.id)))
    }
  }

  const toggleStatusFilter = (status: EventStatus) => {
    setFilter((prev) => {
      const current = prev.statuses || []
      const next = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status]
      return { ...prev, statuses: next.length > 0 ? next : undefined }
    })
  }

  const toggleTypeFilter = (type: QualityEventType) => {
    setFilter((prev) => {
      const current = prev.types || []
      const next = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type]
      return { ...prev, types: next.length > 0 ? next : undefined }
    })
  }

  const clearFilters = () => {
    setFilter({
      statuses: [],
      types: [],
      customer_id: '',
      min_refund: undefined,
      max_refund: undefined,
      search: '',
    })
  }

  const hasActiveFilters =
    (filter.statuses && filter.statuses.length > 0) ||
    (filter.types && filter.types.length > 0) ||
    (filter.customer_id && filter.customer_id.trim()) ||
    (filter.min_refund !== undefined && filter.min_refund > 0) ||
    (filter.max_refund !== undefined && filter.max_refund > 0) ||
    (filter.search && filter.search.trim())

  const handleSubmit = () => {
    const deadlineDate = deadline ? new Date(deadline) : null

    const result = createHandoverPackage(
      title,
      assignee,
      deadlineDate,
      priority,
      description,
      Array.from(selectedIds)
    )

    if (!result.success) {
      toast.error(result.error || '创建失败')
      return
    }

    toast.success(`交接包「${title}」创建成功，包含 ${selectedIds.size} 个事件`)
    navigate('/handover-packages')
  }

  const isValid = title.trim() && assignee.trim() && selectedIds.size > 0

  return (
    <AppLayout title="创建交接包">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/handover-packages')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回列表
          </button>
        </div>

        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-2 bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-500" />
                选择质量事件
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  已选 <span className="font-bold text-blue-600">{selectedIds.size}</span> /{' '}
                  {events.length}
                </span>
                <button
                  onClick={handleSelectAll}
                  className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  {selectedIds.size === filteredEvents.length ? '取消全选' : '全选'}
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn(
                    'text-xs px-2 py-1 rounded transition-colors flex items-center gap-1',
                    showFilters || hasActiveFilters
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  <Filter className="w-3 h-3" />
                  筛选
                  {hasActiveFilters && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                </button>
              </div>
            </div>

            {showFilters && (
              <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">筛选条件</span>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      清除
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    关键词搜索
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={filter.search || ''}
                      onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
                      placeholder="搜索事件标题、客户ID..."
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    状态筛选
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(EVENT_STATUS_LABEL_MAP) as EventStatus[]).map((status) => (
                      <button
                        key={status}
                        onClick={() => toggleStatusFilter(status)}
                        className={cn(
                          'px-2 py-1 rounded-lg text-xs font-medium transition-all',
                          filter.statuses?.includes(status)
                            ? EVENT_STATUS_COLOR_MAP[status]
                            : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                        )}
                      >
                        {EVENT_STATUS_LABEL_MAP[status]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    事件类型
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(eventTypeLabelMap) as QualityEventType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => toggleTypeFilter(type)}
                        className={cn(
                          'px-2 py-1 rounded-lg text-xs font-medium transition-all',
                          filter.types?.includes(type)
                            ? eventTypeColorMap[type]
                            : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                        )}
                      >
                        {eventTypeLabelMap[type]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    客户ID
                  </label>
                  <input
                    type="text"
                    value={filter.customer_id || ''}
                    onChange={(e) => setFilter((prev) => ({ ...prev, customer_id: e.target.value }))}
                    placeholder="输入客户ID..."
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      最低退款额
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={filter.min_refund ?? ''}
                      onChange={(e) =>
                        setFilter((prev) => ({
                          ...prev,
                          min_refund: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      最高退款额
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={filter.max_refund ?? ''}
                      onChange={(e) =>
                        setFilter((prev) => ({
                          ...prev,
                          max_refund: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      placeholder="不限"
                      className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 text-center">
                  筛选结果：<span className="font-semibold text-blue-600">{filteredEvents.length}</span> 个事件
                </div>
              </div>
            )}

            {!showFilters && (
              <div className="mb-3">
                <input
                  type="text"
                  value={filter.search || ''}
                  onChange={(e) => setFilter((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder="搜索事件标题、客户ID、类型..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                />
              </div>
            )}

            <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无符合条件的质量事件</p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="text-xs mt-1 text-blue-500 hover:text-blue-600"
                    >
                      清除筛选条件
                    </button>
                  )}
                </div>
              ) : (
                filteredEvents.map((event) => {
                  const isSelected = selectedIds.has(event.id)
                  return (
                    <div
                      key={event.id}
                      onClick={() => toggleSelect(event.id)}
                      className={cn(
                        'p-3 rounded-xl border cursor-pointer transition-all duration-200',
                        isSelected
                          ? 'bg-blue-50 border-blue-300 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                          )}
                        >
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-slate-800 truncate">
                              {event.title}
                            </span>
                            {event.total_refund > 0 && (
                              <span className="text-[10px] text-rose-600 font-medium">
                                ¥{event.total_refund.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
                                EVENT_STATUS_COLOR_MAP[event.status]
                              )}
                            >
                              {EVENT_STATUS_LABEL_MAP[event.status]}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {event.customer_id}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {event.types.map((type) => (
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
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="col-span-3 bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              填写交接信息
            </h3>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <Tag className="w-3.5 h-3.5" />
                  交接包标题 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：2024年6月第二周超时工单交接清单"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <User className="w-3.5 h-3.5" />
                    接手人 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="接手人姓名"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5" />
                    截止时间
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <Flag className="w-3.5 h-3.5" />
                  优先级 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(PRIORITY_LABEL_MAP) as HandoverPriority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={cn(
                        'px-3 py-2 rounded-xl text-sm font-medium transition-all',
                        priority === p
                          ? `${PRIORITY_COLOR_MAP[p]} shadow-md`
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      {PRIORITY_LABEL_MAP[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" />
                  处理说明
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="详细描述交接内容、处理要求和注意事项..."
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all resize-none leading-relaxed"
                />
              </div>

              {selectedEvents.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <h4 className="text-sm font-bold text-blue-800 mb-2">已选事件摘要</h4>
                  <div className="text-xs text-blue-700 space-y-1">
                    <p>共 {selectedEvents.length} 个质量事件</p>
                    <p>
                      涉及客户：
                      {Array.from(new Set(selectedEvents.map((e) => e.customer_id))).join(', ')}
                    </p>
                    <p>
                      涉及金额：
                      <span className="font-bold">
                        ¥{selectedEvents.reduce((sum, e) => sum + e.total_refund, 0).toLocaleString()}
                      </span>
                    </p>
                    <p className="flex items-center gap-2">
                      优先级：
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold', PRIORITY_COLOR_MAP[priority])}>
                        {PRIORITY_LABEL_MAP[priority]}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => navigate('/handover-packages')}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!isValid}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all',
                    isValid
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 shadow-indigo-500/20'
                      : 'bg-slate-300 cursor-not-allowed'
                  )}
                >
                  创建交接包
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
