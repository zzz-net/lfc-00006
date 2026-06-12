import { useState, useEffect } from 'react'
import { QualityEvent, EventStatus } from '@/types'
import { useAppStore } from '@/store'
import { Clock, Eye, CheckCircle2, XCircle, ArrowRight, AlertTriangle, Save } from 'lucide-react'
import { cn, formatDateCN } from '@/lib/utils'
import { typeMap, statusMap } from './EventTable'

interface ReviewEditorProps {
  event: QualityEvent | null
  onClose: () => void
}

export default function ReviewEditor({ event, onClose }: ReviewEditorProps) {
  const updateEventStatus = useAppStore((s) => s.updateEventStatus)
  const getEventEvidences = useAppStore((s) => s.getEventEvidences)
  const [note, setNote] = useState('')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  useEffect(() => {
    setNote(event?.review_note || '')
    setShowCloseConfirm(false)
  }, [event?.id])

  if (!event) {
    return (
      <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm h-full flex flex-col items-center justify-center p-12">
        <div className="w-20 h-20 mb-5 rounded-3xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
          <Eye className="w-9 h-9 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-700 mb-1.5">选择事件进行复核</h3>
        <p className="text-sm text-slate-500 text-center max-w-xs leading-relaxed">
          从左侧列表中选择一个质量事件，查看详细信息并执行复核操作。
        </p>
      </div>
    )
  }

  const st = statusMap[event.status]
  const StatusIcon = st.icon
  const evidences = getEventEvidences(event.id)

  const handleStart = () => {
    updateEventStatus(event.id, 'reviewing', note)
  }

  const handleSaveNote = () => {
    updateEventStatus(event.id, event.status, note)
  }

  const handleConfirmClose = () => {
    updateEventStatus(event.id, 'closed', note)
    setShowCloseConfirm(false)
  }

  return (
    <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm h-full flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200/60 shrink-0">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border',
                st.bg, st.className
              )}>
                <StatusIcon className="w-3 h-3" />
                {st.label}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">#{event.id.slice(-8)}</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 break-words leading-snug">{event.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-[10px] text-slate-500 mb-0.5">客户ID</p>
            <p className="text-xs font-mono font-semibold text-slate-700 truncate">{event.customer_id}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2.5">
            <p className="text-[10px] text-blue-600 mb-0.5">证据数</p>
            <p className="text-sm font-bold font-mono text-blue-700">{event.evidence_count}</p>
          </div>
          <div className="bg-rose-50 rounded-lg p-2.5">
            <p className="text-[10px] text-rose-600 mb-0.5">退款额</p>
            <p className="text-sm font-bold font-mono text-rose-700">¥{event.total_refund.toLocaleString()}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2.5">
            <p className="text-[10px] text-emerald-600 mb-0.5">类型数</p>
            <p className="text-sm font-bold font-mono text-emerald-700">{event.types.length}</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-slate-100 shrink-0">
        <p className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider font-semibold">命中类型</p>
        <div className="flex flex-wrap gap-1.5">
          {event.types.map((t) => (
            <span key={t} className={cn('text-xs px-3 py-1 rounded-lg font-medium', typeMap[t].className)}>
              {typeMap[t].label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">复核备注</label>
            <button
              onClick={handleSaveNote}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <Save className="w-3 h-3" />
              保存备注
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="输入复核备注、处理意见..."
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all resize-none leading-relaxed"
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h4 className="text-sm font-semibold text-slate-700">证据明细 ({evidences.length})</h4>
          </div>
          <div className="space-y-2.5">
            {evidences.slice(0, 8).map((ev) => (
              <div key={ev.id} className="bg-slate-50/80 rounded-xl border border-slate-200/60 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">
                    {ev.source_type === 'ticket' && '📋 工单'}
                    {ev.source_type === 'score' && '⭐ 评分'}
                    {ev.source_type === 'refund' && '💰 退款'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{formatDateCN(ev.occurred_at)}</span>
                </div>
                <p className="text-xs text-slate-600 font-mono leading-relaxed">
                  {JSON.stringify(ev.raw_data).slice(0, 120)}...
                </p>
              </div>
            ))}
            {evidences.length > 8 && (
              <p className="text-center text-xs text-slate-400 py-2">还有 {evidences.length - 8} 条证据...</p>
            )}
            {evidences.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-6">暂无证据</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-200/60 shrink-0 bg-slate-50/50 rounded-b-2xl">
        <div className="flex items-center gap-2">
          {event.status === 'pending' && (
            <button
              onClick={handleStart}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/20 hover:shadow-lg hover:from-blue-600 hover:to-blue-700 transition-all"
            >
              <Eye className="w-4 h-4" />
              开始复核
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {event.status === 'reviewing' && (
            <>
              <button
                onClick={() => updateEventStatus(event.id, 'pending', note)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <Clock className="w-4 h-4" />
                退回待处理
              </button>
              <button
                onClick={() => setShowCloseConfirm(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20 hover:shadow-lg hover:from-emerald-600 hover:to-emerald-700 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                关闭事件
              </button>
            </>
          )}
          {event.status === 'closed' && (
            <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-500">
              <CheckCircle2 className="w-4 h-4" />
              该事件已关闭
              {event.closed_at && <span className="text-xs font-normal">· {formatDateCN(event.closed_at)}</span>}
            </div>
          )}
        </div>
      </div>

      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowCloseConfirm(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-modal-in">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-800 mb-2">确认关闭该事件？</h3>
            <p className="text-sm text-center text-slate-500 mb-6 leading-relaxed">
              关闭后将无法重开，所有相关证据和备注将归档。请确认复核已完成。
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmClose}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all"
              >
                确认关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
