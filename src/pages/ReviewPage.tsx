import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import ReviewQueue from '@/components/ui/ReviewQueue'
import ReviewEditor from '@/components/ui/ReviewEditor'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import { Eye, CheckSquare } from 'lucide-react'
import type { EventStatus } from '@/types'

type FilterStatus = 'all' | EventStatus

export default function ReviewPage() {
  const events = useAppStore((s) => s.events)
  const batchUpdateStatus = useAppStore((s) => s.batchUpdateStatus)
  const toast = useToast()

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const pendingEvents = events.filter((e) => e.status === 'pending')
  const pendingSelected = pendingEvents.filter((e) => selectedIds.has(e.id))
  const canBatchReview = pendingSelected.length > 0

  const handleBatchReview = () => {
    const ids = pendingSelected.map((e) => e.id)
    batchUpdateStatus(ids, 'reviewing')
    toast.success(`已批量开始复核 ${ids.length} 个事件`)
    setSelectedIds(new Set())
    setShowBatchConfirm(false)
  }

  return (
    <AppLayout title="事件复核">
      <div className="space-y-4 h-[calc(100vh-10rem)] min-h-[600px]">
        <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-3.5 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
              <CheckSquare className="w-3.5 h-3.5" />
              已选 {selectedIds.size} / 共 {pendingEvents.length} 待复核
            </div>
            {canBatchReview && (
              <span className="text-xs text-slate-500">
                可批量复核 {pendingSelected.length} 个待处理事件
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={clearSelection}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                清空选择
              </button>
            )}
            <button
              onClick={() => setShowBatchConfirm(true)}
              disabled={!canBatchReview}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              <Eye className="w-4 h-4" />
              批量开始复核
              {canBatchReview && <span className="bg-white/25 px-1.5 py-0.5 rounded-md text-xs">{pendingSelected.length}</span>}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 h-full min-h-0">
          <div className="col-span-2 min-h-0">
            <ReviewQueue
              selectedEventId={selectedEventId}
              onSelect={setSelectedEventId}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onClearSelection={clearSelection}
              filterStatus={filterStatus}
              onFilterChange={setFilterStatus}
            />
          </div>
          <div className="col-span-3 min-h-0">
            <ReviewEditor
              event={selectedEvent}
              onClose={() => setSelectedEventId(null)}
            />
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showBatchConfirm}
        title="批量开始复核"
        description={
          <>
            确认将选中的 <span className="font-bold text-slate-800">{pendingSelected.length}</span> 个待处理事件
            <br />批量标记为「复核中」状态？
          </>
        }
        confirmText="确认批量复核"
        variant="default"
        onConfirm={handleBatchReview}
        onCancel={() => setShowBatchConfirm(false)}
      />
    </AppLayout>
  )
}
