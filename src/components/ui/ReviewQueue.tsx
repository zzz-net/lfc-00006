import { useState, useEffect, useMemo } from 'react'
import { QualityEvent, EventStatus } from '@/types'
import { useAppStore } from '@/store'
import { Clock, Eye, CheckCircle2, Search, Filter, CheckSquare, Square, AlertTriangle } from 'lucide-react'
import { cn, formatDateCN } from '@/lib/utils'
import { typeMap, statusMap } from './EventTable'

type FilterStatus = 'all' | EventStatus

const statusFilters: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待复核' },
  { value: 'reviewing', label: '复核中' },
  { value: 'closed', label: '已关闭' },
]

interface ReviewQueueProps {
  selectedEventId: string | null
  onSelect: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onClearSelection: () => void
  filterStatus: FilterStatus
  onFilterChange: (s: FilterStatus) => void
  expectedStatuses: Record<string, EventStatus>
  onExpectedStatusesChange: (statuses: Record<string, EventStatus>) => void
}

export default function ReviewQueue({
  selectedEventId,
  onSelect,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  filterStatus,
  onFilterChange,
  expectedStatuses,
  onExpectedStatusesChange,
}: ReviewQueueProps) {
  const events = useAppStore((s) => s.events)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false
      if (search) {
        const s = search.toLowerCase()
        if (!e.title.toLowerCase().includes(s) && !e.customer_id.toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [events, filterStatus, search])

  const counts = useMemo(() => ({
    all: events.length,
    pending: events.filter((e) => e.status === 'pending').length,
    reviewing: events.filter((e) => e.status === 'reviewing').length,
    closed: events.filter((e) => e.status === 'closed').length,
  }), [events])

  const filteredIds = useMemo(() => new Set(filtered.map((e) => e.id)), [filtered])

  const allFilteredSelected = useMemo(() => {
    return filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id))
  }, [filtered, selectedIds])

  const someFilteredSelected = useMemo(() => {
    return filtered.some((e) => selectedIds.has(e.id))
  }, [filtered, selectedIds])

  const selectedInFilter = useMemo(() => {
    return filtered.filter((e) => selectedIds.has(e.id)).length
  }, [filtered, selectedIds])

  const outOfFilterSelected = useMemo(() => {
    let count = 0
    for (const id of selectedIds) {
      if (!filteredIds.has(id)) count++
    }
    return count
  }, [selectedIds, filteredIds])

  const getStatusChangedIds = useMemo(() => {
    const changed: string[] = []
    for (const id of selectedIds) {
      const event = events.find((e) => e.id === id)
      if (event && expectedStatuses[id] !== undefined && expectedStatuses[id] !== event.status) {
        changed.push(id)
      }
    }
    return changed
  }, [selectedIds, events, expectedStatuses])

  useEffect(() => {
    const newExpectedStatuses: Record<string, EventStatus> = {}
    for (const event of events) {
      if (selectedIds.has(event.id)) {
        newExpectedStatuses[event.id] = event.status
      }
    }
    for (const id of Object.keys(expectedStatuses)) {
      if (!selectedIds.has(id)) {
        continue
      }
      if (!newExpectedStatuses[id]) {
        newExpectedStatuses[id] = expectedStatuses[id]
      }
    }
    if (JSON.stringify(newExpectedStatuses) !== JSON.stringify(expectedStatuses)) {
      onExpectedStatusesChange(newExpectedStatuses)
    }
  }, [selectedIds, events])

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      const newSelected = new Set(selectedIds)
      for (const id of filteredIds) {
        newSelected.delete(id)
      }
      if (newSelected.size === 0) {
        onClearSelection()
      } else {
        for (const id of filteredIds) {
          onToggleSelect(id)
        }
      }
    } else {
      const idsToAdd: string[] = []
      for (const e of filtered) {
        if (!selectedIds.has(e.id)) {
          idsToAdd.push(e.id)
        }
      }
      onSelectAll(idsToAdd)
    }
  }

  return (
    <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm flex flex-col h-full">
      <div className="p-4 border-b border-slate-200/60 shrink-0">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索事件标题或客户ID..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300/50 focus:border-blue-300 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => onFilterChange(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filterStatus === f.value
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {f.label} <span className={cn('ml-1 opacity-70', filterStatus === f.value && 'text-slate-300')}>({counts[f.value]})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {allFilteredSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
              ) : someFilteredSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-blue-600 opacity-60" />
              ) : (
                <Square className="w-3.5 h-3.5 text-slate-400" />
              )}
              {allFilteredSelected ? '取消全选' : '全选当前'}
              <span className="text-slate-400">({filtered.length})</span>
            </button>
            {outOfFilterSelected > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                <AlertTriangle className="w-3 h-3" />
                {outOfFilterSelected} 项在当前筛选外已选中
              </span>
            )}
          </div>
          {selectedInFilter > 0 && (
            <span className="text-[11px] text-slate-500">
              当前列表已选 {selectedInFilter} / {filtered.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">暂无符合条件的事件</p>
          </div>
        ) : (
          filtered.map((ev, idx) => {
            const st = statusMap[ev.status]
            const StatusIcon = st.icon
            const isSelectedCard = selectedEventId === ev.id
            const isChecked = selectedIds.has(ev.id)
            const hasStatusChanged = getStatusChangedIds.includes(ev.id)
            return (
              <div
                key={ev.id}
                style={{ animationDelay: `${idx * 20}ms` }}
                onClick={() => onSelect(ev.id)}
                className={cn(
                  'group relative rounded-xl border p-3.5 cursor-pointer transition-all duration-150 animate-fade-in',
                  isSelectedCard
                    ? 'border-blue-400 bg-blue-50/60 shadow-md ring-2 ring-blue-100'
                    : hasStatusChanged
                    ? 'border-amber-300 bg-amber-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <label
                    className="mt-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelect(ev.id)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-slate-800 leading-snug truncate">{ev.title}</p>
                      {hasStatusChanged && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                          <AlertTriangle className="w-3 h-3" />
                          状态已变
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {ev.types.map((t) => (
                        <span key={t} className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', typeMap[t].className)}>
                          {typeMap[t].label}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="font-mono">{ev.evidence_count}证</span>
                        <span>{formatDateCN(ev.first_seen_at).slice(0, 10)}</span>
                      </div>
                      <span className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border',
                        st.bg, st.className
                      )}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {st.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
