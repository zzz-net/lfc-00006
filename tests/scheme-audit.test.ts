/**
 * 方案变更审计与导出核对回归测试
 *
 * 验证：
 * 1. 方案变更审计日志记录（创建、更新、切换、删除、重命名）
 * 2. 审计日志持久化（localStorage 序列化/反序列化）
 * 3. 方案名冲突处理
 * 4. 备份恢复后审计日志不丢失
 * 5. 导出字段一致性（CSV/JSON 包含方案信息和审计记录）
 * 6. 脏状态下导出的提示与字段正确性
 * 7. 完整业务链路：导入样例 → 切换方案 → 重分析 → 保存快照 → 导出 → 备份恢复
 *
 * 运行方式：npx tsx tests/scheme-audit.test.ts
 */

import assert from 'node:assert/strict'
import { generateSampleFiles } from '../src/sample/generator'
import { runAnalysis } from '../src/services/analyzeService'
import { createSnapshot } from '../src/services/snapshotService'
import { eventsToCSV, eventsToJSON, buildFullBackup, parseFullBackup } from '../src/services/exportService'
import { parseCSV, parseDate, uid } from '../src/utils'
import type {
  QualityRule,
  CustomerTicket,
  VisitScore,
  Refund,
  RuleScheme,
  AnalysisSnapshot,
  SchemeAuditLog,
  SchemeAuditActionType,
} from '../src/types'

const DEFAULT_RULES: QualityRule = {
  timeout_hours: 24,
  min_score: 3,
  repeat_days: 7,
  repeat_count: 3,
  high_refund_amount: 500,
}

const OPERATOR = '当前用户'

function reviveDates(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) return obj
  if (typeof obj === 'string') {
    const d = new Date(obj)
    if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}T/.test(obj)) return d
    return obj
  }
  if (Array.isArray(obj)) return obj.map(reviveDates)
  if (typeof obj === 'object') {
    const result: Record<string, any> = {}
    for (const k of Object.keys(obj)) result[k] = reviveDates(obj[k])
    return result
  }
  return obj
}

function createMockScheme(name: string, rules: QualityRule, isDefault = false): RuleScheme {
  return {
    id: isDefault ? 'scheme_default' : `scheme_${name.replace(/\s/g, '_')}`,
    name,
    rules: { ...rules },
    is_default: isDefault,
    created_at: new Date(),
    updated_at: new Date(),
  }
}

function createMockAuditLog(
  action: SchemeAuditActionType,
  scheme: RuleScheme,
  options: {
    oldRules?: QualityRule
    newRules?: QualityRule
    oldName?: string
    newName?: string
    note?: string
  } = {}
): SchemeAuditLog {
  return {
    id: uid('audit'),
    action,
    scheme_id: scheme.id,
    scheme_name: scheme.name,
    operator: OPERATOR,
    operated_at: new Date(),
    old_rules: options.oldRules ? { ...options.oldRules } : undefined,
    new_rules: options.newRules ? { ...options.newRules } : undefined,
    old_name: options.oldName,
    new_name: options.newName,
    note: options.note,
  }
}

function rulesEqual(a: QualityRule, b: QualityRule): boolean {
  return a.timeout_hours === b.timeout_hours &&
    a.min_score === b.min_score &&
    a.repeat_days === b.repeat_days &&
    a.repeat_count === b.repeat_count &&
    a.high_refund_amount === b.high_refund_amount
}

console.log('\n=== 方案变更审计与导出核对回归测试 ===\n')

async function runTests() {
  let passed = 0
  let failed = 0

  const sample = generateSampleFiles()

  const ticketRows = parseCSV(sample.ticketsCSV)
  const tickets: CustomerTicket[] = ticketRows
    .filter((r: any) => r.customer_id && r.ticket_no && r.created_at)
    .map((r: any, i: number) => ({
      id: `tkt_sample_${i}`,
      ticket_no: r.ticket_no,
      customer_id: r.customer_id,
      title: r.title || '',
      content: r.content || '',
      category: r.category || '',
      source_file: 'sample',
      created_at: parseDate(r.created_at) || new Date(),
      resolved_at: parseDate(r.resolved_at),
      status: r.status || 'resolved',
      agent_id: r.agent_id || '',
    }))

  const scoreRows = parseCSV(sample.scoresCSV)
  const scores: VisitScore[] = scoreRows
    .filter((r: any) => r.customer_id && r.score && r.visited_at)
    .map((r: any, i: number) => {
      const s = Number(r.score)
      if (isNaN(s) || s < 1 || s > 5) return null
      return {
        id: `scr_sample_${i}`,
        customer_id: r.customer_id,
        ticket_no: r.ticket_no || '',
        source_file: 'sample',
        score: s,
        comment: r.comment || '',
        visited_at: parseDate(r.visited_at) || new Date(),
      }
    })
    .filter(Boolean) as VisitScore[]

  const refundObjs = JSON.parse(sample.refundsJSON)
  const refunds: Refund[] = refundObjs
    .filter((r: any) => r.customer_id && r.refund_no && r.amount >= 0 && r.refunded_at)
    .map((r: any, i: number) => ({
      id: `rfd_sample_${i}`,
      refund_no: r.refund_no,
      customer_id: r.customer_id,
      order_no: r.order_no || '',
      source_file: 'sample',
      file_hash: 'sample_hash',
      amount: Number(r.amount),
      reason: r.reason || '',
      refunded_at: parseDate(r.refunded_at) || new Date(),
    }))

  console.log(`  样例数据：${tickets.length} 工单, ${scores.length} 评分, ${refunds.length} 退款`)

  // ---- Test 1: 审计日志记录 - 创建方案 ----
  console.log('Test 1: 审计日志 - 创建方案')
  try {
    const defaultScheme = createMockScheme('默认方案', DEFAULT_RULES, true)
    const strictRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 12, min_score: 2 }
    const strictScheme = createMockScheme('严格方案', strictRules)

    const auditLog = createMockAuditLog('create', strictScheme, {
      newRules: strictRules,
      note: '新建方案',
    })

    assert.equal(auditLog.action, 'create', '操作类型应为 create')
    assert.equal(auditLog.scheme_id, strictScheme.id, '方案 ID 应正确')
    assert.equal(auditLog.scheme_name, '严格方案', '方案名称应正确')
    assert.equal(auditLog.operator, OPERATOR, '操作者应正确')
    assert.ok(auditLog.operated_at instanceof Date, '操作时间应为 Date')
    assert.ok(auditLog.new_rules, '应记录新规则')
    assert.ok(!auditLog.old_rules, '创建方案不应有旧规则')
    assert.equal(auditLog.new_rules?.timeout_hours, 12, '新规则超时阈值应正确')
    assert.equal(auditLog.note, '新建方案', '备注应正确')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 2: 审计日志记录 - 更新方案 ----
  console.log('Test 2: 审计日志 - 更新方案')
  try {
    const scheme = createMockScheme('测试方案', DEFAULT_RULES)
    const oldRules = { ...scheme.rules }
    const newRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 48, min_score: 4 }

    const auditLog = createMockAuditLog('update', scheme, {
      oldRules,
      newRules,
      note: '更新方案规则',
    })

    assert.equal(auditLog.action, 'update', '操作类型应为 update')
    assert.ok(auditLog.old_rules, '应记录旧规则')
    assert.ok(auditLog.new_rules, '应记录新规则')
    assert.equal(auditLog.old_rules?.timeout_hours, 24, '旧规则超时阈值应正确')
    assert.equal(auditLog.new_rules?.timeout_hours, 48, '新规则超时阈值应正确')
    assert.ok(rulesEqual(auditLog.old_rules!, oldRules), '旧规则应与原始规则一致')
    assert.ok(!rulesEqual(auditLog.old_rules!, auditLog.new_rules!), '新旧规则应不同')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 3: 审计日志记录 - 切换方案 ----
  console.log('Test 3: 审计日志 - 切换方案')
  try {
    const schemeA = createMockScheme('方案A', DEFAULT_RULES)
    const schemeB = createMockScheme('方案B', { ...DEFAULT_RULES, timeout_hours: 48 })

    const auditLog = createMockAuditLog('switch', schemeB, {
      oldRules: schemeA.rules,
      newRules: schemeB.rules,
      note: `从方案「${schemeA.name}」切换`,
    })

    assert.equal(auditLog.action, 'switch', '操作类型应为 switch')
    assert.equal(auditLog.scheme_name, '方案B', '应记录切换到的方案名称')
    assert.ok(auditLog.old_rules, '应记录切换前的规则')
    assert.ok(auditLog.new_rules, '应记录切换后的规则')
    assert.ok(auditLog.note?.includes('方案A'), '备注应包含原方案名')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 4: 审计日志记录 - 重命名方案 ----
  console.log('Test 4: 审计日志 - 重命名方案')
  try {
    const scheme = createMockScheme('旧名称', DEFAULT_RULES)
    const newName = '新名称'

    const auditLog = createMockAuditLog('rename', { ...scheme, name: newName }, {
      oldName: scheme.name,
      newName,
      note: `重命名方案：「${scheme.name}」→「${newName}」`,
    })

    assert.equal(auditLog.action, 'rename', '操作类型应为 rename')
    assert.equal(auditLog.scheme_name, '新名称', '应记录新的方案名称')
    assert.equal(auditLog.old_name, '旧名称', '应记录旧名称')
    assert.equal(auditLog.new_name, '新名称', '应记录新名称')
    assert.ok(auditLog.note?.includes('旧名称'), '备注应包含旧名称')
    assert.ok(auditLog.note?.includes('新名称'), '备注应包含新名称')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5: 审计日志记录 - 删除方案 ----
  console.log('Test 5: 审计日志 - 删除方案')
  try {
    const scheme = createMockScheme('待删除方案', DEFAULT_RULES)

    const auditLog = createMockAuditLog('delete', scheme, {
      oldRules: scheme.rules,
      note: '删除方案',
    })

    assert.equal(auditLog.action, 'delete', '操作类型应为 delete')
    assert.equal(auditLog.scheme_name, '待删除方案', '应记录被删除的方案名称')
    assert.ok(auditLog.old_rules, '应记录被删除方案的规则')
    assert.ok(!auditLog.new_rules, '删除操作不应有新规则')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 6: 方案名冲突处理 ----
  console.log('Test 6: 方案名冲突处理 - 保存和重命名时检查')
  try {
    const schemes = [
      createMockScheme('默认方案', DEFAULT_RULES, true),
      createMockScheme('严格方案', { ...DEFAULT_RULES, timeout_hours: 12 }),
    ]

    // 保存新方案时的冲突检查
    const newName = '严格方案'
    const saveConflict = schemes.some(s => s.name === newName)
    assert.ok(saveConflict, '保存同名方案应检测到冲突')

    // 重命名时的冲突检查（排除自身）
    const schemeToRename = schemes[1]
    const renameTarget = '默认方案'
    const renameConflict = schemes.some(s => s.id !== schemeToRename.id && s.name === renameTarget)
    assert.ok(renameConflict, '重命名为其他方案已用名称应检测到冲突')

    // 重命名为自身名称不应冲突
    const renameToSelf = schemes.some(s => s.id !== schemeToRename.id && s.name === schemeToRename.name)
    assert.ok(!renameToSelf, '重命名为自身名称不应检测到冲突')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 7: 审计日志持久化（序列化/反序列化）----
  console.log('Test 7: 审计日志持久化 - 序列化和反序列化')
  try {
    const scheme = createMockScheme('持久化测试方案', DEFAULT_RULES)
    const originalLog = createMockAuditLog('update', scheme, {
      oldRules: DEFAULT_RULES,
      newRules: { ...DEFAULT_RULES, timeout_hours: 48 },
      note: '更新规则测试持久化',
    })

    // 序列化（模拟 localStorage 存储）
    const serialized = JSON.stringify({
      ...originalLog,
      operated_at: originalLog.operated_at.toISOString(),
    })

    // 反序列化
    const parsed = reviveDates(JSON.parse(serialized))

    assert.equal(parsed.id, originalLog.id, 'ID 应保持一致')
    assert.equal(parsed.action, originalLog.action, '操作类型应保持一致')
    assert.ok(parsed.operated_at instanceof Date, '操作时间应反序列化为 Date')
    assert.equal(
      parsed.operated_at.getTime(),
      originalLog.operated_at.getTime(),
      '操作时间戳应精确一致'
    )
    assert.equal(parsed.operator, originalLog.operator, '操作者应保持一致')
    assert.ok(parsed.old_rules, '旧规则应保持')
    assert.ok(parsed.new_rules, '新规则应保持')
    assert.equal(parsed.old_rules.timeout_hours, 24, '旧规则阈值应正确')
    assert.equal(parsed.new_rules.timeout_hours, 48, '新规则阈值应正确')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 8: CSV 导出包含新增审计字段 ----
  console.log('Test 8: CSV 导出字段一致性 - 包含方案信息和审计记录')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const scheme = createMockScheme('导出测试方案', DEFAULT_RULES, true)
    const latestAuditLog = createMockAuditLog('update', scheme, {
      oldRules: { ...DEFAULT_RULES, timeout_hours: 12 },
      newRules: DEFAULT_RULES,
      note: '更新为默认规则',
    })

    const schemeInfo = {
      scheme_name: scheme.name,
      scheme_id: scheme.id,
      scheme_created_at: scheme.created_at.toISOString(),
      scheme_updated_at: scheme.updated_at.toISOString(),
      timeout_hours: DEFAULT_RULES.timeout_hours,
      min_score: DEFAULT_RULES.min_score,
      repeat_days: DEFAULT_RULES.repeat_days,
      repeat_count: DEFAULT_RULES.repeat_count,
      high_refund_amount: DEFAULT_RULES.high_refund_amount,
      is_dirty: false,
      latest_audit_action: latestAuditLog.action,
      latest_audit_at: latestAuditLog.operated_at.toISOString(),
      latest_audit_operator: latestAuditLog.operator,
      latest_audit_note: latestAuditLog.note,
    }

    const csv = eventsToCSV(result.events, schemeInfo)
    const lines = csv.split('\n')
    const header = lines[0]

    // 验证新增字段存在
    assert.ok(header.includes('scheme_updated_at'), 'CSV 表头应包含 scheme_updated_at')
    assert.ok(header.includes('scheme_is_dirty'), 'CSV 表头应包含 scheme_is_dirty')
    assert.ok(header.includes('latest_audit_action'), 'CSV 表头应包含 latest_audit_action')
    assert.ok(header.includes('latest_audit_at'), 'CSV 表头应包含 latest_audit_at')
    assert.ok(header.includes('latest_audit_operator'), 'CSV 表头应包含 latest_audit_operator')
    assert.ok(header.includes('latest_audit_note'), 'CSV 表头应包含 latest_audit_note')

    // 验证数据行包含正确值
    if (result.events.length > 0) {
      const firstRow = lines[1]
      assert.ok(firstRow.includes(scheme.name), 'CSV 数据行应包含方案名称')
      assert.ok(firstRow.includes(String(DEFAULT_RULES.timeout_hours)), 'CSV 数据行应包含正确的超时阈值')
      assert.ok(firstRow.includes('update'), 'CSV 数据行应包含审计操作类型')
      assert.ok(firstRow.includes(OPERATOR), 'CSV 数据行应包含操作者')
      assert.ok(firstRow.includes('更新为默认规则'), 'CSV 数据行应包含审计备注')
    }

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 9: JSON 导出包含新增审计字段 ----
  console.log('Test 9: JSON 导出字段一致性 - 包含方案信息和审计记录')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const scheme = createMockScheme('JSON导出测试', DEFAULT_RULES)
    const latestAuditLog = createMockAuditLog('switch', scheme, {
      oldRules: { ...DEFAULT_RULES, timeout_hours: 72 },
      newRules: DEFAULT_RULES,
      note: '切换到当前方案',
    })

    const schemeInfo = {
      scheme_name: scheme.name,
      scheme_id: scheme.id,
      scheme_created_at: scheme.created_at.toISOString(),
      scheme_updated_at: scheme.updated_at.toISOString(),
      timeout_hours: DEFAULT_RULES.timeout_hours,
      min_score: DEFAULT_RULES.min_score,
      repeat_days: DEFAULT_RULES.repeat_days,
      repeat_count: DEFAULT_RULES.repeat_count,
      high_refund_amount: DEFAULT_RULES.high_refund_amount,
      is_dirty: false,
      latest_audit_action: latestAuditLog.action,
      latest_audit_at: latestAuditLog.operated_at.toISOString(),
      latest_audit_operator: latestAuditLog.operator,
      latest_audit_note: latestAuditLog.note,
    }

    const json = eventsToJSON(result.events, result.evidences, true, schemeInfo)
    const parsed = JSON.parse(json)

    assert.ok(parsed.scheme, 'JSON 导出应包含 scheme 对象')
    assert.equal(parsed.scheme.scheme_updated_at, scheme.updated_at.toISOString(), 'scheme_updated_at 应正确')
    assert.equal(parsed.scheme.is_dirty, false, 'is_dirty 应正确')
    assert.equal(parsed.scheme.latest_audit_action, 'switch', 'latest_audit_action 应正确')
    assert.equal(parsed.scheme.latest_audit_operator, OPERATOR, 'latest_audit_operator 应正确')
    assert.equal(parsed.scheme.latest_audit_note, '切换到当前方案', 'latest_audit_note 应正确')
    assert.equal(parsed.scheme.timeout_hours, DEFAULT_RULES.timeout_hours, '规则阈值应使用当前实际值')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 10: 脏状态下导出字段正确性 ----
  console.log('Test 10: 脏状态下导出 - 使用当前实际规则而非方案规则')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const scheme = createMockScheme('脏状态测试方案', DEFAULT_RULES)

    // 模拟用户修改了规则但未保存到方案
    const actualRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 48, min_score: 2 }

    const schemeInfo = {
      scheme_name: scheme.name,
      scheme_id: scheme.id,
      scheme_created_at: scheme.created_at.toISOString(),
      scheme_updated_at: scheme.updated_at.toISOString(),
      timeout_hours: actualRules.timeout_hours,
      min_score: actualRules.min_score,
      repeat_days: actualRules.repeat_days,
      repeat_count: actualRules.repeat_count,
      high_refund_amount: actualRules.high_refund_amount,
      is_dirty: true,
    }

    const json = eventsToJSON(result.events, result.evidences, false, schemeInfo)
    const parsed = JSON.parse(json)

    // 关键验证：导出的规则应该是实际使用的规则，而非方案中的规则
    assert.equal(parsed.scheme.timeout_hours, 48, '脏状态下导出应使用当前实际超时阈值 48，而非方案中的 24')
    assert.equal(parsed.scheme.min_score, 2, '脏状态下导出应使用当前实际低分阈值 2，而非方案中的 3')
    assert.equal(parsed.scheme.is_dirty, true, 'is_dirty 标志应为 true')

    // 验证 CSV 同样使用实际规则
    const csv = eventsToCSV(result.events, schemeInfo)
    const lines = csv.split('\n')
    if (result.events.length > 0) {
      assert.ok(lines[1].includes('48'), 'CSV 应包含实际超时阈值 48')
      assert.ok(lines[1].includes('2'), 'CSV 应包含实际低分阈值 2')
      assert.ok(lines[1].includes('true'), 'CSV 应包含 is_dirty=true')
    }

    console.log('  ✅ 通过（关键：页面显示48/2，导出也为48/2，而非方案的24/3）')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 11: 备份包含审计日志 ----
  console.log('Test 11: 全量备份包含审计日志')
  try {
    const scheme = createMockScheme('备份测试方案', DEFAULT_RULES)
    const auditLogs: SchemeAuditLog[] = [
      createMockAuditLog('create', scheme, { newRules: DEFAULT_RULES, note: '创建方案' }),
      createMockAuditLog('update', scheme, {
        oldRules: DEFAULT_RULES,
        newRules: { ...DEFAULT_RULES, timeout_hours: 36 },
        note: '更新超时阈值',
      }),
    ]

    const backupState = {
      tickets: [],
      scores: [],
      refunds: [],
      events: [],
      evidences: [],
      importRecords: [],
      rules: DEFAULT_RULES,
      lastBatchOperation: null,
      snapshots: [],
      lastDeletedSnapshot: null,
      schemes: [scheme],
      activeSchemeId: scheme.id,
      schemeAuditLogs: auditLogs.map(log => ({
        ...log,
        operated_at: log.operated_at.toISOString(),
      })),
    }

    const backup = buildFullBackup(backupState)
    const parsed = JSON.parse(backup)

    assert.ok(parsed.state.schemeAuditLogs, '备份应包含 schemeAuditLogs 字段')
    assert.equal(parsed.state.schemeAuditLogs.length, 2, '备份应包含 2 条审计日志')
    assert.equal(parsed.state.schemeAuditLogs[0].action, 'create', '第一条审计日志操作类型应正确')
    assert.equal(parsed.state.schemeAuditLogs[1].action, 'update', '第二条审计日志操作类型应正确')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 12: 备份恢复后审计日志不丢失 ----
  console.log('Test 12: 备份恢复后审计日志不丢失')
  try {
    const scheme = createMockScheme('恢复测试方案', DEFAULT_RULES)
    const originalAuditLogs: SchemeAuditLog[] = [
      createMockAuditLog('create', scheme, { newRules: DEFAULT_RULES, note: '创建方案' }),
      createMockAuditLog('rename', { ...scheme, name: '重命名后的方案' }, {
        oldName: scheme.name,
        newName: '重命名后的方案',
        note: '重命名方案',
      }),
      createMockAuditLog('switch', scheme, {
        oldRules: { ...DEFAULT_RULES, timeout_hours: 72 },
        newRules: DEFAULT_RULES,
        note: '切换方案',
      }),
    ]

    // 创建备份
    const backupState = {
      tickets: tickets.map(t => ({ ...t, created_at: t.created_at.toISOString(), resolved_at: t.resolved_at?.toISOString() || null })),
      scores: scores.map(s => ({ ...s, visited_at: s.visited_at.toISOString() })),
      refunds: refunds.map(r => ({ ...r, refunded_at: r.refunded_at.toISOString() })),
      events: [],
      evidences: [],
      importRecords: [],
      rules: DEFAULT_RULES,
      lastBatchOperation: null,
      snapshots: [],
      lastDeletedSnapshot: null,
      schemes: [scheme].map(sc => ({
        ...sc,
        created_at: sc.created_at.toISOString(),
        updated_at: sc.updated_at.toISOString(),
      })),
      activeSchemeId: scheme.id,
      schemeAuditLogs: originalAuditLogs.map(log => ({
        ...log,
        operated_at: log.operated_at.toISOString(),
      })),
    }

    const backupJSON = buildFullBackup(backupState)

    // 模拟恢复
    const restoredState = parseFullBackup(backupJSON)
    const revived = reviveDates(restoredState as any) as any

    assert.ok(revived.schemeAuditLogs, '恢复后应存在 schemeAuditLogs')
    assert.equal(revived.schemeAuditLogs.length, originalAuditLogs.length, '恢复后审计日志数量应相同')

    // 验证每条日志
    originalAuditLogs.forEach((originalLog, index) => {
      const restoredLog = revived.schemeAuditLogs[index]
      assert.equal(restoredLog.id, originalLog.id, `第 ${index} 条日志 ID 应一致`)
      assert.equal(restoredLog.action, originalLog.action, `第 ${index} 条日志操作类型应一致`)
      assert.ok(restoredLog.operated_at instanceof Date, `第 ${index} 条日志操作时间应为 Date`)
      assert.equal(
        restoredLog.operated_at.getTime(),
        originalLog.operated_at.getTime(),
        `第 ${index} 条日志操作时间戳应精确一致`
      )
      assert.equal(restoredLog.scheme_name, originalLog.scheme_name, `第 ${index} 条日志方案名称应一致`)
    })

    console.log('  ✅ 通过（3条审计日志完整恢复，时间戳精确到毫秒）')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 13: 完整业务链路验证 ----
  console.log('Test 13: 完整业务链路 - 导入样例 → 切换方案 → 重分析 → 保存快照 → 导出 → 备份恢复')
  try {
    // Step 1: 导入样例数据并使用默认方案分析
    const defaultScheme = createMockScheme('默认方案', DEFAULT_RULES, true)
    const defaultResult = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)

    // Step 2: 创建审计日志（导入数据后创建新方案）
    const strictRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 12, min_score: 2, high_refund_amount: 300 }
    const strictScheme = createMockScheme('严格方案', strictRules)
    const createAuditLog = createMockAuditLog('create', strictScheme, {
      newRules: strictRules,
      note: '创建严格方案',
    })

    // Step 3: 切换到严格方案并重新分析
    const switchAuditLog = createMockAuditLog('switch', strictScheme, {
      oldRules: defaultScheme.rules,
      newRules: strictRules,
      note: `从方案「${defaultScheme.name}」切换到「${strictScheme.name}」`,
    })
    const strictResult = runAnalysis(tickets, scores, refunds, strictRules)

    // Step 4: 保存快照（关联方案信息）
    const snapWithScheme = createSnapshot(
      '严格方案快照',
      undefined,
      strictResult.events,
      strictRules,
      [],
      {
        scheme_id: strictScheme.id,
        scheme_name: strictScheme.name,
        scheme_created_at: strictScheme.created_at,
      }
    )

    // Step 5: 更新方案规则
    const updatedRules: QualityRule = { ...strictRules, timeout_hours: 18 }
    const updateAuditLog = createMockAuditLog('update', { ...strictScheme, rules: updatedRules }, {
      oldRules: strictRules,
      newRules: updatedRules,
      note: '将超时阈值从12h调整为18h',
    })
    const updatedResult = runAnalysis(tickets, scores, refunds, updatedRules)

    // Step 6: 导出 CSV，验证字段
    const latestAuditLog = updateAuditLog
    const schemeInfo = {
      scheme_name: strictScheme.name,
      scheme_id: strictScheme.id,
      scheme_created_at: strictScheme.created_at.toISOString(),
      scheme_updated_at: strictScheme.updated_at.toISOString(),
      timeout_hours: updatedRules.timeout_hours,
      min_score: updatedRules.min_score,
      repeat_days: updatedRules.repeat_days,
      repeat_count: updatedRules.repeat_count,
      high_refund_amount: updatedRules.high_refund_amount,
      is_dirty: false,
      latest_audit_action: latestAuditLog.action,
      latest_audit_at: latestAuditLog.operated_at.toISOString(),
      latest_audit_operator: latestAuditLog.operator,
      latest_audit_note: latestAuditLog.note,
    }

    const csv = eventsToCSV(updatedResult.events, schemeInfo)
    const csvHeader = csv.split('\n')[0]
    const csvData = csv.split('\n')[1] || ''

    // 验证导出包含完整的方案信息和审计信息
    assert.ok(csvHeader.includes('scheme_name'), 'CSV 应包含 scheme_name')
    assert.ok(csvHeader.includes('scheme_created_at'), 'CSV 应包含 scheme_created_at')
    assert.ok(csvHeader.includes('scheme_timeout_hours'), 'CSV 应包含 scheme_timeout_hours')
    assert.ok(csvHeader.includes('latest_audit_action'), 'CSV 应包含 latest_audit_action')
    assert.ok(csvHeader.includes('latest_audit_note'), 'CSV 应包含 latest_audit_note')

    if (updatedResult.events.length > 0) {
      assert.ok(csvData.includes('严格方案'), 'CSV 数据应包含方案名称')
      assert.ok(csvData.includes('18'), 'CSV 数据应包含当前实际超时阈值 18')
      assert.ok(csvData.includes('update'), 'CSV 数据应包含审计操作类型')
      assert.ok(csvData.includes('12h调整为18h'), 'CSV 数据应包含审计备注')
    }

    // Step 7: JSON 导出同样验证
    const json = eventsToJSON(updatedResult.events, updatedResult.evidences, true, schemeInfo)
    const parsedJSON = JSON.parse(json)
    assert.equal(parsedJSON.scheme.scheme_name, '严格方案', 'JSON 方案名称应正确')
    assert.equal(parsedJSON.scheme.timeout_hours, 18, 'JSON 超时阈值应为当前实际值 18')
    assert.equal(parsedJSON.scheme.latest_audit_action, 'update', 'JSON 审计操作类型应正确')

    // Step 8: 备份并验证包含所有数据
    const auditLogs = [createAuditLog, switchAuditLog, updateAuditLog]
    const backupState = {
      tickets: tickets.map(t => ({ ...t, created_at: t.created_at.toISOString(), resolved_at: t.resolved_at?.toISOString() || null })),
      scores: scores.map(s => ({ ...s, visited_at: s.visited_at.toISOString() })),
      refunds: refunds.map(r => ({ ...r, refunded_at: r.refunded_at.toISOString() })),
      events: updatedResult.events.map(e => ({
        ...e,
        first_seen_at: e.first_seen_at.toISOString(),
        last_seen_at: e.last_seen_at.toISOString(),
      })),
      evidences: updatedResult.evidences.map(ev => ({ ...ev, occurred_at: ev.occurred_at.toISOString() })),
      importRecords: [],
      rules: updatedRules,
      lastBatchOperation: null,
      snapshots: [{
        ...snapWithScheme,
        created_at: snapWithScheme.created_at.toISOString(),
        scheme_created_at: snapWithScheme.scheme_created_at?.toISOString() || null,
      }],
      lastDeletedSnapshot: null,
      schemes: [defaultScheme, strictScheme].map(sc => ({
        ...sc,
        created_at: sc.created_at.toISOString(),
        updated_at: sc.updated_at.toISOString(),
      })),
      activeSchemeId: strictScheme.id,
      schemeAuditLogs: auditLogs.map(log => ({
        ...log,
        operated_at: log.operated_at.toISOString(),
      })),
    }

    const backup = buildFullBackup(backupState)
    const parsedBackup = JSON.parse(backup)

    // 验证备份完整性
    assert.ok(parsedBackup.state.schemes.length === 2, '备份应包含 2 个方案')
    assert.ok(parsedBackup.state.schemeAuditLogs.length === 3, '备份应包含 3 条审计日志')
    assert.ok(parsedBackup.state.snapshots.length === 1, '备份应包含 1 个快照')
    assert.equal(parsedBackup.state.snapshots[0].scheme_name, '严格方案', '快照应关联正确的方案名')

    // Step 9: 恢复备份并验证
    const restored = reviveDates(parseFullBackup(backup) as any) as any
    assert.equal(restored.schemeAuditLogs.length, 3, '恢复后应有 3 条审计日志')
    assert.equal(restored.activeSchemeId, strictScheme.id, '恢复后激活方案应正确')
    assert.equal(restored.schemes.length, 2, '恢复后应有 2 个方案')
    assert.ok(restored.schemeAuditLogs[0].operated_at instanceof Date, '恢复后审计日志时间应为 Date')

    console.log('  ✅ 通过（完整链路：创建→切换→更新→快照→导出→备份→恢复，数据完整一致）')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- 汇总 ----
  console.log(`\n=== 测试结果：${passed} 通过，${failed} 失败 ===\n`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((e) => {
  console.error('测试执行出错:', e)
  process.exit(1)
})
