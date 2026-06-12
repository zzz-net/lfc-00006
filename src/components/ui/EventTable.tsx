import { QualityEvent, EventStatus, QualityEventType } from '@/types'
import { useAppStore } from '@/store'
import { Eye, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { cn, formatDateCN } from '@/lib/utils'

interface EventTableProps {
  events?: QualityEvent[]
}

const statusMap: Record<EventStatus, { label: string; icon: typeof Clock; className: string; bg: string }> = {
  pending: { label: '待复核', icon: Clock, className: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  reviewing: { label: '复核中', icon: Eye, className: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  closed: { label: '已关闭', icon: CheckCircle2, className: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
}

const typeMap: Record<QualityEventType, { label: string; className: string }> = {
  timeout: { label: '超时', className: 'bg-orange-100 text-orange-700' },
  low_score: { label: '低分', className: 'bg-rose-100 text-rose-700' },
  repeat_complaint: { label: '重复', className: 'bg-violet-100 text-violet-700' },
  high_refund: { label: '高额', className: 'bg-cyan-100 text-cyan-700' },
}

export default function EventTable({ events }: EventTableProps) {
  const storeEvents = useAppStore((s) => s.events)
  const setSelectedEvent = useAppStore((s) => s.setSelectedEvent)
  const selectedId = useAppStore((s) => s.uiState.selectedEventId)

  const displayEvents = events || storeEvents

  if (displayEvents.length === 0) {
    return (
      <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1">暂无质量事件</h3>
        <p className="text-sm text-slate-400">请先导入数据或生成样例数据</p>
      </div>
    )
  }

  return (
    <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200/60">
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">事件 / 客户</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">类型</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">证据数</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">退款额</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">首次发现</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">状态</th>
            </tr>
          </thead>
          <tbody>
            {displayEvents.map((ev, idx) => {
              const st = statusMap[ev.status]
              const StatusIcon = st.icon
              return (
                <tr
                  key={ev.id}
                  onClick={() => setSelectedEvent(ev.id)}
                  style={{ animationDelay: `${idx * 20}ms` }}
                  className={cn(
                    'border-b border-slate-100/80 last:border-b-0 cursor-pointer transition-all duration-150',
                    selectedId === ev.id ? 'bg-blue-50/70' : 'hover:bg-slate-50/60'
                  )}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4 text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate max-w-[280px]">{ev.title}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{ev.id.slice(-8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {ev.types.map((t) => (
                        <span key={t} className={cn('text-[11px] px-2 py-0.5 rounded-md font-medium', typeMap[t].className)}>
                          {typeMap[t].label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-slate-700 font-semibold">{ev.evidence_count}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={cn('font-mono font-semibold', ev.total_refund > 0 ? 'text-rose-600' : 'text-slate-400')}>
                      ¥{ev.total_refund.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-slate-500 font-mono">{formatDateCN(ev.first_seen_at)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border',
                      st.bg, st.className
                    )}>
                      <StatusIcon className="w-3 h-3" />
                      {st.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export { statusMap, typeMap }
