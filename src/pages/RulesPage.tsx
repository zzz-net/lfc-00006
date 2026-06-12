import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { useAppStore } from '@/store'
import { useToast } from '@/components/ToastProvider'
import { validateAllRules } from '@/utils/ruleValidator'
import { Timer, StarOff, Repeat, Banknote, Save, AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QualityRule, ValidationResult } from '@/types'

const DEFAULT_RULES: QualityRule = {
  timeout_hours: 24,
  min_score: 3,
  repeat_days: 7,
  repeat_count: 3,
  high_refund_amount: 500,
}

export default function RulesPage() {
  const store = useAppStore()
  const toast = useToast()
  const [rules, setRules] = useState<QualityRule>({ ...DEFAULT_RULES })
  const [validation, setValidation] = useState<ValidationResult>({ valid: true, fieldErrors: {} })

  useEffect(() => {
    setRules({ ...store.rules })
  }, [])

  useEffect(() => {
    setValidation(validateAllRules(rules))
  }, [rules])

  const updateField = (key: keyof QualityRule, raw: string) => {
    const n = Number(raw)
    setRules((prev) => ({
      ...prev,
      [key]: raw === '' ? (0 as any) : (Number.isNaN(n) ? prev[key] : n),
    }))
  }

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
    </AppLayout>
  )
}
