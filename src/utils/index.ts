import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import Papa from 'papaparse'
import type { ImportError, ValidationResult } from '@/types'

dayjs.extend(customParseFormat)

export function uid(prefix: string = 'id'): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(16).slice(2, 8).padStart(6, '0')
  return `${prefix}_${ts}_${rand}`
}

export function deterministicId(prefix: string, seed: string): string {
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0
  }
  return `${prefix}_${Math.abs(h).toString(36)}`
}

async function bufferToHex(buffer: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashString(s: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(s)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufferToHex(hash)
}

export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return bufferToHex(hash)
}

export function parseCSV<T = any>(csvStr: string): T[] {
  const result = Papa.parse<T>(csvStr, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  return result.data
}

function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCSV(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows || rows.length === 0) {
    return columns ? columns.join(',') : ''
  }
  const cols = columns && columns.length > 0 ? columns : Object.keys(rows[0])
  const header = cols.map(escapeCSVValue).join(',')
  const body = rows.map(row => cols.map(col => escapeCSVValue(row[col])).join(',')).join('\n')
  return `${header}\n${body}`
}

const DATE_FORMATS = [
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD',
  'YYYY/MM/DD HH:mm:ss',
  'YYYY/MM/DD HH:mm',
  'YYYY/MM/DD',
  'YYYY年MM月DD日 HH:mm:ss',
  'YYYY年MM月DD日 HH:mm',
  'YYYY年MM月DD日',
  'YYYY.MM.DD HH:mm:ss',
  'YYYY.MM.DD',
  'DD-MM-YYYY HH:mm:ss',
  'DD-MM-YYYY',
  'MM/DD/YYYY HH:mm:ss',
  'MM/DD/YYYY',
]

export function parseDate(str: any): Date | null {
  if (str === null || str === undefined || str === '') return null
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str
  const s = String(str).trim()
  if (!s) return null
  for (const fmt of DATE_FORMATS) {
    const d = dayjs(s, fmt, true)
    if (d.isValid()) return d.toDate()
  }
  const d = dayjs(s)
  return d.isValid() ? d.toDate() : null
}

export function isValidDateStr(str: string): boolean {
  return parseDate(str) !== null
}

export function formatDate(d: Date, fmt: string = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!d || isNaN(d.getTime())) return ''
  return dayjs(d).format(fmt)
}

export function formatDateCN(d: Date): string {
  if (!d || isNaN(d.getTime())) return ''
  return dayjs(d).format('YYYY年MM月DD日 HH:mm')
}

export function hoursDiff(a: Date, b: Date): number {
  return dayjs(a).diff(dayjs(b), 'hour', true)
}

export function hoursBetween(a: Date, b: Date): number {
  return hoursDiff(b, a)
}

export function daysDiff(a: Date, b: Date): number {
  return dayjs(a).startOf('day').diff(dayjs(b).startOf('day'), 'day', true)
}

export function daysBetween(a: Date, b: Date): number {
  return daysDiff(b, a)
}

export function validateTicket(
  row: Record<string, unknown>
): ValidationResult & { errors: ImportError[] } {
  const fieldErrors: Record<string, string> = {}
  const errors: ImportError[] = []
  const line = Number(row.__line) || 0

  const customer_id = row.customer_id !== undefined && row.customer_id !== null
    ? String(row.customer_id).trim()
    : ''
  const ticket_no = row.ticket_no !== undefined && row.ticket_no !== null
    ? String(row.ticket_no).trim()
    : ''
  const created_at_str = row.created_at !== undefined && row.created_at !== null
    ? String(row.created_at)
    : ''
  const resolved_at_str = row.resolved_at !== undefined && row.resolved_at !== null
    ? String(row.resolved_at)
    : ''

  if (!customer_id) {
    fieldErrors.customer_id = 'customer_id缺失'
    errors.push({ line, field: 'customer_id', message: 'customer_id不能为空', value: row.customer_id })
  }
  if (!ticket_no) {
    fieldErrors.ticket_no = 'ticket_no缺失'
    errors.push({ line, field: 'ticket_no', message: 'ticket_no不能为空', value: row.ticket_no })
  }
  if (!created_at_str || !parseDate(created_at_str)) {
    fieldErrors.created_at = 'created_at无效或无法解析'
    errors.push({ line, field: 'created_at', message: 'created_at无效或无法解析', value: row.created_at })
  }
  if (resolved_at_str && !parseDate(resolved_at_str)) {
    fieldErrors.resolved_at = 'resolved_at无效或无法解析'
    errors.push({ line, field: 'resolved_at', message: 'resolved_at无效或无法解析', value: row.resolved_at })
  }
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors, errors }
}

export function validateScore(
  row: Record<string, unknown>
): ValidationResult & { errors: ImportError[] } {
  const fieldErrors: Record<string, string> = {}
  const errors: ImportError[] = []
  const line = Number(row.__line) || 0

  const customer_id = row.customer_id !== undefined && row.customer_id !== null
    ? String(row.customer_id).trim()
    : ''
  const score_val = row.score
  const visited_str = row.visited_at !== undefined && row.visited_at !== null
    ? String(row.visited_at)
    : ''

  if (!customer_id) {
    fieldErrors.customer_id = 'customer_id缺失'
    errors.push({ line, field: 'customer_id', message: 'customer_id不能为空', value: row.customer_id })
  }
  if (score_val === undefined || score_val === null || score_val === '') {
    fieldErrors.score = 'score缺失'
    errors.push({ line, field: 'score', message: 'score缺失', value: score_val })
  } else {
    const s = Number(score_val)
    if (isNaN(s) || !Number.isInteger(s) || s < 1 || s > 5) {
      fieldErrors.score = 'score非法(必须为1-5的整数)'
      errors.push({ line, field: 'score', message: 'score非法(必须为1-5的整数)', value: score_val })
    }
  }
  if (!visited_str || !parseDate(visited_str)) {
    fieldErrors.visited_at = 'visited_at无效或无法解析'
    errors.push({ line, field: 'visited_at', message: 'visited_at无效或无法解析', value: row.visited_at })
  }
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors, errors }
}

export function validateRefund(
  row: Record<string, unknown>
): ValidationResult & { errors: ImportError[] } {
  const fieldErrors: Record<string, string> = {}
  const errors: ImportError[] = []
  const line = Number(row.__line) || 0

  const customer_id = row.customer_id !== undefined && row.customer_id !== null
    ? String(row.customer_id).trim()
    : ''
  const refund_no = row.refund_no !== undefined && row.refund_no !== null
    ? String(row.refund_no).trim()
    : ''
  const amount_val = row.amount
  const refunded_str = row.refunded_at !== undefined && row.refunded_at !== null
    ? String(row.refunded_at)
    : ''

  if (!customer_id) {
    fieldErrors.customer_id = 'customer_id缺失'
    errors.push({ line, field: 'customer_id', message: 'customer_id不能为空', value: row.customer_id })
  }
  if (!refund_no) {
    fieldErrors.refund_no = 'refund_no缺失'
    errors.push({ line, field: 'refund_no', message: 'refund_no不能为空', value: row.refund_no })
  }
  if (amount_val === undefined || amount_val === null || amount_val === '') {
    fieldErrors.amount = 'amount缺失'
    errors.push({ line, field: 'amount', message: 'amount缺失', value: amount_val })
  } else {
    const a = Number(amount_val)
    if (isNaN(a) || a < 0) {
      fieldErrors.amount = 'amount非法(必须为非负数字)'
      errors.push({ line, field: 'amount', message: 'amount非法(必须为非负数字)', value: amount_val })
    }
  }
  if (!refunded_str || !parseDate(refunded_str)) {
    fieldErrors.refunded_at = 'refunded_at无效或无法解析'
    errors.push({ line, field: 'refunded_at', message: 'refunded_at无效或无法解析', value: row.refunded_at })
  }
  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors, errors }
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

export function reviveDates(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) return obj
  if (typeof obj === 'string') {
    if (ISO_DATE_REGEX.test(obj)) {
      const d = parseDate(obj)
      return d || obj
    }
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(reviveDates)
  }
  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const k of Object.keys(obj)) {
      result[k] = reviveDates(obj[k])
    }
    return result
  }
  return obj
}
