import type { QualityRule, ValidationResult } from '../types'

export function validateTimeoutRule(v: number): { valid: boolean; message?: string } {
  if (!Number.isFinite(v)) return { valid: false, message: '必须是数字' }
  if (!Number.isInteger(v) || v <= 0) return { valid: false, message: '必须是正整数' }
  return { valid: true }
}

export function validateMinScoreRule(v: number): { valid: boolean; message?: string } {
  if (!Number.isFinite(v)) return { valid: false, message: '必须是数字' }
  if (!Number.isInteger(v) || v < 1 || v > 5) return { valid: false, message: '必须是1-5之间的整数' }
  return { valid: true }
}

export function validateRepeatDaysRule(v: number): { valid: boolean; message?: string } {
  if (!Number.isFinite(v)) return { valid: false, message: '必须是数字' }
  if (!Number.isInteger(v) || v < 1 || v > 365) return { valid: false, message: '必须是1-365之间的整数' }
  return { valid: true }
}

export function validateRepeatCountRule(v: number): { valid: boolean; message?: string } {
  if (!Number.isFinite(v)) return { valid: false, message: '必须是数字' }
  if (!Number.isInteger(v) || v < 2) return { valid: false, message: '必须是大于等于2的整数' }
  return { valid: true }
}

export function validateHighRefundRule(v: number): { valid: boolean; message?: string } {
  if (!Number.isFinite(v)) return { valid: false, message: '必须是数字' }
  if (v < 0) return { valid: false, message: '必须大于等于0' }
  return { valid: true }
}

export function validateAllRules(rules: QualityRule): ValidationResult {
  const fieldErrors: Record<string, string> = {}

  const timeoutRes = validateTimeoutRule(rules.timeout_hours)
  if (!timeoutRes.valid) fieldErrors.timeout_hours = timeoutRes.message!

  const minScoreRes = validateMinScoreRule(rules.min_score)
  if (!minScoreRes.valid) fieldErrors.min_score = minScoreRes.message!

  const repeatDaysRes = validateRepeatDaysRule(rules.repeat_days)
  if (!repeatDaysRes.valid) fieldErrors.repeat_days = repeatDaysRes.message!

  const repeatCountRes = validateRepeatCountRule(rules.repeat_count)
  if (!repeatCountRes.valid) fieldErrors.repeat_count = repeatCountRes.message!

  const highRefundRes = validateHighRefundRule(rules.high_refund_amount)
  if (!highRefundRes.valid) fieldErrors.high_refund_amount = highRefundRes.message!

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  }
}
