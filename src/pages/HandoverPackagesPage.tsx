import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import ConfirmModal from '@/components/ui/ConfirmModal'
import {
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Trash2,
  Eye,
  FileJson,
  AlertTriangle,
  Calendar,
  User,
  Flag,
  Clock,
  X,
  CheckCircle2,
  Users,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import type {
  HandoverPackageStatus,
  HandoverPriority,
  HandoverPackage,
  ImportHandoverPackageConflict,
  ImportHandoverConflictResolution,
} from '@/types'
import {
  STATUS_LABEL_MAP,
  PRIORITY_LABEL_MAP,
  PRIORITY_COLOR_MAP,
  filterHandoverPackages,
} from '@/services/handoverPackageService'
import { cn, formatDateCN } from '@/lib/utils'

const statusColorMap: Record<HandoverPackageStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
}

interface ImportResultState {
  show: boolean
  imported: HandoverPackage[]
  skipped: ImportHandoverPackageConflict[]
  warnings: string[]
}

interface ConflictDialogState {
  show: boolean
  conflicts: ImportHandoverPackageConflict[]
  resolutions: Record<string, ImportHandoverConflictResolution>
  file: File | null
}

export default function HandoverPackagesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handoverPackages = useAppStore((s) => s.handoverPackages)
  const deleteHandoverPackage = useAppStore((s) => s.deleteHandoverPackage)
  const exportHandoverPackages = useAppStore((s) => s.exportHandoverPackages)
  const importHandoverPackages = useAppStore((s) => s.importHandoverPackages)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<HandoverPackageStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<HandoverPriority | 'all'>('all')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; title: string }>({
    open: false,
    id: '',
    title: '',
  })
  const [importResult, setImportResult] = useState<ImportResultState>({
    show: false,
    imported: [],
    skipped: [],
    warnings: [],
  })
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState>({
    show: false,
    conflicts: [],
    resolutions: {},
    file: null,
  })

  const filteredPackages = useMemo(() => {
    return filterHandoverPackages(handoverPackages, {
      status: filterStatus === 'all' ? undefined : filterStatus,
      priority: filterPriority === 'all' ? undefined : filterPriority,
      assignee: filterAssignee,
      search: searchQuery,
    }).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
  }, [handoverPackages, filterStatus, filterPriority, filterAssignee, searchQuery])

  const statusStats = useMemo(() => {
    const stats: Record<HandoverPackageStatus | 'all', number> = {
      all: handoverPackages.length,
      pending: 0,
      processing: 0,
      completed: 0,
      cancelled: 0,
    }
    for (const pkg of handoverPackages) {
      stats[pkg.status]++
    }
    return stats
  }, [handoverPackages])

  const assignees = useMemo(() => {
    return Array.from(new Set(handoverPackages.map((p) => p.assignee))).filter(Boolean)
  }, [handoverPackages])

  const handleDelete = (pkg: HandoverPackage) => {
    setDeleteConfirm({ open: true, id: pkg.id, title: pkg.title })
  }

  const confirmDelete = () => {
    const result = deleteHandoverPackage(deleteConfirm.id)
    if (result.success) {
      toast.success(`已删除交接包「${deleteConfirm.title}」`)
    } else {
      toast.error(result.error || '删除失败')
    }
    setDeleteConfirm({ open: false, id: '', title: '' })
  }

  const handleExport = (pkg?: HandoverPackage) => {
    if (pkg) {
      exportHandoverPackages([pkg.id])
      toast.success(`已导出交接包「${pkg.title}」`)
    } else {
      exportHandoverPackages()
      toast.success(`已导出 ${handoverPackages.length} 个交接包`)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const parsed = JSON.parse(text)
    const packagesToCheck = parsed.packages || [parsed]
    
    // 先验证并收集冲突
    const existingPackages = handoverPackages
    const events = useAppStore.getState().events
    const existingIds = new Set(existingPackages.map((p) => p.id))
    const existingTitles = new Set(existingPackages.map((p) => p.title))
    const existingEventIds = new Set(events.map((e) => e.id))

    const conflicts: ImportHandoverPackageConflict[] = []

    for (const pkg of packagesToCheck) {
      if (existingIds.has(pkg.id)) {
        conflicts.push({
          type: 'duplicate_id',
          package_id: pkg.id,
          package_title: pkg.title,
          existing_id: pkg.id,
        })
      }
      if (existingTitles.has(pkg.title)) {
        conflicts.push({
          type: 'duplicate_title',
          package_id: pkg.id,
          package_title: pkg.title,
          existing_title: pkg.title,
        })
      }
      for (const snapshot of pkg.event_snapshots || []) {
        const currentEvent = events.find((e) => e.id === snapshot.id)
        if (!currentEvent) {
          conflicts.push({
            type: 'event_not_found',
            package_id: pkg.id,
            package_title: pkg.title,
            event_id: snapshot.id,
            event_title: snapshot.title,
          })
        } else if (currentEvent.status !== snapshot.status) {
          conflicts.push({
            type: 'event_status_conflict',
            package_id: pkg.id,
            package_title: pkg.title,
            event_id: snapshot.id,
            event_title: snapshot.title,
            expected_status: snapshot.status,
            actual_status: currentEvent.status,
          })
        }
      }
    }

    if (conflicts.length > 0) {
      // 有冲突，显示冲突处理对话框
      const initialResolutions: Record<string, ImportHandoverConflictResolution> = {}
      const firstConflictByPackage = new Map<string, ImportHandoverPackageConflict>()
      for (const conflict of conflicts) {
        const key = `${conflict.package_id}_${conflict.type}`
        if (!firstConflictByPackage.has(conflict.package_id)) {
          firstConflictByPackage.set(conflict.package_id, conflict)
          initialResolutions[key] = 'skip'
        }
      }
      setConflictDialog({
        show: true,
        conflicts,
        resolutions: initialResolutions,
        file,
      })
    } else {
      // 无冲突，直接导入
      const result = await importHandoverPackages(file)
      showImportResult(result)
    }

    e.target.value = ''
  }

  const showImportResult = (result: Awaited<ReturnType<typeof importHandoverPackages>>) => {
    if (result.success) {
      if (result.imported.length > 0) {
        toast.success(`成功导入 ${result.imported.length} 个交接包`)
      }
      if (result.skipped.length > 0) {
        toast.warning(`跳过 ${result.skipped.length} 个存在冲突的交接包`)
      }
    } else if (result.errors.length > 0) {
      toast.error(result.errors[0] || '导入失败')
    }

    if (result.imported.length > 0 || result.skipped.length > 0) {
      setImportResult({
        show: true,
        imported: result.imported,
        skipped: result.skipped,
        warnings: result.warnings,
      })
    }
  }

  const handleConflictResolution = (key: string, resolution: ImportHandoverConflictResolution) => {
    setConflictDialog((prev) => ({
      ...prev,
      resolutions: { ...prev.resolutions, [key]: resolution },
    }))
  }

  const handleImportWithResolutions = async () => {
    if (!conflictDialog.file) return

    const result = await importHandoverPackages(conflictDialog.file, conflictDialog.resolutions)
    showImportResult(result)
    setConflictDialog({ show: false, conflicts: [], resolutions: {}, file: null })
  }

  const getConflictDescription = (conflict: ImportHandoverPackageConflict): string => {
    switch (conflict.type) {
      case 'duplicate_id':
        return `ID 已存在: ${conflict.existing_id?.slice(-8)}`
      case 'duplicate_title':
        return `标题已存在: ${conflict.existing_title}`
      case 'event_not_found':
        return `事件「${conflict.event_title}」已不存在`
      case 'event_status_conflict':
        return `事件「${conflict.event_title}」状态不匹配（期望: ${conflict.expected_status}，实际: ${conflict.actual_status}）`
      default:
        return '未知冲突'
    }
  }

  return (
    <AppLayout title="交接包管理">
      <div className="space-y-4">
        <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigate('/handover-packages/create')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                新建交接包
              </button>

              <button
                onClick={() => handleExport()}
                disabled={handoverPackages.length === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                  handoverPackages.length > 0
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                )}
              >
                <Download className="w-4 h-4" />
                全部导出
              </button>

              <button
                onClick={handleImportClick}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
              >
                <Upload className="w-4 h-4" />
                导入 JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索标题、接手人、事件..."
                  className="w-64 pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400" />
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterStatus('all')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  filterStatus === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                全部 ({statusStats.all})
              </button>
              {(Object.keys(STATUS_LABEL_MAP) as HandoverPackageStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    filterStatus === status
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {STATUS_LABEL_MAP[status]} ({statusStats[status]})
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-slate-200 mx-2" />

            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterPriority('all')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  filterPriority === 'all'
                    ? 'bg-orange-500 text-white'
                    : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                )}
              >
                全部优先级
              </button>
              {(Object.keys(PRIORITY_LABEL_MAP) as HandoverPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    filterPriority === p
                      ? `${PRIORITY_COLOR_MAP[p]} shadow-sm`
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {PRIORITY_LABEL_MAP[p]}
                </button>
              ))}
            </div>

            {assignees.length > 0 && (
              <>
                <div className="h-5 w-px bg-slate-200 mx-2" />
                <select
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border-0 focus:outline-none focus:ring-2 focus:ring-blue-300/50"
                >
                  <option value="">全部接手人</option>
                  {assignees.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.length === 0 ? (
            <div className="col-span-full bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-12 text-center">
              <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-bold text-slate-700 mb-2">暂无交接包</h3>
              <p className="text-sm text-slate-400 mb-6">
                {searchQuery || filterStatus !== 'all' || filterPriority !== 'all' || filterAssignee
                  ? '没有符合筛选条件的交接包，请调整筛选条件'
                  : '点击上方「新建交接包」按钮开始创建第一个交接包'}
              </p>
              <button
                onClick={() => navigate('/handover-packages/create')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                新建交接包
              </button>
            </div>
          ) : (
            filteredPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-slate-800 line-clamp-2 flex-1">
                      {pkg.title}
                    </h3>
                    <div className="flex flex-col gap-1 items-end">
                      <span
                        className={cn(
                          'shrink-0 text-[10px] px-2 py-1 rounded-md font-medium border',
                          statusColorMap[pkg.status]
                        )}
                      >
                        {STATUS_LABEL_MAP[pkg.status]}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-[10px] px-2 py-0.5 rounded font-medium',
                          PRIORITY_COLOR_MAP[pkg.priority]
                        )}
                      >
                        {PRIORITY_LABEL_MAP[pkg.priority]}优先级
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <User className="w-3.5 h-3.5" />
                      <span>接手人：{pkg.assignee}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>事件数：{pkg.event_snapshots.length} 个</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>创建于：{formatDateCN(pkg.created_at)}</span>
                    </div>
                    {pkg.deadline && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span>截止：{formatDateCN(pkg.deadline)}</span>
                      </div>
                    )}
                    {pkg.completed_at && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>完成于：{formatDateCN(pkg.completed_at)}</span>
                      </div>
                    )}
                  </div>

                  {pkg.communication_records.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-2.5 mb-4">
                      <p className="text-[11px] text-slate-500 mb-1">最新沟通</p>
                      <p className="text-xs text-slate-700 line-clamp-2">
                        {pkg.communication_records[pkg.communication_records.length - 1].content}
                      </p>
                    </div>
                  )}

                  {pkg.undo_records.length > 0 && (
                    <div className="bg-amber-50 rounded-lg p-2.5 mb-4 border border-amber-200">
                      <p className="text-[11px] text-amber-600 mb-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        撤销记录
                      </p>
                      <p className="text-xs text-amber-700 line-clamp-2">
                        {pkg.undo_records[pkg.undo_records.length - 1].reason}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => navigate(`/handover-packages/${pkg.id}`)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      查看详情
                    </button>
                    <button
                      onClick={() => handleExport(pkg)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      导出
                    </button>
                    <button
                      onClick={() => handleDelete(pkg)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {deleteConfirm.open && (
        <ConfirmModal
          open={deleteConfirm.open}
          title="确认删除"
          description={`确定要删除交接包「${deleteConfirm.title}」吗？此操作不可撤销。`}
          confirmText="确认删除"
          cancelText="取消"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm({ open: false, id: '', title: '' })}
        />
      )}

      {conflictDialog.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setConflictDialog({ show: false, conflicts: [], resolutions: {}, file: null })}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col animate-modal-in">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">导入冲突</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    发现 {conflictDialog.conflicts.length} 个冲突，请选择处理方式
                  </p>
                </div>
                <button
                  onClick={() => setConflictDialog({ show: false, conflicts: [], resolutions: {}, file: null })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {conflictDialog.conflicts.map((conflict, idx) => {
                const key = `${conflict.package_id}_${conflict.type}`
                const resolution = conflictDialog.resolutions[key] || 'skip'
                return (
                  <div key={idx} className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-800">
                          交接包「{conflict.package_title}」
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          {getConflictDescription(conflict)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pl-8">
                      <span className="text-xs text-slate-500">处理方式：</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConflictResolution(key, 'skip')}
                          className={cn(
                            'px-3 py-1 rounded-lg text-xs font-medium transition-all',
                            resolution === 'skip'
                              ? 'bg-slate-700 text-white'
                              : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                          )}
                        >
                          跳过
                        </button>
                        {conflict.type === 'duplicate_title' && (
                          <button
                            onClick={() => handleConflictResolution(key, 'rename')}
                            className={cn(
                              'px-3 py-1 rounded-lg text-xs font-medium transition-all',
                              resolution === 'rename'
                                ? 'bg-blue-600 text-white'
                                : 'bg-white text-blue-600 border border-blue-200 hover:border-blue-300'
                            )}
                          >
                            重命名导入
                          </button>
                        )}
                        {(conflict.type === 'event_not_found' || conflict.type === 'event_status_conflict') && (
                          <button
                            onClick={() => handleConflictResolution(key, 'import_as_snapshot')}
                            className={cn(
                              'px-3 py-1 rounded-lg text-xs font-medium transition-all',
                              resolution === 'import_as_snapshot'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white text-emerald-600 border border-emerald-200 hover:border-emerald-300'
                            )}
                          >
                            按快照导入
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setConflictDialog({ show: false, conflicts: [], resolutions: {}, file: null })}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleImportWithResolutions}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-600 transition-all flex items-center justify-center gap-2"
              >
                确认导入
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {importResult.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setImportResult({ show: false, imported: [], skipped: [], warnings: [] })}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-modal-in">
            <button
              onClick={() => setImportResult({ show: false, imported: [], skipped: [], warnings: [] })}
              className="absolute right-4 top-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-800 mb-2">导入完成</h3>

            <div className="bg-slate-50 rounded-xl p-4 mb-5">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-emerald-600 mb-0.5">成功导入</p>
                  <p className="text-xl font-bold text-emerald-700">{importResult.imported.length}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-amber-600 mb-0.5">跳过冲突</p>
                  <p className="text-xl font-bold text-amber-700">{importResult.skipped.length}</p>
                </div>
              </div>

              {importResult.imported.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-semibold text-emerald-700 mb-1.5">已导入：</p>
                  <div className="space-y-1">
                    {importResult.imported.map((pkg, idx) => (
                      <div key={idx} className="text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                        ✓ {pkg.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1.5">已跳过（冲突）：</p>
                  <div className="space-y-1">
                    {importResult.skipped.map((conflict, idx) => (
                      <div key={idx} className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                        ⚠ {conflict.package_title} - {getConflictDescription(conflict)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setImportResult({ show: false, imported: [], skipped: [], warnings: [] })}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-slate-800 to-slate-900 text-white shadow-md hover:from-slate-900 hover:to-black transition-all"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
