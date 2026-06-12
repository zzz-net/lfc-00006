import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import { ArrowLeft, CheckSquare, Calendar, User, Tag, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { ReviewPackageCauseCategory, QualityEventType } from '@/types'
import { CAUSE_CATEGORY_LABEL_MAP, STATUS_LABEL_MAP } from '@/services/reviewPackageService'
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

export default function ReviewPackageCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const events = useAppStore((s) => s.events)
  const createReviewPackage = useAppStore((s) => s.createReviewPackage)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [responsible, setResponsible] = useState('')
  const [causeCategory, setCauseCategory] = useState<ReviewPackageCauseCategory>('process_issue')
  const [handlingSuggestion, setHandlingSuggestion] = useState('')
  const [deadline, setDeadline] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events
    const keyword = searchQuery.trim().toLowerCase()
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(keyword) ||
        e.customer_id.toLowerCase().includes(keyword) ||
        e.types.some((t) => eventTypeLabelMap[t].includes(keyword))
    )
  }, [events, searchQuery])

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

  const handleSubmit = () => {
    const deadlineDate = deadline ? new Date(deadline) : null

    const result = createReviewPackage(
      title,
      responsible,
      causeCategory,
      handlingSuggestion,
      deadlineDate,
      Array.from(selectedIds)
    )

    if (!result.success) {
      toast.error(result.error || '创建失败')
      return
    }

    toast.success(`复盘包「${title}」创建成功，包含 ${selectedIds.size} 个事件`)
    navigate('/review-packages')
  }

  const isValid = title.trim() && responsible.trim() && selectedIds.size > 0

  return (
    <AppLayout title="创建复盘包">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/review-packages')}
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
                  已选 <span className="font-bold text-blue-600">{selectedIds.size}</span> / {events.length}
                </span>
                <button
                  onClick={handleSelectAll}
                  className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  {selectedIds.size === filteredEvents.length ? '取消全选' : '全选'}
                </button>
              </div>
            </div>

            <div className="mb-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索事件标题、客户ID、类型..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
              />
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无质量事件</p>
                  <p className="text-xs mt-1">请先导入数据并运行分析</p>
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
                          </div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-md font-medium',
                                event.status === 'pending'
                                  ? 'bg-amber-100 text-amber-700'
                                  : event.status === 'reviewing'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-emerald-100 text-emerald-700'
                              )}
                            >
                              {STATUS_LABEL_MAP[event.status]}
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
              <FileText className="w-4 h-4 text-indigo-500" />
              填写复盘信息
            </h3>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <Tag className="w-3.5 h-3.5" />
                  复盘包标题 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：2024年6月上旬超时工单质量波动分析"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <User className="w-3.5 h-3.5" />
                    负责人 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={responsible}
                    onChange={(e) => setResponsible(e.target.value)}
                    placeholder="负责人姓名"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5" />
                    截止日期
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
                  <Tag className="w-3.5 h-3.5" />
                  原因分类 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(CAUSE_CATEGORY_LABEL_MAP) as ReviewPackageCauseCategory[]).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCauseCategory(cat)}
                      className={cn(
                        'px-3 py-2 rounded-xl text-sm font-medium transition-all',
                        causeCategory === cat
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      {CAUSE_CATEGORY_LABEL_MAP[cat]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" />
                  处理建议 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={handlingSuggestion}
                  onChange={(e) => setHandlingSuggestion(e.target.value)}
                  placeholder="详细描述问题原因分析和改进措施建议..."
                  rows={6}
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
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => navigate('/review-packages')}
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
                  创建复盘包
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
