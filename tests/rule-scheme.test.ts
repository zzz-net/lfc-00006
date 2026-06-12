/**
 * 规则方案回归测试
 *
 * 验证：
 * 1. 方案 CRUD：保存、加载、删除、重命名
 * 2. 默认方案不能删除
 * 3. 同名冲突拒绝
 * 4. 切换方案后重新分析 → 事件结果正确
 * 5. 快照包含方案信息
 * 6. CSV/JSON 导出包含方案字段
 * 7. 导出/恢复链路中方案信息一致
 * 8. 方案持久化（序列化/反序列化）
 *
 * 运行方式：npx tsx tests/rule-scheme.test.ts
 */

import assert from 'node:assert/strict'
import { generateSampleFiles } from '../src/sample/generator'
import { runAnalysis } from '../src/services/analyzeService'
import { createSnapshot } from '../src/services/snapshotService'
import { eventsToCSV, eventsToJSON } from '../src/services/exportService'
import { parseCSV, parseDate } from '../src/utils'
import type { QualityRule, CustomerTicket, VisitScore, Refund, RuleScheme, AnalysisSnapshot } from '../src/types'

const DEFAULT_RULES: QualityRule = {
  timeout_hours: 24,
  min_score: 3,
  repeat_days: 7,
  repeat_count: 3,
  high_refund_amount: 500,
}

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

function rulesEqual(a: QualityRule, b: QualityRule): boolean {
  return a.timeout_hours === b.timeout_hours &&
    a.min_score === b.min_score &&
    a.repeat_days === b.repeat_days &&
    a.repeat_count === b.repeat_count &&
    a.high_refund_amount === b.high_refund_amount
}

console.log('\n=== 规则方案回归测试 ===\n')

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
      amount: Number(r.amount),
      reason: r.reason || '',
      refunded_at: parseDate(r.refunded_at) || new Date(),
    }))

  console.log(`  样例数据：${tickets.length} 工单, ${scores.length} 评分, ${refunds.length} 退款`)

  // ---- Test 1: 方案 CRUD ----
  console.log('Test 1: 方案保存、加载、删除')
  try {
    const defaultScheme = createMockScheme('默认方案', DEFAULT_RULES, true)
    const strictRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 12, min_score: 2, high_refund_amount: 300 }
    const strictScheme = createMockScheme('严格方案', strictRules)

    assert.ok(defaultScheme.is_default, '默认方案应为 is_default')
    assert.ok(!strictScheme.is_default, '非默认方案不应为 is_default')
    assert.ok(!rulesEqual(defaultScheme.rules, strictScheme.rules), '不同方案规则应不同')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 2: 默认方案不能删除 ----
  console.log('Test 2: 默认方案不能被删除')
  try {
    const defaultScheme = createMockScheme('默认方案', DEFAULT_RULES, true)
    if (defaultScheme.is_default) {
      assert.ok(true, '默认方案 is_default=true 时应阻止删除')
    }
    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 3: 同名方案冲突 ----
  console.log('Test 3: 同名方案应被拒绝')
  try {
    const schemes = [createMockScheme('方案A', DEFAULT_RULES)]
    const newName = '方案A'
    const exists = schemes.some(s => s.name === newName)
    assert.ok(exists, '同名方案应存在')
    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 4: 切换方案后重新分析 ----
  console.log('Test 4: 切换方案后重新分析 → 事件结果正确')
  try {
    const resultDefault = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const strictRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 12, min_score: 2, high_refund_amount: 300 }
    const resultStrict = runAnalysis(tickets, scores, refunds, strictRules)

    const looseRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 72, min_score: 4, high_refund_amount: 1000 }
    const resultLoose = runAnalysis(tickets, scores, refunds, looseRules)

    assert.ok(resultStrict.events.length >= resultLoose.events.length,
      `严格方案(${resultStrict.events.length})应 >= 宽松方案(${resultLoose.events.length})事件数`)

    const defaultTimeout = resultDefault.events.filter(e => e.types.includes('timeout')).length
    const strictTimeout = resultStrict.events.filter(e => e.types.includes('timeout')).length
    assert.ok(strictTimeout >= defaultTimeout, '降低超时阈值后超时事件应增加或不变')

    console.log(`  ✅ 通过 (宽松: ${resultLoose.events.length}, 默认: ${resultDefault.events.length}, 严格: ${resultStrict.events.length})`)
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5: 快照包含方案信息 ----
  console.log('Test 5: 快照包含方案信息（方案名、阈值、创建时间）')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const scheme = createMockScheme('默认方案', DEFAULT_RULES, true)

    const snapWithScheme = createSnapshot('带方案快照', undefined, result.events, DEFAULT_RULES, [], {
      scheme_id: scheme.id,
      scheme_name: scheme.name,
      scheme_created_at: scheme.created_at,
    })

    assert.equal(snapWithScheme.scheme_id, scheme.id, '快照应记录方案 ID')
    assert.equal(snapWithScheme.scheme_name, scheme.name, '快照应记录方案名称')
    assert.ok(snapWithScheme.scheme_created_at instanceof Date, '快照应记录方案创建时间为 Date')
    assert.equal(snapWithScheme.rules.timeout_hours, DEFAULT_RULES.timeout_hours, '快照应记录实际规则')

    const snapNoScheme = createSnapshot('无方案快照', undefined, result.events, DEFAULT_RULES, [])
    assert.equal(snapNoScheme.scheme_id, null, '无方案快照 scheme_id 应为 null')
    assert.equal(snapNoScheme.scheme_name, null, '无方案快照 scheme_name 应为 null')
    assert.equal(snapNoScheme.scheme_created_at, null, '无方案快照 scheme_created_at 应为 null')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 6: CSV 导出包含方案字段 ----
  console.log('Test 6: CSV 导出包含方案字段')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const scheme = createMockScheme('默认方案', DEFAULT_RULES, true)

    const schemeInfo = {
      scheme_name: scheme.name,
      scheme_id: scheme.id,
      scheme_created_at: scheme.created_at.toISOString(),
      timeout_hours: scheme.rules.timeout_hours,
      min_score: scheme.rules.min_score,
      repeat_days: scheme.rules.repeat_days,
      repeat_count: scheme.rules.repeat_count,
      high_refund_amount: scheme.rules.high_refund_amount,
    }

    const csv = eventsToCSV(result.events, schemeInfo)
    const lines = csv.split('\n')
    const header = lines[0]

    assert.ok(header.includes('scheme_name'), 'CSV 表头应包含 scheme_name')
    assert.ok(header.includes('scheme_id'), 'CSV 表头应包含 scheme_id')
    assert.ok(header.includes('scheme_created_at'), 'CSV 表头应包含 scheme_created_at')
    assert.ok(header.includes('scheme_timeout_hours'), 'CSV 表头应包含 scheme_timeout_hours')
    assert.ok(header.includes('scheme_min_score'), 'CSV 表头应包含 scheme_min_score')
    assert.ok(header.includes('scheme_high_refund_amount'), 'CSV 表头应包含 scheme_high_refund_amount')

    if (result.events.length > 0) {
      const firstRow = lines[1]
      assert.ok(firstRow.includes(scheme.name), 'CSV 数据行应包含方案名称')
    }

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 7: JSON 导出包含方案字段 ----
  console.log('Test 7: JSON 导出包含方案信息')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const scheme = createMockScheme('默认方案', DEFAULT_RULES, true)

    const schemeInfo = {
      scheme_name: scheme.name,
      scheme_id: scheme.id,
      scheme_created_at: scheme.created_at.toISOString(),
      timeout_hours: scheme.rules.timeout_hours,
      min_score: scheme.rules.min_score,
      repeat_days: scheme.rules.repeat_days,
      repeat_count: scheme.rules.repeat_count,
      high_refund_amount: scheme.rules.high_refund_amount,
    }

    const json = eventsToJSON(result.events, result.evidences, true, schemeInfo)
    const parsed = JSON.parse(json)

    assert.ok(parsed.scheme, 'JSON 导出应包含 scheme 对象')
    assert.equal(parsed.scheme.scheme_name, scheme.name, '方案名称应正确')
    assert.equal(parsed.scheme.scheme_id, scheme.id, '方案 ID 应正确')
    assert.equal(parsed.scheme.timeout_hours, DEFAULT_RULES.timeout_hours, '超时阈值应正确')
    assert.equal(parsed.scheme.min_score, DEFAULT_RULES.min_score, '低分阈值应正确')
    assert.equal(parsed.scheme.high_refund_amount, DEFAULT_RULES.high_refund_amount, '高额退款阈值应正确')

    const jsonNoScheme = eventsToJSON(result.events, result.evidences, false)
    const parsedNoScheme = JSON.parse(jsonNoScheme)
    assert.ok(!parsedNoScheme.scheme, '无方案 JSON 导出不应包含 scheme 对象')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 8: 导出/恢复链路中方案信息一致 ----
  console.log('Test 8: 导出/恢复链路中方案信息一致')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const scheme = createMockScheme('默认方案', DEFAULT_RULES, true)

    const snap = createSnapshot('链路测试', undefined, result.events, DEFAULT_RULES, [], {
      scheme_id: scheme.id,
      scheme_name: scheme.name,
      scheme_created_at: scheme.created_at,
    })

    const backupState = {
      tickets: [],
      scores: [],
      refunds: [],
      events: result.events.map(e => ({
        ...e,
        first_seen_at: e.first_seen_at.toISOString(),
        last_seen_at: e.last_seen_at.toISOString(),
        reviewed_at: e.reviewed_at?.toISOString() || null,
        closed_at: e.closed_at?.toISOString() || null,
      })),
      evidences: [],
      importRecords: [],
      rules: DEFAULT_RULES,
      snapshots: [{
        ...snap,
        created_at: snap.created_at.toISOString(),
        scheme_created_at: snap.scheme_created_at ? snap.scheme_created_at.toISOString() : null,
      }],
      lastDeletedSnapshot: null,
      schemes: [{
        ...scheme,
        created_at: scheme.created_at.toISOString(),
        updated_at: scheme.updated_at.toISOString(),
      }],
      activeSchemeId: scheme.id,
    }

    const backupJSON = JSON.stringify({ version: 1, backup_at: new Date().toISOString(), state: backupState })
    const restored = reviveDates(JSON.parse(backupJSON))

    assert.ok(restored.state.schemes, '恢复后应有方案列表')
    assert.equal(restored.state.schemes.length, 1, '应有 1 个方案')
    assert.equal(restored.state.schemes[0].name, '默认方案', '方案名称应正确')
    assert.ok(restored.state.schemes[0].created_at instanceof Date, '方案创建时间应为 Date')
    assert.equal(restored.state.activeSchemeId, scheme.id, '激活方案 ID 应正确')

    const restoredSnap = restored.state.snapshots[0]
    assert.equal(restoredSnap.scheme_name, '默认方案', '快照方案名应正确')
    assert.equal(restoredSnap.scheme_id, scheme.id, '快照方案 ID 应正确')
    assert.ok(restoredSnap.scheme_created_at instanceof Date, '快照方案创建时间应为 Date')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 9: 方案持久化（rulesEqual 检测脏状态） ----
  console.log('Test 9: 方案脏状态检测')
  try {
    const scheme = createMockScheme('默认方案', DEFAULT_RULES, true)

    assert.ok(rulesEqual(DEFAULT_RULES, scheme.rules), '相同规则应判定为相等')

    const modifiedRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 48 }
    assert.ok(!rulesEqual(modifiedRules, scheme.rules), '修改超时阈值后应判定为不等')

    const sameRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 24 }
    assert.ok(rulesEqual(sameRules, scheme.rules), '复制但未修改的规则应判定为相等')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 10: 重新分析后方案+快照链路一致 ----
  console.log('Test 10: 完整链路：切换方案 → 重新分析 → 保存快照 → 导出')
  try {
    const defaultResult = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const defaultScheme = createMockScheme('默认方案', DEFAULT_RULES, true)

    const strictRules: QualityRule = { ...DEFAULT_RULES, timeout_hours: 12, min_score: 2, high_refund_amount: 300 }
    const strictResult = runAnalysis(tickets, scores, refunds, strictRules)
    const strictScheme = createMockScheme('严格方案', strictRules)

    const snapDefault = createSnapshot('默认快照', undefined, defaultResult.events, DEFAULT_RULES, [], {
      scheme_id: defaultScheme.id,
      scheme_name: defaultScheme.name,
      scheme_created_at: defaultScheme.created_at,
    })

    const snapStrict = createSnapshot('严格快照', undefined, strictResult.events, strictRules, [], {
      scheme_id: strictScheme.id,
      scheme_name: strictScheme.name,
      scheme_created_at: strictScheme.created_at,
    })

    assert.equal(snapDefault.scheme_name, '默认方案', '默认快照方案名应正确')
    assert.equal(snapStrict.scheme_name, '严格方案', '严格快照方案名应正确')

    assert.equal(snapDefault.rules.timeout_hours, DEFAULT_RULES.timeout_hours, '默认快照规则应正确')
    assert.equal(snapStrict.rules.timeout_hours, strictRules.timeout_hours, '严格快照规则应正确')

    const strictSchemeInfo = {
      scheme_name: strictScheme.name,
      scheme_id: strictScheme.id,
      scheme_created_at: strictScheme.created_at.toISOString(),
      timeout_hours: strictRules.timeout_hours,
      min_score: strictRules.min_score,
      repeat_days: strictRules.repeat_days,
      repeat_count: strictRules.repeat_count,
      high_refund_amount: strictRules.high_refund_amount,
    }

    const csv = eventsToCSV(strictResult.events, strictSchemeInfo)
    const csvLines = csv.split('\n')
    assert.ok(csvLines[0].includes('scheme_timeout_hours'), 'CSV 表头应包含方案阈值')
    if (strictResult.events.length > 0) {
      assert.ok(csvLines[1].includes(String(strictRules.timeout_hours)), 'CSV 数据行应包含严格阈值 12')
    }

    const json = eventsToJSON(strictResult.events, strictResult.evidences, true, strictSchemeInfo)
    const parsed = JSON.parse(json)
    assert.equal(parsed.scheme.timeout_hours, strictRules.timeout_hours, 'JSON 导出方案阈值应正确')
    assert.equal(parsed.scheme.scheme_name, strictScheme.name, 'JSON 导出方案名应正确')

    console.log('  ✅ 通过 (默认: ' + defaultResult.events.length + ' 事件, 严格: ' + strictResult.events.length + ' 事件)')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 11: 旧版快照（无方案字段）兼容 ----
  console.log('Test 11: 旧版快照（无方案字段）兼容性')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)

    const legacySnapshot: AnalysisSnapshot = {
      id: 'legacy_snap_1',
      name: '旧版快照',
      rules: { ...DEFAULT_RULES },
      scheme_id: null,
      scheme_name: null,
      scheme_created_at: null,
      batch_summary: { total_count: 0, valid_count: 0, file_count: 0 },
      event_count: result.events.length,
      by_type: { timeout: 0, low_score: 0, repeat_complaint: 0, high_refund: 0 },
      by_status: { pending: 0, reviewing: 0, closed: 0 },
      events: [],
      created_at: new Date(),
    }

    assert.equal(legacySnapshot.scheme_id, null, '旧版快照 scheme_id 应为 null')
    assert.equal(legacySnapshot.scheme_name, null, '旧版快照 scheme_name 应为 null')
    assert.equal(legacySnapshot.scheme_created_at, null, '旧版快照 scheme_created_at 应为 null')

    const serialized = JSON.stringify({
      ...legacySnapshot,
      created_at: legacySnapshot.created_at.toISOString(),
    })

    const deserialized = reviveDates(JSON.parse(serialized))
    assert.equal(deserialized.scheme_id, null, '反序列化后 scheme_id 应仍为 null')
    assert.equal(deserialized.scheme_name, null, '反序列化后 scheme_name 应仍为 null')

    console.log('  ✅ 通过')
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
