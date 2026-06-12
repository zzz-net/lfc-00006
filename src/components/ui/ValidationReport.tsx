import { useAppStore } from '@/store'
import { ImportRecord } from '@/types'
import { FileCheck, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { cn, formatDateCN } from '@/lib/utils'

export default function ValidationReport() {
  const records = useAppStore((s) => s.importRecords)
  const events = useAppStore((s) => s.events)
  const evidences = useAppStore((s) => s.evidences)

  const sorted = [...records].sort((a, b) => b.imported_at.getTime() - a.imported_at.getTime())
  const latest: ImportRecord | undefined = sorted[0]

  if (!latest) return null

  const totalValid = records.reduce((s, r) => s + r.valid_count, 0)
  const totalInvalid = records.reduce((s, r) => s + r.invalid_count, 0)
  const totalErrors = records.reduce((s, r) => s + r.errors.length, 0)

  return (
    <div className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 rounded-2xl p-6 text-white shadow-xl animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
          <FileCheck className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <h3 className="text-base font-bold">验证报告</h3>
          <p className="text-xs text-slate-300">最近导入: {latest.file_name} · {formatDateCN(latest.imported_at)}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
          <p className="text-[11px] text-slate-300 mb-1">总记录数</p>
          <p className="text-xl font-bold font-mono">{records.reduce((s, r) => s + r.total_count, 0)}</p>
        </div>
        <div className="bg-emerald-500/20 rounded-xl p-3 backdrop-blur-sm border border-emerald-400/20">
          <div className="flex items-center gap-1 mb-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-300" />
            <p className="text-[11px] text-emerald-200">有效记录</p>
          </div>
          <p className="text-xl font-bold font-mono text-emerald-200">{totalValid}</p>
        </div>
        <div className="bg-red-500/20 rounded-xl p-3 backdrop-blur-sm border border-red-400/20">
          <div className="flex items-center gap-1 mb-1">
            <XCircle className="w-3 h-3 text-red-300" />
            <p className="text-[11px] text-red-200">无效记录</p>
          </div>
          <p className="text-xl font-bold font-mono text-red-200">{totalInvalid}</p>
        </div>
        <div className="bg-amber-500/20 rounded-xl p-3 backdrop-blur-sm border border-amber-400/20">
          <div className="flex items-center gap-1 mb-1">
            <AlertCircle className="w-3 h-3 text-amber-300" />
            <p className="text-[11px] text-amber-200">解析错误</p>
          </div>
          <p className="text-xl font-bold font-mono text-amber-200">{totalErrors}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-5 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">质量事件</span>
          <span className="text-lg font-bold font-mono text-amber-300">{events.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">关联证据</span>
          <span className="text-lg font-bold font-mono text-blue-300">{evidences.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">涉及客户</span>
          <span className="text-lg font-bold font-mono text-emerald-300">
            {new Set(events.map((e) => e.customer_id)).size}
          </span>
        </div>
      </div>

      {totalErrors > 0 && (
        <div className="mt-5 p-3 rounded-xl bg-red-500/10 border border-red-400/20 text-xs text-red-200 leading-relaxed">
          <AlertCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          检测到 {totalErrors} 条数据验证错误，请检查导入记录中的错误明细以修正源数据。
        </div>
      )}
    </div>
  )
}
