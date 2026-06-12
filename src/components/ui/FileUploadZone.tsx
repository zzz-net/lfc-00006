import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { Upload, FileText, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ThemeColor = 'blue' | 'violet' | 'red' | 'green'

interface FileUploadZoneProps {
  label: string
  description: string
  accept: string
  theme?: ThemeColor
  onUpload: (file: File) => Promise<{ success: boolean; warnings: string[]; errors: string[] }>
}

const themeMap: Record<ThemeColor, {
  border: string
  borderActive: string
  bg: string
  icon: string
  title: string
  button: string
  buttonHover: string
}> = {
  blue: {
    border: 'border-blue-200',
    borderActive: 'border-blue-400',
    bg: 'bg-blue-50/50',
    icon: 'text-blue-500',
    title: 'text-blue-700',
    button: 'bg-blue-500',
    buttonHover: 'hover:bg-blue-600',
  },
  violet: {
    border: 'border-violet-200',
    borderActive: 'border-violet-400',
    bg: 'bg-violet-50/50',
    icon: 'text-violet-500',
    title: 'text-violet-700',
    button: 'bg-violet-500',
    buttonHover: 'hover:bg-violet-600',
  },
  red: {
    border: 'border-red-200',
    borderActive: 'border-red-400',
    bg: 'bg-red-50/50',
    icon: 'text-red-500',
    title: 'text-red-700',
    button: 'bg-red-500',
    buttonHover: 'hover:bg-red-600',
  },
  green: {
    border: 'border-emerald-200',
    borderActive: 'border-emerald-400',
    bg: 'bg-emerald-50/50',
    icon: 'text-emerald-500',
    title: 'text-emerald-700',
    button: 'bg-emerald-500',
    buttonHover: 'hover:bg-emerald-600',
  },
}

export default function FileUploadZone({ label, description, accept, theme = 'blue', onUpload }: FileUploadZoneProps) {
  const t = themeMap[theme]
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lastResult, setLastResult] = useState<{ success: boolean; warnings: string[]; errors: string[]; fileName: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setUploading(true)
    setLastResult(null)
    try {
      const result = await onUpload(file)
      setLastResult({ ...result, fileName: file.name })
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'relative rounded-2xl border-2 border-dashed transition-all duration-200 p-6 cursor-pointer overflow-hidden',
          dragOver ? cn(t.borderActive, t.bg, 'scale-[1.01]') : t.border,
          'bg-white/60 hover:bg-white/90'
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
        />
        {uploading ? (
          <div className="flex flex-col items-center py-4 space-y-3">
            <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-slate-500 animate-spin" />
            <p className="text-sm text-slate-500">上传处理中...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-2 space-y-3">
            <div className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center transition-transform',
              t.bg,
              dragOver && 'scale-110 rotate-6'
            )}>
              <Upload className={cn('w-6 h-6', t.icon)} />
            </div>
            <div>
              <h3 className={cn('text-base font-semibold mb-1', t.title)}>{label}</h3>
              <p className="text-xs text-slate-500 leading-relaxed px-4">{description}</p>
            </div>
            <div className={cn(
              'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-colors',
              t.button, t.buttonHover
            )}>
              <FileText className="w-3.5 h-3.5" />
              选择文件
            </div>
            <p className="text-[11px] text-slate-400">支持拖拽 · 格式 {accept.toUpperCase()}</p>
          </div>
        )}
      </div>

      {lastResult && (
        <div className={cn(
          'rounded-xl border p-3 text-xs space-y-1.5 animate-fade-in',
          lastResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
        )}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {lastResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              )}
              <span className="font-medium truncate">
                {lastResult.success ? '导入成功' : '导入部分失败'} · {lastResult.fileName}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setLastResult(null) }}
              className="text-slate-400 hover:text-slate-600 shrink-0 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {lastResult.warnings.length > 0 && (
            <p className="text-amber-600 pl-6">⚠ {lastResult.warnings.length} 条警告</p>
          )}
          {lastResult.errors.length > 0 && (
            <p className="text-red-600 pl-6">✕ {lastResult.errors.length} 条错误</p>
          )}
        </div>
      )}
    </div>
  )
}
