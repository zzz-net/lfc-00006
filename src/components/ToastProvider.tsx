import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 3000) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      setToasts((prev) => [...prev, { id, type, message, duration }])
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration)
      }
    },
    [removeToast]
  )

  const value: ToastContextValue = {
    toast,
    success: (m, d) => toast(m, 'success', d),
    error: (m, d) => toast(m, 'error', d),
    info: (m, d) => toast(m, 'info', d),
    warning: (m, d) => toast(m, 'warning', d),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => setLeaving(true), toast.duration - 200)
      return () => clearTimeout(timer)
    }
  }, [toast.duration])

  const iconMap = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-500 shrink-0" />,
  }

  const borderMap = {
    success: 'border-emerald-200 bg-emerald-50',
    error: 'border-red-200 bg-red-50',
    warning: 'border-amber-200 bg-amber-50',
    info: 'border-blue-200 bg-blue-50',
  }

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm transition-all duration-200',
        borderMap[toast.type],
        leaving ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0 animate-toast-in'
      )}
    >
      {iconMap[toast.type]}
      <p className="flex-1 text-sm text-slate-700 leading-relaxed break-words">{toast.message}</p>
      <button
        onClick={onClose}
        className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-0.5 -mr-1 -mt-0.5"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
