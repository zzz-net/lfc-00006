import { useAppStore } from '@/store'
import { X, Clock, Eye, CheckCircle2, AlertTriangle, FileText, Star, RefreshCw, Banknote } from 'lucide-react'
import { cn, formatDateCN } from '@/lib/utils'
import { typeMap, statusMap } from './EventTable'
import { Evidence, EvidenceSourceType } from '@/types'

const sourceIconMap: Record<EvidenceSourceType, { icon: typeof FileText; label: string }> = {
  ticket: { icon: FileText, label: '工单' },
  score: { icon: Star, label: '评分' },
  refund: { icon: Banknote, label: '退款' },
}

export default function EventDrawer() {
  const uiState = useAppStore((s) => s.uiState)
  const events = useAppStore((s) => s.events)
  const getEventEvidences = useAppStore((s) => s.getEventEvidences)
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen)
  const setSelectedEvent = useAppStore((s) => s.setSelectedEvent)

  const event = events.find((e) => e.id === uiState.selectedEventId)
  const evidences: Evidence[] = event ? getEventEvidences(event.id) : []

  if (!uiState.drawerOpen) return null

  const st = event ? statusMap[event.status] : null
  const StatusIcon = st?.icon || Clock

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm animate-fade-in"
        onClick={() => { setDrawerOpen(false); setTimeout(() => setSelectedEvent(null), 250) }}
      />
      <div className={cn(
        'absolute right-0 top-0 bottom-0 w-[560px] max-w-full bg-white shadow-2xl flex flex-col animate-drawer-in'
      )}>
        {event ? (
          <>
            <div className="px-6 py-5 border-b border-slate-200/80 flex items-start justify-between gap-4 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {st && (
                    <span className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border',
                      st.bg, st.className
                    )}>
                      <StatusIcon className="w-3 h-3" />
                      {st.label}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-mono">#{event.id.slice(-8)}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-800 leading-snug break-words">{event.title}</h3>
                <p className="text-xs text-slate-500 mt-1 font-mono">客户ID: {event.customer_id}</p>
              </div>
              <button
                onClick={() => { setDrawerOpen(false); setTimeout(() => setSelectedEvent(null), 250) }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-2 gap-4 shrink-0">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[11px] text-slate-500 mb-1">证据数量</p>
                <p className="text-lg font-bold text-slate-800">{event.evidence_count} 条</p>
              </div>
              <div className="bg-rose-50 rounded-xl p-3">
                <p className="text-[11px] text-rose-500 mb-1">累计退款</p>
                <p className="text-lg font-bold text-rose-700">¥{event.total_refund.toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-[11px] text-amber-600 mb-1">首次发现</p>
                <p className="text-sm font-semibold text-amber-800">{formatDateCN(event.first_seen_at)}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-[11px] text-emerald-600 mb-1">最近出现</p>
                <p className="text-sm font-semibold text-emerald-800">{formatDateCN(event.last_seen_at)}</p>
              </div>
            </div>

            <div className="px-6 py-3 border-b border-slate-100 shrink-0">
              <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-wider font-semibold">命中类型</p>
              <div className="flex flex-wrap gap-1.5">
                {event.types.map((t) => (
                  <span key={t} className={cn('text-xs px-3 py-1 rounded-lg font-medium', typeMap[t].className)}>
                    {typeMap[t].label}
                  </span>
                ))}
              </div>
            </div>

            {event.review_note && (
              <div className="px-6 py-3 border-b border-slate-100 shrink-0">
                <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-wider font-semibold">复核备注</p>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap">{event.review_note}</p>
              </div>
            )}

            <div className="px-6 py-3 border-b border-slate-100 shrink-0 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <p className="text-xs font-semibold text-slate-700">证据明细 ({evidences.length})</p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {evidences.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">暂无证据数据</div>
              ) : (
                evidences.map((ev) => {
                  const src = sourceIconMap[ev.source_type]
                  const SrcIcon = src.icon
                  return (
                    <div key={ev.id} className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center shrink-0">
                          <SrcIcon className="w-4 h-4 text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-slate-700">{src.label}证据</span>
                            <span className="text-[10px] text-slate-400 font-mono">#{ev.id.slice(-6)}</span>
                          </div>
                          <p className="text-[11px] text-slate-500">{formatDateCN(ev.occurred_at)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {ev.hit_rules.map((r) => (
                          <span key={r} className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-100 font-medium">
                            <RefreshCw className="w-2.5 h-2.5 inline mr-0.5" />{r}
                          </span>
                        ))}
                      </div>
                      <div className="bg-white rounded-lg p-3 text-xs text-slate-600 font-mono overflow-x-auto max-h-32 overflow-y-auto">
                        {ev.source_type === 'ticket' && (
                          <div className="space-y-1">
                            <p><span className="text-slate-400">工单号:</span> {ev.raw_data.ticket_no}</p>
                            <p><span className="text-slate-400">标题:</span> {ev.raw_data.title}</p>
                            <p><span className="text-slate-400">分类:</span> {ev.raw_data.category}</p>
                            <p><span className="text-slate-400">状态:</span> {ev.raw_data.status}</p>
                          </div>
                        )}
                        {ev.source_type === 'score' && (
                          <div className="space-y-1">
                            <p><span className="text-slate-400">评分:</span> <span className="text-amber-600 font-bold">{ev.raw_data.score}</span> / 5</p>
                            <p><span className="text-slate-400">评价:</span> {ev.raw_data.comment}</p>
                            <p><span className="text-slate-400">关联工单:</span> {ev.raw_data.ticket_no}</p>
                          </div>
                        )}
                        {ev.source_type === 'refund' && (
                          <div className="space-y-1">
                            <p><span className="text-slate-400">退款单号:</span> {ev.raw_data.refund_no}</p>
                            <p><span className="text-slate-400">金额:</span> <span className="text-rose-600 font-bold">¥{Number(ev.raw_data.amount).toLocaleString()}</span></p>
                            <p><span className="text-slate-400">原因:</span> {ev.raw_data.reason}</p>
                            <p><span className="text-slate-400">订单号:</span> {ev.raw_data.order_no}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200/80 flex items-center gap-2 shrink-0">
              {event.reviewed_at && (
                <div className="text-[11px] text-slate-400">
                  复核于 {formatDateCN(event.reviewed_at)}
                </div>
              )}
              <div className="flex-1" />
              {st && event.status !== 'closed' && (
                <>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                    st.bg, st.className
                  )}>
                    {event.status === 'pending' ? <Clock className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {st.label}
                  </span>
                </>
              )}
              {event.status === 'closed' && event.closed_at && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  关闭于 {formatDateCN(event.closed_at)}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            加载中...
          </div>
        )}
      </div>
    </div>
  )
}
