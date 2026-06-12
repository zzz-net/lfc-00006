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
  Tag,
  Clock,
  X,
  CheckCircle2,
} from 'lucide-react'
import type {
  ReviewPackageStatus,
  ReviewPackageCauseCategory,
  ReviewPackage,
  ImportReviewPackageConflict,
} from '@/types'
import {
  STATUS_LABEL_MAP,
  CAUSE_CATEGORY_LABEL_MAP,
  filterReviewPackages,
} from '@/services/reviewPackageService'
import { cn, formatDateCN } from '@/lib/utils'

const statusColorMap: Record<ReviewPackageStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  analyzing: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-gray-100 text-gray-600',
}

interface ImportResultState {
  show: boolean
  imported: ReviewPackage[]
  skipped: ImportReviewPackageConflict[]
  warnings: string[]
}

export default function ReviewPackagesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reviewPackages = useAppStore((s) => s.reviewPackages)
  const deleteReviewPackage = useAppStore((s) => s.deleteReviewPackage)
  const exportReviewPackages = useAppStore((s) => s.exportReviewPackages)
  const importReviewPackages = useAppStore((s) => s.importReviewPackages)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ReviewPackageStatus | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<ReviewPackageCauseCategory | 'all'>('all')
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

  const filteredPackages = useMemo(() => {
    return filterReviewPackages(reviewPackages, {
      status: filterStatus === 'all' ? undefined : filterStatus,
      causeCategory: filterCategory === 'all' ? undefined : filterCategory,
      search: searchQuery,
    }).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
  }, [reviewPackages, filterStatus, filterCategory, searchQuery])

  const statusStats = useMemo(() => {
    const stats: Record<ReviewPackageStatus | 'all', number> = {
      all: reviewPackages.length,
      draft: 0,
      analyzing: 0,
      resolved: 0,
      archived: 0,
    }
    for (const pkg of reviewPackages) {
      stats[pkg.status]++
    }
    return stats
  }, [reviewPackages])

  const handleDelete = (pkg: ReviewPackage) => {
    setDeleteConfirm({ open: true, id: pkg.id, title: pkg.title })
  }

  const confirmDelete = () => {
    const result = deleteReviewPackage(deleteConfirm.id)
    if (result.success) {
      toast.success(`已删除复盘包「${deleteConfirm.title}」`)
    } else {
      toast.error(result.error || '删除失败')
    }
    setDeleteConfirm({ open: false, id: '', title: '' })
  }

  const handleExport = (pkg?: ReviewPackage) => {
    if (pkg) {
      exportReviewPackages([pkg.id])
      toast.success(`已导出复盘包「${pkg.title}」`)
    } else {
      exportReviewPackages()
      toast.success(`已导出 ${reviewPackages.length} 个复盘包`)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const result = await importReviewPackages(file)

    if (result.success) {
      if (result.imported.length > 0) {
        toast.success(`成功导入 ${result.imported.length} 个复盘包`)
      }
      if (result.skipped.length > 0) {
        toast.warning(`跳过 ${result.skipped.length} 个存在冲突的复盘包`)
      }
    } else {
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

    e.target.value = ''
  }

  return (
    <AppLayout title="复盘包管理">
      <div className="space-y-4">
        <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => navigate('/review-packages/create')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                新建复盘包
              </button>

              <button
                onClick={() => handleExport()}
                disabled={reviewPackages.length === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                  reviewPackages.length > 0
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
                  placeholder="搜索标题、负责人、事件..."
                  className="w-64 pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
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
              {(Object.keys(STATUS_LABEL_MAP) as ReviewPackageStatus[]).map((status) => (
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
                onClick={() => setFilterCategory('all')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  filterCategory === 'all'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                )}
              >
                全部分类
              </button>
              {(Object.keys(CAUSE_CATEGORY_LABEL_MAP) as ReviewPackageCauseCategory[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    filterCategory === cat
                      ? 'bg-indigo-500 text-white'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                  )}
                >
                  {CAUSE_CATEGORY_LABEL_MAP[cat]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPackages.length === 0 ? (
            <div className="col-span-full bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-12 text-center">
              <FileJson className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-bold text-slate-700 mb-2">暂无复盘包</h3>
              <p className="text-sm text-slate-400 mb-6">
                {searchQuery || filterStatus !== 'all' || filterCategory !== 'all'
                  ? '没有符合筛选条件的复盘包，请调整筛选条件'
                  : '点击上方「新建复盘包」按钮开始创建第一个复盘包'}
              </p>
              <button
                onClick={() => navigate('/review-packages/create')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                新建复盘包
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
                    <span
                      className={cn(
                        'shrink-0 text-[10px] px-2 py-1 rounded-md font-medium',
                        statusColorMap[pkg.status]
                      )}
                    >
                      {STATUS_LABEL_MAP[pkg.status]}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <User className="w-3.5 h-3.5" />
                      <span>负责人：{pkg.responsible}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{CAUSE_CATEGORY_LABEL_MAP[pkg.cause_category]}</span>
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
                  </div>

                  {pkg.remarks.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-2.5 mb-4">
                      <p className="text-[11px] text-slate-500 mb-1">最新备注</p>
                      <p className="text-xs text-slate-700 line-clamp-2">
                        {pkg.remarks[pkg.remarks.length - 1].content}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => navigate(`/review-packages/${pkg.id}`)}
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
          description={`确定要删除复盘包「${deleteConfirm.title}」吗？此操作不可撤销。`}
          confirmText="确认删除"
          cancelText="取消"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm({ open: false, id: '', title: '' })}
        />
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
                        ⚠ {conflict.package_title} -{' '}
                        {conflict.type === 'duplicate_id'
                          ? `ID 已存在: ${conflict.existing_id?.slice(-8)}`
                          : `标题已存在: ${conflict.existing_title}`}
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
