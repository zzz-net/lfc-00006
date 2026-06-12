import { useState, useEffect, useMemo } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { validateAllRules } from '@/utils/ruleValidator'
import {
  Timer, StarOff, Repeat, Banknote, Save, AlertCircle, CheckCircle2,
  FolderOpen, Plus, Trash2, ChevronDown, RefreshCw, Edit3, Check, X,
  AlertTriangle, Bookmark,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import dayjs from 'dayjs'
import type { QualityRule, ValidationResult, RuleScheme } from '@/types'

const DEFAULT_RULES: QualityRule = {
  timeout_hours: 24,
  min_score: 3,
  repeat_days: 7,
  repeat_count: 3,
  high_refund_amount: 500,
}

function rulesEqual(a: QualityRule, b: QualityRule): boolean {
  return a.timeout_hours === b.timeout_hours &&
    a.min_score === b.min_score &&
    a.repeat_days === b.repeat_days &&
    a.repeat_count === b.repeat_count &&
    a.high_refund_amount === b.high_refund_amount
}

export default function RulesPage() {
  const store = useAppStore()
  const toast = useToast()
  const [rules, setRules] = useState<QualityRule>({ ...store.rules })
  const [validation, setValidation] = useState<ValidationResult>({ valid: true, fieldErrors: {} })

  const schemes = useAppStore((s) => s.schemes)
  const activeSchemeId = useAppStore((s) => s.activeSchemeId)
  const activeScheme = useAppStore((s) => s.getActiveScheme())
  const isSchemeDirty = useAppStore((s) => s.isSchemeDirty())

  const [schemeDropdownOpen, setSchemeDropdownOpen] = useState(false)
  const [showSaveSchemeModal, setShowSaveSchemeModal] = useState(false)
  const [newSchemeName, setNewSchemeName] = useState('')
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false)
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null)
  const [editingSchemeName, setEditingSchemeName] = useState('')

  useEffect(() => {
    setRules({ ...store.rules })
  }, [store.rules])

  useEffect(() => {
    setValidation(validateAllRules(rules))
  }, [rules])

  const formDirty = useMemo(() => {
    return !rulesEqual(rules, store.rules)
  }, [rules, store.rules])

  const handleSave = () => {
    const v = validateAllRules(rules)
    setValidation(v)
    if (!v.valid) {
      const firstKey = Object.keys(v.fieldErrors)[0]
      toast.error(`保存失败：${firstKey} - ${v.fieldErrors[firstKey]}`)
      return
    }
    store.saveRules(rules)
    toast.success('规则配置已保存，并已重新运行质量分析')
  }

  const handleSaveAsScheme = () => {
    if (!newSchemeName.trim()) {
      toast.error('方案名称不能为空')
      return
    }
    const result = store.saveScheme(newSchemeName.trim())
    if (result.success) {
      toast.success(`方案「${result.scheme?.name}」已保存`)
      setNewSchemeName('')
      setShowSaveSchemeModal(false)
    } else {
      toast.error(result.error || '保存失败')
    }
  }

  const handleSaveToActiveScheme = () => {
    if (!activeScheme) return
    const result = store.updateScheme(activeScheme.id, store.rules)
    if (result.success) {
      toast.success(`方案「${activeScheme.name}」已更新`)
    } else {
      toast.error(result.error || '更新失败')
    }
  }

  const handleSwitchScheme = (schemeId: string) => {
    setSchemeDropdownOpen(false)
    if (schemeId === activeSchemeId) return
    if (isSchemeDirty || formDirty) {
      setPendingSwitchId(schemeId)
      setShowSwitchConfirm(true)
    } else {
      const result = store.loadScheme(schemeId)
      if (result.success) {
        toast.success(`已切换到方案「${schemes.find((s) => s.id === schemeId)?.name}」`)
      } else {
        toast.error(result.error || '切换失败')
      }
    }
  }

  const confirmSwitchScheme = () => {
    if (pendingSwitchId) {
      const result = store.loadScheme(pendingSwitchId)
      if (result.success) {
        toast.success(`已切换到方案「${schemes.find((s) => s.id === pendingSwitchId)?.name}」`)
      } else {
        toast.error(result.error || '切换失败')
      }
    }
    setShowSwitchConfirm(false)
    setPendingSwitchId(null)
  }

  const handleDeleteScheme = (schemeId: string) => {
    const scheme = schemes.find((s) => s.id === schemeId)
    if (!scheme) return
    if (scheme.is_default) {
      toast.error('默认方案不能被删除')
      return
    }
    setPendingDeleteId(schemeId)
    setShowDeleteConfirm(true)
  }

  const confirmDeleteScheme = () => {
    if (pendingDeleteId) {
      const result = store.deleteScheme(pendingDeleteId)
      if (result.success) {
        toast.success('方案已删除')
      } else {
        toast.error(result.error || '删除失败')
      }
    }
    setShowDeleteConfirm(false)
    setPendingDeleteId(null)
  }

  const handleStartRename = (scheme: RuleScheme) => {
    if (scheme.is_default) {
      toast.warning('默认方案不能重命名')
      return
    }
    setEditingSchemeId(scheme.id)
    setEditingSchemeName(scheme.name)
  }

  const handleConfirmRename = () => {
    if (!editingSchemeId) return
    const result = store.renameScheme(editingSchemeId, editingSchemeName)
    if (result.success) {
      toast.success('重命名成功')
    } else {
      toast.error(result.error || '重命名失败')
    }
    setEditingSchemeId(null)
    setEditingSchemeName('')
  }

  const handleCancelRename = () => {
    setEditingSchemeId(null)
    setEditingSchemeName('')
  }

  const cards = [
    {
      key: 'timeout' as const,
      icon: Timer,
      title: '超时规则',
      description: '工单解决耗时超过此值则判定为超时',
      defaultValue: `默认值：${DEFAULT_RULES.timeout_hours} 小时`,
      fields: [
        { key: 'timeout_hours' as const, label: '超时阈值 (小时)', placeholder: '例如: 24' },
      ],
      gradient: 'from-amber-500 to-orange-500',
      softBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
    },
    {
      key: 'low_score' as const,
      icon: StarOff,
      title: '低分规则',
      description: '回访评分低于此值则判定为低分',
      defaultValue: `默认值：${DEFAULT_RULES.min_score} 分（1-5）`,
      fields: [
        { key: 'min_score' as const, label: '最小分 (1-5)', placeholder: '例如: 3' },
      ],
      gradient: 'from-rose-500 to-pink-500',
      softBg: 'bg-rose-50',
      iconColor: 'text-rose-600',
    },
    {
      key: 'repeat' as const,
      icon: Repeat,
      title: '重复投诉',
      description: '同一客户在窗口内工单数超过阈值判定重复投诉',
      defaultValue: `默认值：${DEFAULT_RULES.repeat_days} 天内 ≥ ${DEFAULT_RULES.repeat_count} 次`,
      fields: [
        { key: 'repeat_days' as const, label: '时间窗口 (天)', placeholder: '例如: 7' },
        { key: 'repeat_count' as const, label: '次数阈值 (≥2)', placeholder: '例如: 3' },
      ],
      gradient: 'from-violet-500 to-purple-500',
      softBg: 'bg-violet-50',
      iconColor: 'text-violet-600',
    },
    {
      key: 'high_refund' as const,
      icon: Banknote,
      title: '高额退款',
      description: '退款金额超过此值判定为高额退款',
      defaultValue: `默认值：¥${DEFAULT_RULES.high_refund_amount.toLocaleString()}`,
      fields: [
        { key: 'high_refund_amount' as const, label: '金额阈值 (元)', placeholder: '例如: 500' },
      ],
      gradient: 'from-cyan-500 to-blue-500',
      softBg: 'bg-cyan-50',
      iconColor: 'text-cyan-600',
    },
  ]

  return (
    <AppLayout title="规则配置">
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold mb-1">规则校验状态</h3>
              <p className="text-xs text-slate-300">实时验证所有规则参数，修改后自动重新分析</p>
            </div>
            <div className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
              validation.valid ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' : 'bg-red-500/20 text-red-200 border border-red-400/30'
            )}>
              {validation.valid ? (
                <><CheckCircle2 className="w-4 h-4" /> 全部规则有效</>
              ) : (
                <><AlertCircle className="w-4 h-4" /> 存在 {Object.keys(validation.fieldErrors).length} 个错误</>
              )}
            </div>
          </div>
        </div>

        <section className="bg-white/85 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-transparent">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
                  <Bookmark className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">规则方案</h3>
                  <p className="text-xs text-slate-500">保存、切换和管理规则配置方案</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(isSchemeDirty || formDirty) && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {formDirty ? '表单未保存' : '配置已偏离方案'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <button
                  onClick={() => setSchemeDropdownOpen(!schemeDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors text-sm"
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-4 h-4 text-indigo-500" />
                    <span className="font-medium text-slate-700">{activeScheme?.name || '未选择方案'}</span>
                    {activeScheme?.is_default && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 text-slate-600 font-medium">默认</span>
                    )}
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', schemeDropdownOpen && 'rotate-180')} />
                </button>
                {schemeDropdownOpen && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {schemes.map((scheme) => (
                      <div
                        key={scheme.id}
                        className={cn(
                          'flex items-center justify-between px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0',
                          scheme.id === activeSchemeId && 'bg-indigo-50'
                        )}
                        onClick={() => handleSwitchScheme(scheme.id)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                          {editingSchemeId === scheme.id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={editingSchemeName}
                                onChange={(e) => setEditingSchemeName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleConfirmRename()
                                  if (e.key === 'Escape') handleCancelRename()
                                }}
                                autoFocus
                                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                              />
                              <button onClick={handleConfirmRename} className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={handleCancelRename} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-700 truncate">{scheme.name}</span>
                                  {scheme.is_default && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-200 text-slate-500 font-medium shrink-0">默认</span>
                                  )}
                                  {scheme.id === activeSchemeId && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-100 text-indigo-600 font-medium shrink-0">当前</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400">
                                  超时{scheme.rules.timeout_hours}h / 低分{scheme.rules.min_score} / 重复{scheme.rules.repeat_days}天≥{scheme.rules.repeat_count}次 / 退款¥{scheme.rules.high_refund_amount}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {!scheme.is_default && (
                                  <>
                                    <button
                                      onClick={() => handleStartRename(scheme)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                      title="重命名"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteScheme(scheme.id)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                                      title="删除"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activeScheme && !activeScheme.is_default && isSchemeDirty && !formDirty && (
                  <button
                    onClick={handleSaveToActiveScheme}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    更新方案
                  </button>
                )}
                <button
                  onClick={() => {
                    if (formDirty) {
                      toast.warning('请先保存当前配置再另存为方案')
                      return
                    }
                    setShowSaveSchemeModal(true)
                  }}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold text-sm shadow-md hover:from-indigo-600 hover:to-violet-700 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  另存为方案
                </button>
              </div>
            </div>

            {activeScheme && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>当前方案：<span className="font-semibold text-slate-700">{activeScheme.name}</span></span>
                  <span className="w-px h-3 bg-slate-200" />
                  <span>创建时间：<span className="font-mono text-slate-600">{dayjs(activeScheme.created_at).format('YYYY-MM-DD HH:mm')}</span></span>
                  <span className="w-px h-3 bg-slate-200" />
                  <span>更新时间：<span className="font-mono text-slate-600">{dayjs(activeScheme.updated_at).format('YYYY-MM-DD HH:mm')}</span></span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-5">
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.key}
                className={cn(
                  'bg-white/85 backdrop-blur-sm rounded-2xl border p-6 shadow-sm transition-all hover:shadow-md',
                  card.fields.some((f) => validation.fieldErrors[f.key]) ? 'border-red-300 ring-1 ring-red-100' : 'border-slate-200/60'
                )}
              >
                <div className="flex items-start gap-4 mb-5">
                  <div className={cn(
                    'w-12 h-12 rounded-xl shrink-0 flex items-center justify-center bg-gradient-to-br shadow-md',
                    card.gradient
                  )}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-slate-800 mb-1">{card.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{card.description}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {card.fields.map((f) => {
                    const error = validation.fieldErrors[f.key]
                    return (
                      <div key={f.key}>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">{f.label}</label>
                        <input
                          type="number"
                          value={rules[f.key] as number}
                          onChange={(e) => updateField(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          className={cn(
                            'w-full px-4 py-2.5 rounded-xl border text-sm font-mono transition-all focus:outline-none',
                            error
                              ? 'border-red-300 bg-red-50 focus:ring-2 focus:ring-red-200 focus:border-red-400'
                              : 'border-slate-200 bg-slate-50 focus:ring-2 focus:ring-blue-200 focus:border-blue-300'
                          )}
                        />
                        {error && (
                          <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            {error}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <p className="text-[11px] text-slate-400">{card.defaultValue}</p>
                </div>
              </div>
            )
          })}
        </section>

        <div className="flex justify-center pt-2">
          <button
            onClick={handleSave}
            className={cn(
              'px-12 py-3.5 rounded-2xl font-bold text-base shadow-lg transition-all inline-flex items-center gap-2.5',
              validation.valid
                ? 'bg-gradient-to-r from-slate-800 to-slate-700 text-white shadow-slate-800/20 hover:from-slate-900 hover:to-slate-800 hover:shadow-xl'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            )}
          >
            <Save className="w-5 h-5" />
            保存配置
          </button>
        </div>
      </div>

      <ConfirmModal
        open={showSaveSchemeModal}
        title="另存为方案"
        description={
          <div className="space-y-3">
            <p className="text-sm text-slate-600">将当前规则配置保存为命名方案，方便后续切换和追溯。</p>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                方案名称
              </label>
              <input
                type="text"
                value={newSchemeName}
                onChange={(e) => setNewSchemeName(e.target.value)}
                placeholder="输入方案名称"
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
              />
            </div>
          </div>
        }
        confirmText="保存方案"
        cancelText="取消"
        onConfirm={handleSaveAsScheme}
        onCancel={() => { setShowSaveSchemeModal(false); setNewSchemeName('') }}
      />

      <ConfirmModal
        open={showSwitchConfirm}
        title="配置未保存"
        description={
          <div className="text-sm text-slate-600 space-y-2">
            <p>当前规则配置与方案「{activeScheme?.name}」不一致，切换方案将丢失未保存的修改。</p>
            <p className="text-amber-600 font-medium">确定要切换到方案「{schemes.find((s) => s.id === pendingSwitchId)?.name}」吗？</p>
          </div>
        }
        confirmText="确认切换"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmSwitchScheme}
        onCancel={() => { setShowSwitchConfirm(false); setPendingSwitchId(null) }}
      />

      <ConfirmModal
        open={showDeleteConfirm}
        title="删除方案"
        description={
          <div className="text-sm text-slate-600">
            确定要删除方案「{schemes.find((s) => s.id === pendingDeleteId)?.name}」吗？
            {pendingDeleteId === activeSchemeId && (
              <p className="mt-2 text-amber-600 font-medium">该方案当前正在使用，删除后将自动切换到默认方案。</p>
            )}
          </div>
        }
        confirmText="确认删除"
        cancelText="取消"
        variant="danger"
        onConfirm={confirmDeleteScheme}
        onCancel={() => { setShowDeleteConfirm(false); setPendingDeleteId(null) }}
      />
    </AppLayout>
  )

  function updateField(key: keyof QualityRule, raw: string) {
    const n = Number(raw)
    setRules((prev) => ({
      ...prev,
      [key]: raw === '' ? (0 as any) : (Number.isNaN(n) ? prev[key] : n),
    }))
  }
}
