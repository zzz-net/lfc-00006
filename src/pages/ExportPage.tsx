import { useState, useMemo, useRef } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { buildExportFilteredEvents } from '@/services/exportService'
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Archive,
  UploadCloud,
  AlertTriangle,
  Database,
  FileCheck,
  Shield,
  CheckCircle2,
  Camera,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EventStatus, QualityEventType } from '@/types'

const STATUS_OPTIONS: { value: EventStatus; label: string; color: string }[] = [
  { value: 'pending', label: '待复核', color: 'amber' },
  { value: 'reviewing', label: '复核中', color: 'blue' },
  { value: 'closed', label: '已关闭', color: 'emerald' },
]

const TYPE_OPTIONS: { value: QualityEventType; label: string; color: string }[] = [
  { value: 'timeout', label: '超时', color: 'orange' },
  { value: 'low_score', label: '低分', color: 'rose' },
  { value: 'repeat_complaint', label: '重复投诉', color: 'violet' },
  { value: 'high_refund', label: '高额退款', color: 'cyan' },
]

export default function ExportPage() {
  const events = useAppStore((s) => s.events)
  const evidences = useAppStore((s) => s.evidences)
  const snapshots = useAppStore((s) => s.snapshots)
  const exportEvents = useAppStore((s) => s.exportEvents)
  const exportEvidences = useAppStore((s) => s.exportEvidences)
  const exportFullBackup = useAppStore((s) => s.exportFullBackup)
  const restoreFromBackup = useAppStore((s) => s.restoreFromBackup)
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedStatuses, setSelectedStatuses] = useState<Set<EventStatus>>(new Set(['pending', 'reviewing', 'closed']))
  const [selectedTypes, setSelectedTypes] = useState<Set<QualityEventType>>(new Set(['timeout', 'low_score', 'repeat_complaint', 'high_refund']))
  const [includeEvidences, setIncludeEvidences] = useState(true)
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [restoring, setRestoring] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null)
  const [restorePreview, setRestorePreview] = useState<{ eventCount: number; snapshotCount: number } | null>(null)

  const toggleStatus = (s: EventStatus) => {
    setSelectedStatuses((prev) => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  const toggleType = (t: QualityEventType) => {
    setSelectedTypes((prev) => {
      const n = new Set(prev)
      n.has(t) ? n.delete(t) : n.add(t)
      return n
    })
  }

  const preview = useMemo(() => {
    const filter = {
      statuses: selectedStatuses.size > 0 ? Array.from(selectedStatuses) : undefined,
      types: selectedTypes.size > 0 ? Array.from(selectedTypes) : undefined,
      includeEvidences,
    }
    const { filteredEvents, filteredEvidences } = buildExportFilteredEvents(events, evidences, filter)
    return { eventCount: filteredEvents.length, evidenceCount: filteredEvidences.length }
  }, [events, evidences, selectedStatuses, selectedTypes, includeEvidences])

  const getFilter = () => ({
    statuses: selectedStatuses.size > 0 ? Array.from(selectedStatuses) : undefined,
    types: selectedTypes.size > 0 ? Array.from(selectedTypes) : undefined,
    includeEvidences,
  })

  const handleExportEvents = () => {
    if (preview.eventCount === 0) {
      toast.warning('当前筛选条件下没有可导出的事件')
      return
    }
    exportEvents(getFilter(), format)
    toast.success(`已导出 ${preview.eventCount} 条事件（${format.toUpperCase()}格式）`)
  }

  const handleExportEvidences = () => {
    if (preview.evidenceCount === 0) {
      toast.warning('当前筛选条件下没有可导出的证据')
      return
    }
    const f = getFilter()
    exportEvidences({ statuses: f.statuses, types: f.types })
    toast.success(`已导出 ${preview.evidenceCount} 条证据明细（CSV格式）`)
  }

  const handleExportBackup = () => {
    exportFullBackup()
    toast.success(`全量备份已导出（共 ${events.length} 个事件）`)
  }

  const handleRestoreClick = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const state = parsed?.state || {}

      const eventCount = state.events?.length || 0
      const snapshotCount = state.snapshots?.length || 0

      setPendingRestoreFile(file)
      setRestorePreview({ eventCount, snapshotCount })
      setShowRestoreConfirm(true)
    } catch {
      toast.error('备份文件格式无效')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleConfirmRestore = async () => {
    if (!pendingRestoreFile) return

    setRestoring(true)
    setShowRestoreConfirm(false)

    try {
      const result = await restoreFromBackup(pendingRestoreFile)
      if (result.success) {
        let msg = `数据恢复成功：恢复了 ${result.eventCount} 个质量事件`
        if (result.snapshotCount > 0) {
          msg += `，以及 ${result.snapshotCount} 个快照`
        }
        toast.success(msg, 5000)
      } else {
        toast.error(`恢复失败：${result.error || '未知错误'}`)
      }
    } catch (err: any) {
      toast.error(`恢复失败：${err?.message || '未知错误'}`)
    } finally {
      setRestoring(false)
      setPendingRestoreFile(null)
      setRestorePreview(null)
    }
  }

  const handleCancelRestore = () => {
    setShowRestoreConfirm(false)
    setPendingRestoreFile(null)
    setRestorePreview(null)
  }

  return (
    <AppLayout title="数据导出">
      <div className="space-y-6">
        <section className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md">
                <Database className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">导出选项</h3>
                <p className="text-xs text-slate-500">配置筛选条件和导出格式，获取所需数据</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
                  导出范围 · 按状态
                </label>
                <div className="space-y-2">
                  {STATUS_OPTIONS.map((opt) => {
                    const checked = selectedStatuses.has(opt.value)
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                          checked
                            ? 'bg-blue-50 border-blue-200 shadow-sm'
                            : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStatus(opt.value)}
                          className="w-4.5 h-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                        />
                        <span className={cn('text-sm font-medium', checked ? 'text-blue-700' : 'text-slate-700')}>
                          {opt.label}
                        </span>
                        <span className="ml-auto text-xs font-mono text-slate-400">
                          {events.filter((e) => e.status === opt.value).length} 条
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
                  导出范围 · 按类型
                </label>
                <div className="space-y-2">
                  {TYPE_OPTIONS.map((opt) => {
                    const checked = selectedTypes.has(opt.value)
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                          checked
                            ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                            : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleType(opt.value)}
                          className="w-4.5 h-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400 cursor-pointer"
                        />
                        <span className={cn('text-sm font-medium', checked ? 'text-emerald-700' : 'text-slate-700')}>
                          {opt.label}
                        </span>
                        <span className="ml-auto text-xs font-mono text-slate-400">
                          {events.filter((e) => e.types.includes(opt.value)).length} 条
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50/70 border border-slate-200 cursor-pointer hover:bg-slate-50 transition-all w-fit">
                <input
                  type="checkbox"
                  checked={includeEvidences}
                  onChange={(e) => setIncludeEvidences(e.target.checked)}
                  className="w-4.5 h-4.5 rounded border-slate-300 text-slate-700 focus:ring-slate-400 cursor-pointer"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">包含证据明细</p>
                  <p className="text-xs text-slate-500">导出 JSON 时附带相关的详细证据数据</p>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
                格式选择
              </label>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 overflow-hidden p-1">
                <label className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg cursor-pointer transition-all',
                  format === 'csv' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                )}>
                  <input type="radio" checked={format === 'csv'} onChange={() => setFormat('csv')} className="sr-only" />
                  <FileSpreadsheet className="w-4 h-4" />
                  <span className="text-sm font-semibold">CSV</span>
                </label>
                <label className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg cursor-pointer transition-all',
                  format === 'json' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                )}>
                  <input type="radio" checked={format === 'json'} onChange={() => setFormat('json')} className="sr-only" />
                  <FileJson className="w-4 h-4" />
                  <span className="text-sm font-semibold">JSON</span>
                </label>
              </div>
            </div>
          </div>

          <div className="mx-6 mb-6 bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                  <FileCheck className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <p className="text-xs text-slate-300 uppercase tracking-wider font-semibold mb-0.5">预览统计</p>
                  <p className="text-sm">当前选择将导出的数据范围</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[11px] text-slate-400 mb-0.5">条事件</p>
                  <p className="text-2xl font-bold font-mono text-amber-300">{preview.eventCount}</p>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div className="text-right">
                  <p className="text-[11px] text-slate-400 mb-0.5">条证据</p>
                  <p className="text-2xl font-bold font-mono text-blue-300">{preview.evidenceCount}</p>
                </div>
                {snapshots.length > 0 && (
                  <>
                    <div className="w-px h-10 bg-white/10" />
                    <div className="text-right">
                      <p className="text-[11px] text-slate-400 mb-0.5">个快照</p>
                      <p className="text-2xl font-bold font-mono text-violet-300">{snapshots.length}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleExportEvents}
                disabled={preview.eventCount === 0}
                className="px-4 py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold text-sm shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <Download className="w-4.5 h-4.5" />
                导出事件
                <span className="bg-white/25 px-2 py-0.5 rounded-md text-xs font-mono">
                  {format.toUpperCase()}
                </span>
              </button>
              <button
                onClick={handleExportEvidences}
                disabled={preview.evidenceCount === 0}
                className="px-4 py-3.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold text-sm shadow-md shadow-violet-500/20 hover:from-violet-600 hover:to-purple-700 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4.5 h-4.5" />
                导出证据明细
                <span className="bg-white/25 px-2 py-0.5 rounded-md text-xs font-mono">CSV</span>
              </button>
              <button
                onClick={handleExportBackup}
                disabled={events.length === 0}
                className="px-4 py-3.5 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 text-white font-semibold text-sm shadow-md shadow-slate-500/20 hover:from-slate-800 hover:to-slate-900 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                <Archive className="w-4.5 h-4.5" />
                导出全量备份
                <span className="bg-white/25 px-2 py-0.5 rounded-md text-xs font-mono">JSON</span>
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white/85 backdrop-blur-sm rounded-2xl border-2 border-dashed border-amber-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-amber-100/50 bg-gradient-to-r from-amber-50/50 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">数据恢复</h3>
                <p className="text-xs text-slate-500">从之前的全量备份文件恢复完整数据</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-700 mb-1">⚠ 重要提示</p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  恢复操作将<span className="font-bold text-red-600">覆盖当前所有数据</span>（工单、评分、退款、事件、规则等）。
                  <br />强烈建议在恢复前，先点击上方的「导出全量备份」保存当前状态。
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={handleRestoreClick}
                disabled={restoring}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm shadow-md shadow-amber-500/20 hover:from-amber-600 hover:to-orange-600 hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <UploadCloud className="w-4.5 h-4.5" />
                {restoring ? '正在恢复...' : '从备份恢复'}
              </button>
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                支持 JSON 格式的全量备份文件
              </div>
            </div>
          </div>
        </section>
      </div>

      <ConfirmModal
        open={showRestoreConfirm}
        title="确认恢复备份？"
        description={
          <div className="text-left space-y-3">
            <p className="text-sm text-slate-600">
              此操作将<span className="font-bold text-red-600">覆盖当前所有数据</span>，包括：
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600">工单、评分、退款数据</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600">质量事件与证据</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600">规则配置</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-600">导入历史记录</span>
              </div>
            </div>

            {restorePreview && (
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-2">备份文件包含：</p>
                <div className="flex gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">事件：</span>
                    <span className="font-bold text-slate-700">{restorePreview.eventCount} 个</span>
                  </div>
                  {restorePreview.snapshotCount > 0 && (
                    <div className="flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-slate-500">快照：</span>
                      <span className="font-bold text-violet-700">{restorePreview.snapshotCount} 个</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              建议在恢复前先导出当前数据作为备份。
            </p>
          </div>
        }
        confirmText="确认恢复"
        cancelText="取消"
        variant="danger"
        onConfirm={handleConfirmRestore}
        onCancel={handleCancelRestore}
      />
    </AppLayout>
  )
}
