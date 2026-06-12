import { ImportRecord } from '@/types'
import { useAppStore } from '@/store'
import { FileText, Star, Banknote, CheckCircle2, AlertTriangle, XCircle, Download } from 'lucide-react'
import { cn, formatDateCN } from '@/lib/utils'
import { downloadBlob } from '@/services/exportService'
import { useToast } from '@/components/ToastProvider'

const typeMeta: Record<string, { label: string; icon: typeof FileText; className: string; bg: string }> = {
  ticket: { label: '工单', icon: FileText, className: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  score: { label: '评分', icon: Star, className: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  refund: { label: '退款', icon: Banknote, className: 'text-red-700', bg: 'bg-red-50 border-red-200' },
}

export default function ImportRecordList() {
  const records = useAppStore((s) => s.importRecords)
  const toast = useToast()
  const sorted = [...records].sort((a, b) => b.imported_at.getTime() - a.imported_at.getTime())

  const handleDownload = (record: ImportRecord) => {
    if (!record.raw_content) {
      toast.error('该记录无原始文件内容')
      return
    }
    const mime = record.file_type === 'refund' ? 'application/json' : 'text/csv;charset=utf-8'
    downloadBlob(new Blob([record.raw_content], { type: mime }), record.file_name)
    toast.success(`${record.file_name} 已下载`)
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-white/70 rounded-2xl border border-slate-200/60 p-12 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
          <FileText className="w-6 h-6 text-slate-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 mb-1">暂无导入记录</h3>
        <p className="text-sm text-slate-400">上传数据文件后将在此显示历史记录</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sorted.map((r, idx) => {
        const meta = typeMeta[r.file_type] || typeMeta.ticket
        const Icon = meta.icon
        const hasError = r.errors.length > 0 || r.invalid_count > 0
        return (
          <div
            key={r.id}
            style={{ animationDelay: `${idx * 30}ms` }}
            className={cn(
              'bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-4 shadow-sm animate-fade-in-up'
            )}
          >
            <div className="flex items-start gap-4">
              <div className={cn(
                'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border',
                meta.bg
              )}>
                <Icon className={cn('w-5 h-5', meta.className)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-md font-medium border', meta.bg, meta.className)}>
                        {meta.label}
                      </span>
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.file_name}</p>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      导入于 {formatDateCN(r.imported_at)} · #{r.id.slice(-6)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!hasError ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium bg-emerald-50 px-2 py-1 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />
                        成功
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium bg-amber-50 px-2 py-1 rounded-lg">
                        <AlertTriangle className="w-3 h-3" />
                        部分失败
                      </span>
                    )}
                    <button
                      onClick={() => handleDownload(r)}
                      title="下载原始文件"
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                        'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700',
                        meta.bg.replace('bg-', 'hover:bg-').replace('-50', '-100')
                      )}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mt-3">
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-500 mb-0.5">总计</p>
                    <p className="text-sm font-bold text-slate-700 font-mono">{r.total_count}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-emerald-600 mb-0.5">有效</p>
                    <p className="text-sm font-bold text-emerald-700 font-mono">{r.valid_count}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-red-600 mb-0.5">无效</p>
                    <p className="text-sm font-bold text-red-700 font-mono">{r.invalid_count}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-blue-600 mb-0.5">错误数</p>
                    <p className="text-sm font-bold text-blue-700 font-mono">{r.errors.length}</p>
                  </div>
                </div>

                {r.errors.length > 0 && (
                  <div className="mt-3 bg-red-50 border border-red-100 rounded-xl p-3 max-h-32 overflow-y-auto">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <XCircle className="w-3.5 h-3.5 text-red-500" />
                      <p className="text-[11px] font-semibold text-red-700">错误明细</p>
                    </div>
                    <ul className="space-y-0.5">
                      {r.errors.slice(0, 5).map((e, i) => (
                        <li key={i} className="text-[11px] text-red-600 font-mono leading-relaxed">
                          第{e.line}行 [{e.field}]: {e.message}
                        </li>
                      ))}
                      {r.errors.length > 5 && (
                        <li className="text-[11px] text-red-500 italic">... 还有 {r.errors.length - 5} 条错误</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
