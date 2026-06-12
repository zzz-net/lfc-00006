import { ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmModalProps {
  open: boolean
  title: string
  description: ReactNode
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'danger' | 'default'
}

export default function ConfirmModal({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  variant = 'default',
}: ConfirmModalProps) {
  if (!open) return null

  const isDanger = variant === 'danger'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-modal-in">
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className={cn(
          'w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center',
          isDanger ? 'bg-red-50' : 'bg-amber-50'
        )}>
          <AlertTriangle className={cn('w-7 h-7', isDanger ? 'text-red-500' : 'text-amber-500')} />
        </div>
        <h3 className="text-lg font-bold text-center text-slate-800 mb-2">{title}</h3>
        <div className="text-sm text-center text-slate-500 mb-6 leading-relaxed">{description}</div>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-all',
              isDanger
                ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-red-500/20 hover:from-red-600 hover:to-red-700'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700'
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
