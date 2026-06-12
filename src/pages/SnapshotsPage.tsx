import { useState, useMemo } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { computeSnapshotDiff, getRuleFieldLabel } from '@/services/snapshotService'
import {
  Camera,
  Plus,
  Trash2,
  Undo2,
  GitCompare,
  ChevronDown,
  ChevronUp,
  X,
  Clock,
  FileText,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  RefreshCw,
  Edit3,
  Check,
  ArrowLeftRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import type { AnalysisSnapshot, SnapshotDiffResult, QualityEventType, EventStatus } from '@/types'

const TYPE_LABELS: Record<QualityEventType, string> = {
  timeout: '超时',
  low_score: '低分',
  repeat_complaint: '重复投诉',
  high_refund: '高额退款',
}

const STATUS_LABELS: Record<EventStatus, string> = {
  pending: '待复核',
  reviewing: '复核中',
  closed: '已关闭',
}

const STATUS_COLORS: Record<EventStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  reviewing: 'bg-blue-100 text-blue-700',
  closed: 'bg-emerald-100 text-emerald-700',
}

export default function SnapshotsPage() {
  const snapshots = useAppStore((s) => s.snapshots)
  const saveAnalysisSnapshot = useAppStore((s) => s.saveAnalysisSnapshot)
  const deleteSnapshot = useAppStore((s) => s.deleteSnapshot)
  const undoDeleteSnapshot = useAppStore((s) => s.undoDeleteSnapshot)
  const canUndoDeleteSnapshot = useAppStore((s) => s.canUndoDeleteSnapshot)
  const renameSnapshot = useAppStore((s) => s.renameSnapshot)
  const toast = useToast()

  const [snapshotName, setSnapshotName] = useState('')
  const [snapshotDesc, setSnapshotDesc] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedOldId, setSelectedOldId] = useState<string | null>(null)
  const [selectedNewId, setSelectedNewId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showDiffFilter, setShowDiffFilter] = useState<'all' | 'added' | 'removed' | 'changed' | 'unchanged'>('all')

  const diffResult = useMemo(() => {
    if (!selectedOldId || !selectedNewId) return null
    const oldSnap = snapshots.find((s) => s.id === selectedOldId)
    const newSnap = snapshots.find((s) => s.id === selectedNewId)
    if (!oldSnap || !newSnap) return null
    return computeSnapshotDiff(oldSnap, newSnap)
  }, [selectedOldId, selectedNewId, snapshots])

  const filteredDiffs = useMemo(() => {
    if (!diffResult) return []
    if (showDiffFilter === 'all') return diffResult.event_diffs
    if (showDiffFilter === 'added') return diffResult.event_diffs.filter((d) => d.change_type === 'added')
    if (showDiffFilter === 'removed') return diffResult.event_diffs.filter((d) => d.change_type === 'removed')
    if (showDiffFilter === 'changed') return diffResult.event_diffs.filter((d) => d.change_type === 'status_changed' || d.change_type === 'type_changed')
    if (showDiffFilter === 'unchanged') return diffResult.event_diffs.filter((d) => d.change_type === 'unchanged')
    return []
  }, [diffResult, showDiffFilter])

  const handleSaveSnapshot = () => {
    const result = saveAnalysisSnapshot(snapshotName || undefined, snapshotDesc || undefined)
    if (result.success) {
      toast.success(`快照「${result.snapshot?.name}」已保存`)
      setSnapshotName('')
      setSnapshotDesc('')
      setShowSaveModal(false)
    } else {
      if (result.isDuplicate) {
        toast.warning(result.error || '当前状态与已有快照相同')
      } else if (result.isEmpty) {
        toast.error(result.error || '无法保存空快照')
      } else {
        toast.error(result.error || '保存失败')
      }
    }
  }

  const handleDeleteSnapshot = (id: string) => {
    const result = deleteSnapshot(id)
    if (result.success) {
      toast.success(result.message)
    }
    setDeleteConfirmId(null)
  }

  const handleUndoDelete = () => {
    const result = undoDeleteSnapshot()
    if (result.success) {
      toast.success(result.message)
    } else {
      toast.warning(result.message)
    }
  }

  const handleStartRename = (snap: AnalysisSnapshot) => {
    setEditingId(snap.id)
    setEditingName(snap.name)
  }

  const handleConfirmRename = () => {
    if (!editingId) return
    const result = renameSnapshot(editingId, editingName)
    if (result.success) {
      toast.success('重命名成功')
      setEditingId(null)
      setEditingName('')
    } else {
      toast.error(result.error || '重命名失败')
    }
  }

  const toggleCompareMode = () => {
    setCompareMode(!compareMode)
    setSelectedOldId(null)
    setSelectedNewId(null)
    setShowDiffFilter('all')
  }

  const handleSelectForCompare = (id: string) => {
    if (!compareMode) return
    if (!selectedOldId) {
      setSelectedOldId(id)
    } else if (!selectedNewId && id !== selectedOldId) {
      setSelectedNewId(id)
    } else {
      setSelectedOldId(id)
      setSelectedNewId(null)
    }
  }

  const clearComparison = () => {
    setSelectedOldId(null)
    setSelectedNewId(null)
    setShowDiffFilter('all')
  }

  return (
    <AppLayout title="快照对比">
      <div className="space-y-6">
        <section className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/50 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                  <Camera className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">分析快照</h3>
                  <p className="text-xs text-slate-500">保存分析状态，对比不同时期的质量数据</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canUndoDeleteSnapshot() && (
                  <button
                    onClick={handleUndoDelete}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors"
                  >
                    <Undo2 className="w-4 h-4" />
                    撤销删除
                  </button>
                )}
                <button
                  onClick={toggleCompareMode}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                    compareMode
                      ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20 hover:bg-blue-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  )}
                >
                  <GitCompare className="w-4 h-4" />
                  {compareMode ? '退出对比' : '对比模式'}
                </button>
                <button
                  onClick={() => setShowSaveModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700 hover:shadow-lg transition-all"
                >
                  <Plus className="w-4 h-4" />
                  保存快照
                </button>
              </div>
            </div>
          </div>

          {compareMode && (selectedOldId || selectedNewId) && (
            <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-blue-700">
                    <span className="text-blue-500">●</span> 旧快照：
                    <span className="font-semibold">
                      {snapshots.find((s) => s.id === selectedOldId)?.name || '未选择'}
                    </span>
                  </span>
                  <ArrowLeftRight className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-emerald-700">
                    <span className="text-emerald-500">●</span> 新快照：
                    <span className="font-semibold">
                      {snapshots.find((s) => s.id === selectedNewId)?.name || '未选择'}
                    </span>
                  </span>
                </div>
                {selectedOldId && selectedNewId && (
                  <button
                    onClick={clearComparison}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="p-6">
            {snapshots.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <Camera className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 mb-2">暂无快照</p>
                <p className="text-xs text-slate-400 mb-4">导入数据并分析后，点击「保存快照」记录当前分析状态</p>
                <button
                  onClick={() => setShowSaveModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  保存第一张快照
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map((snap) => (
                  <SnapshotCard
                    key={snap.id}
                    snapshot={snap}
                    expanded={expandedId === snap.id}
                    onToggleExpand={() => setExpandedId(expandedId === snap.id ? null : snap.id)}
                    onDelete={() => setDeleteConfirmId(snap.id)}
                    onRename={() => handleStartRename(snap)}
                    compareMode={compareMode}
                    isOldSelected={selectedOldId === snap.id}
                    isNewSelected={selectedNewId === snap.id}
                    onSelectForCompare={() => handleSelectForCompare(snap.id)}
                    editing={editingId === snap.id}
                    editingName={editingName}
                    onEditingNameChange={setEditingName}
                    onConfirmRename={handleConfirmRename}
                    onCancelRename={() => { setEditingId(null); setEditingName('') }}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {diffResult && (
          <DiffView
            diff={diffResult}
            filteredDiffs={filteredDiffs}
            filter={showDiffFilter}
            onFilterChange={(f) => setShowDiffFilter(f)}
          />
        )}
      </div>

      <ConfirmModal
        open={showSaveModal}
        title="保存分析快照"
        description={
          <div className="space-y-3">
            <p className="text-sm text-slate-600">为当前分析状态创建一个快照，便于后续对比分析。</p>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                快照名称
              </label>
              <input
                type="text"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder="输入快照名称（可选，自动生成）"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                备注说明
              </label>
              <textarea
                value={snapshotDesc}
                onChange={(e) => setSnapshotDesc(e.target.value)}
                placeholder="可选备注说明"
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 resize-none"
              />
            </div>
          </div>
        }
        confirmText="保存快照"
        cancelText="取消"
        onConfirm={handleSaveSnapshot}
        onCancel={() => { setShowSaveModal(false); setSnapshotName(''); setSnapshotDesc('') }}
      />

      <ConfirmModal
        open={deleteConfirmId !== null}
        title="删除快照"
        description={
          <div className="text-sm text-slate-600">
            确定要删除快照「{snapshots.find((s) => s.id === deleteConfirmId)?.name}」吗？
            <br />
            删除后可以立即撤销一次。
          </div>
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        onConfirm={() => deleteConfirmId && handleDeleteSnapshot(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </AppLayout>
  )
}

interface SnapshotCardProps {
  snapshot: AnalysisSnapshot
  expanded: boolean
  onToggleExpand: () => void
  onDelete: () => void
  onRename: () => void
  compareMode: boolean
  isOldSelected: boolean
  isNewSelected: boolean
  onSelectForCompare: () => void
  editing: boolean
  editingName: string
  onEditingNameChange: (name: string) => void
  onConfirmRename: () => void
  onCancelRename: () => void
}

function SnapshotCard({
  snapshot,
  expanded,
  onToggleExpand,
  onDelete,
  onRename,
  compareMode,
  isOldSelected,
  isNewSelected,
  onSelectForCompare,
  editing,
  editingName,
  onEditingNameChange,
  onConfirmRename,
  onCancelRename,
}: SnapshotCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onConfirmRename()
    if (e.key === 'Escape') onCancelRename()
  }

  return (
    <div
      className={cn(
        'rounded-xl border transition-all cursor-pointer',
        compareMode && (isOldSelected || isNewSelected)
          ? isOldSelected
            ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-200'
            : 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-200'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
        compareMode && 'hover:border-blue-300'
      )}
      onClick={compareMode ? onSelectForCompare : onToggleExpand}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => onEditingNameChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); onConfirmRename() }}
                  className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCancelRename() }}
                  className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1">
                {compareMode && isOldSelected && (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500 text-white font-bold">旧</span>
                )}
                {compareMode && isNewSelected && (
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500 text-white font-bold">新</span>
                )}
                <h4 className="text-sm font-bold text-slate-800 truncate">{snapshot.name}</h4>
              </div>
            )}
            {snapshot.description && (
              <p className="text-xs text-slate-500 mb-2 line-clamp-1">{snapshot.description}</p>
            )}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {dayjs(snapshot.created_at).format('YYYY-MM-DD HH:mm')}
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                {snapshot.event_count} 个事件
              </span>
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" />
                {snapshot.batch_summary.file_count} 个文件
              </span>
            </div>
          </div>
          {!compareMode && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={onRename}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="重命名"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </div>
          )}
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="grid grid-cols-4 gap-3 mb-4">
              <StatMini label="事件总数" value={snapshot.event_count} color="slate" />
              <StatMini label="待复核" value={snapshot.by_status.pending} color="amber" />
              <StatMini label="复核中" value={snapshot.by_status.reviewing} color="blue" />
              <StatMini label="已关闭" value={snapshot.by_status.closed} color="emerald" />
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4">
              <StatMini label="超时工单" value={snapshot.by_type.timeout} color="amber" />
              <StatMini label="低分投诉" value={snapshot.by_type.low_score} color="rose" />
              <StatMini label="重复投诉" value={snapshot.by_type.repeat_complaint} color="violet" />
              <StatMini label="高额退款" value={snapshot.by_type.high_refund} color="blue" />
            </div>

            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">规则配置</p>
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
                <div>超时阈值：<span className="font-medium text-slate-700">{snapshot.rules.timeout_hours}小时</span></div>
                <div>最低评分：<span className="font-medium text-slate-700">{snapshot.rules.min_score}分</span></div>
                <div>重复窗口：<span className="font-medium text-slate-700">{snapshot.rules.repeat_days}天/{snapshot.rules.repeat_count}次</span></div>
                <div>高额退款：<span className="font-medium text-slate-700">¥{snapshot.rules.high_refund_amount}</span></div>
                <div>数据文件：<span className="font-medium text-slate-700">{snapshot.batch_summary.file_count}个</span></div>
                <div>有效数据：<span className="font-medium text-slate-700">{snapshot.batch_summary.valid_count}条</span></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface StatMiniProps {
  label: string
  value: number
  color: 'slate' | 'amber' | 'blue' | 'emerald' | 'rose' | 'violet'
}

function StatMini({ label, value, color }: StatMiniProps) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-100',
    amber: 'text-amber-600 bg-amber-50',
    blue: 'text-blue-600 bg-blue-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    rose: 'text-rose-600 bg-rose-50',
    violet: 'text-violet-600 bg-violet-50',
  }

  return (
    <div className={cn('rounded-lg p-2.5', colorMap[color])}>
      <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}

interface DiffViewProps {
  diff: SnapshotDiffResult
  filteredDiffs: SnapshotDiffResult['event_diffs']
  filter: 'all' | 'added' | 'removed' | 'changed' | 'unchanged'
  onFilterChange: (filter: 'all' | 'added' | 'removed' | 'changed' | 'unchanged') => void
}

function DiffView({ diff, filteredDiffs, filter, onFilterChange }: DiffViewProps) {
  const filterTabs = [
    { key: 'all', label: '全部', count: diff.event_diffs.length },
    { key: 'added', label: '新增', count: diff.total_added },
    { key: 'removed', label: '消失', count: diff.total_removed },
    { key: 'changed', label: '变化', count: diff.total_status_changed + diff.total_type_changed },
    { key: 'unchanged', label: '未变', count: diff.total_unchanged },
  ]

  return (
    <section className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <GitCompare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">差异对比</h3>
            <p className="text-xs text-slate-500">
              「{diff.old_snapshot_name}」 → 「{diff.new_snapshot_name}」
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-5 gap-4">
          <DiffStatCard label="新增事件" value={diff.total_added} icon={ArrowUp} color="emerald" />
          <DiffStatCard label="消失事件" value={diff.total_removed} icon={ArrowDown} color="red" />
          <DiffStatCard label="状态变化" value={diff.total_status_changed} icon={RefreshCw} color="amber" />
          <DiffStatCard label="类型变化" value={diff.total_type_changed} icon={AlertTriangle} color="violet" />
          <DiffStatCard label="未变化" value={diff.total_unchanged} icon={Minus} color="slate" />
        </div>

        {diff.rule_diffs.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              规则配置变化
            </h4>
            <div className="space-y-2">
              {diff.rule_diffs.map((rd) => (
                <div key={rd.field} className="flex items-center justify-between text-sm">
                  <span className="text-amber-700">{getRuleFieldLabel(rd.field)}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-amber-600">{rd.old_value}</span>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-mono font-bold text-amber-800">{rd.new_value}</span>
                  </div>
                  <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                    {rd.impact_note}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-slate-700">事件差异明细</span>
            <div className="flex gap-1 ml-4">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => onFilterChange(tab.key as any)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    filter === tab.key
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">变化类型</th>
                  <th className="text-left px-4 py-2.5 font-medium">事件标题</th>
                  <th className="text-left px-4 py-2.5 font-medium">客户</th>
                  <th className="text-left px-4 py-2.5 font-medium">类型变化</th>
                  <th className="text-left px-4 py-2.5 font-medium">状态变化</th>
                  <th className="text-right px-4 py-2.5 font-medium">证据数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDiffs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  filteredDiffs.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <DiffBadge type={d.change_type} />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 truncate max-w-xs">
                        {d.title}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                        {d.customer_id}
                      </td>
                      <td className="px-4 py-3">
                        <TypeDiff oldTypes={d.old_types} newTypes={d.new_types} changeType={d.change_type} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusDiff oldStatus={d.old_status} newStatus={d.new_status} changeType={d.change_type} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {d.old_evidence_count !== undefined && d.new_evidence_count !== undefined && d.old_evidence_count !== d.new_evidence_count ? (
                          <span className={cn(d.new_evidence_count > d.old_evidence_count ? 'text-emerald-600' : 'text-red-500')}>
                            {d.new_evidence_count > d.old_evidence_count ? '+' : ''}{d.new_evidence_count - d.old_evidence_count}
                          </span>
                        ) : (
                          d.new_evidence_count ?? d.old_evidence_count ?? '-'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

interface DiffStatCardProps {
  label: string
  value: number
  icon: any
  color: 'emerald' | 'red' | 'amber' | 'violet' | 'slate'
}

function DiffStatCard({ label, value, icon: Icon, color }: DiffStatCardProps) {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', iconBg: 'bg-emerald-100' },
    red: { bg: 'bg-red-50', text: 'text-red-600', iconBg: 'bg-red-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', iconBg: 'bg-amber-100' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', iconBg: 'bg-violet-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', iconBg: 'bg-slate-100' },
  }

  const c = colorMap[color]

  return (
    <div className={cn('rounded-xl p-4', c.bg)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', c.iconBg)}>
          <Icon className={cn('w-4 h-4', c.text)} />
        </div>
        <span className="text-xs font-medium text-slate-600">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold', c.text)}>{value}</p>
    </div>
  )
}

function DiffBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; className: string }> = {
    added: { label: '新增', className: 'bg-emerald-100 text-emerald-700' },
    removed: { label: '消失', className: 'bg-red-100 text-red-700' },
    status_changed: { label: '状态变', className: 'bg-amber-100 text-amber-700' },
    type_changed: { label: '类型变', className: 'bg-violet-100 text-violet-700' },
    unchanged: { label: '未变', className: 'bg-slate-100 text-slate-600' },
  }

  const cfg = config[type] || config.unchanged

  return (
    <span className={cn('px-2 py-0.5 rounded text-[11px] font-semibold', cfg.className)}>
      {cfg.label}
    </span>
  )
}

function TypeDiff({
  oldTypes,
  newTypes,
  changeType,
}: {
  oldTypes?: QualityEventType[]
  newTypes?: QualityEventType[]
  changeType: string
}) {
  if (changeType === 'added') {
    return (
      <div className="flex flex-wrap gap-1">
        {newTypes?.map((t) => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
            +{TYPE_LABELS[t]}
          </span>
        ))}
      </div>
    )
  }

  if (changeType === 'removed') {
    return (
      <div className="flex flex-wrap gap-1">
        {oldTypes?.map((t) => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 line-through">
            {TYPE_LABELS[t]}
          </span>
        ))}
      </div>
    )
  }

  if (changeType === 'type_changed' || changeType === 'status_changed') {
    const oldSet = new Set(oldTypes || [])
    const newSet = new Set(newTypes || [])
    const added = [...newSet].filter((t) => !oldSet.has(t))
    const removed = [...oldSet].filter((t) => !newSet.has(t))
    const unchanged = [...newSet].filter((t) => oldSet.has(t))

    if (added.length === 0 && removed.length === 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {unchanged.map((t) => (
            <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
              {TYPE_LABELS[t]}
            </span>
          ))}
        </div>
      )
    }

    return (
      <div className="flex flex-wrap gap-1">
        {unchanged.map((t) => (
          <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
            {TYPE_LABELS[t]}
          </span>
        ))}
        {added.map((t) => (
          <span key={`add-${t}`} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
            +{TYPE_LABELS[t]}
          </span>
        ))}
        {removed.map((t) => (
          <span key={`rem-${t}`} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 line-through">
            {TYPE_LABELS[t]}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-1">
      {newTypes?.map((t) => (
        <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
          {TYPE_LABELS[t]}
        </span>
      ))}
    </div>
  )
}

function StatusDiff({
  oldStatus,
  newStatus,
  changeType,
}: {
  oldStatus?: EventStatus
  newStatus?: EventStatus
  changeType: string
}) {
  if (changeType === 'added') {
    return (
      <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold', STATUS_COLORS[newStatus || 'pending'])}>
        {STATUS_LABELS[newStatus || 'pending']}
      </span>
    )
  }

  if (changeType === 'removed') {
    return (
      <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold line-through opacity-60', STATUS_COLORS[oldStatus || 'pending'])}>
        {STATUS_LABELS[oldStatus || 'pending']}
      </span>
    )
  }

  if (changeType === 'status_changed' || changeType === 'type_changed') {
    if (oldStatus === newStatus) {
      return (
        <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold', STATUS_COLORS[newStatus || 'pending'])}>
          {STATUS_LABELS[newStatus || 'pending']}
        </span>
      )
    }
    return (
      <div className="flex items-center gap-1">
        <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold line-through opacity-60', STATUS_COLORS[oldStatus || 'pending'])}>
          {STATUS_LABELS[oldStatus || 'pending']}
        </span>
        <ArrowLeftRight className="w-3 h-3 text-slate-400" />
        <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold', STATUS_COLORS[newStatus || 'pending'])}>
          {STATUS_LABELS[newStatus || 'pending']}
        </span>
      </div>
    )
  }

  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold', STATUS_COLORS[newStatus || 'pending'])}>
      {STATUS_LABELS[newStatus || 'pending']}
    </span>
  )
}
