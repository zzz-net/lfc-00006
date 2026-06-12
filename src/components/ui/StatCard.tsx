import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type ColorVariant = 'amber' | 'red' | 'blue' | 'emerald' | 'slate' | 'violet' | 'rose'

interface StatCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  color?: ColorVariant
  subtitle?: string
  trend?: number
}

const colorMap: Record<ColorVariant, { bg: string; text: string; ring: string; dot: string; softBg: string }> = {
  amber: {
    bg: 'bg-amber-500',
    text: 'text-amber-600',
    ring: 'ring-amber-100',
    dot: 'bg-amber-400',
    softBg: 'bg-amber-50',
  },
  red: {
    bg: 'bg-red-500',
    text: 'text-red-600',
    ring: 'ring-red-100',
    dot: 'bg-red-400',
    softBg: 'bg-red-50',
  },
  blue: {
    bg: 'bg-blue-500',
    text: 'text-blue-600',
    ring: 'ring-blue-100',
    dot: 'bg-blue-400',
    softBg: 'bg-blue-50',
  },
  emerald: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-600',
    ring: 'ring-emerald-100',
    dot: 'bg-emerald-400',
    softBg: 'bg-emerald-50',
  },
  slate: {
    bg: 'bg-slate-600',
    text: 'text-slate-700',
    ring: 'ring-slate-100',
    dot: 'bg-slate-400',
    softBg: 'bg-slate-50',
  },
  violet: {
    bg: 'bg-violet-500',
    text: 'text-violet-600',
    ring: 'ring-violet-100',
    dot: 'bg-violet-400',
    softBg: 'bg-violet-50',
  },
  rose: {
    bg: 'bg-rose-500',
    text: 'text-rose-600',
    ring: 'ring-rose-100',
    dot: 'bg-rose-400',
    softBg: 'bg-rose-50',
  },
}

export default function StatCard({ title, value, icon: Icon, color = 'slate', subtitle, trend }: StatCardProps) {
  const c = colorMap[color]

  return (
    <div className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-slate-500 mb-1.5 truncate">{title}</p>
          <div className="flex items-baseline gap-2">
            <span className={cn('text-2xl font-bold tracking-tight', c.text, 'animate-number-roll')}>
              {value}
            </span>
            {trend !== undefined && trend !== 0 && (
              <span className={cn(
                'text-[11px] font-semibold px-1.5 py-0.5 rounded',
                trend > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'
              )}>
                {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-1.5">{subtitle}</p>
          )}
        </div>
        <div className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center ring-4 transition-all duration-300 group-hover:scale-105 shrink-0',
          c.softBg, c.ring
        )}>
          <Icon className={cn('w-5 h-5', c.text)} />
        </div>
      </div>
      <div className={cn('mt-4 h-1 rounded-full overflow-hidden', c.softBg)}>
        <div className={cn('h-full rounded-full animate-number-roll', c.bg)} style={{ width: '60%' }} />
      </div>
    </div>
  )
}
