import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Upload, Settings, ClipboardCheck, Download, BarChart3, Camera, FileStack, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  title: string
  children: ReactNode
}

const navItems = [
  { path: '/', label: '分析看板', icon: LayoutDashboard },
  { path: '/import', label: '数据导入', icon: Upload },
  { path: '/rules', label: '规则配置', icon: Settings },
  { path: '/review', label: '事件复核', icon: ClipboardCheck },
  { path: '/snapshots', label: '快照对比', icon: Camera },
  { path: '/review-packages', label: '复盘包管理', icon: FileStack },
  { path: '/handover-packages', label: '交接包管理', icon: Users },
  { path: '/export', label: '数据导出', icon: Download },
]

export default function AppLayout({ title, children }: AppLayoutProps) {
  const location = useLocation()

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-white/80 backdrop-blur-md border-r border-slate-200/60 flex flex-col shadow-sm">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-200/60">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-md">
            <BarChart3 className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-slate-800 leading-tight">质量分析</h1>
            <p className="text-[11px] text-slate-400 leading-tight">Quality Board</p>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-md shadow-slate-800/10'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-800'
                )}
              >
                <Icon className={cn('w-4.5 h-4.5 shrink-0', isActive ? 'text-amber-300' : '')} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-200/60">
          <div className="text-[11px] text-slate-400 text-center">
            v1.0.0 · 售后工单系统
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/70 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-6 shrink-0 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800 tracking-wide">{title}</h2>
            <div className="h-5 w-px bg-slate-300/60" />
            <span className="text-xs text-slate-400">{location.pathname || '/'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              A
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
