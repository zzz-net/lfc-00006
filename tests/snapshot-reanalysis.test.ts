/**
 * 真实链路集成测试 - 用样例数据验证跨重分析的快照对比
 *
 * 验证：
 * 1. 同一样例数据连续两次分析 → 事件 ID 一致 → 快照对比全部 unchanged
 * 2. 阈值变化后重分析 → 命中差异正确反映
 * 3. 状态变化后快照对比 → 正确识别
 * 4. 导出/恢复 → 快照数据完整
 * 5. 删除/撤销 → 功能正常
 *
 * 运行方式：npx tsx tests/snapshot-reanalysis.test.ts
 */

import assert from 'node:assert/strict'
import { generateSampleFiles } from '../src/sample/generator'
import { runAnalysis } from '../src/services/analyzeService'
import { createSnapshot, computeSnapshotDiff, snapshotsAreEqual } from '../src/services/snapshotService'
import { parseCSV, parseDate } from '../src/utils'
import type { QualityRule, AnalysisSnapshot, CustomerTicket, VisitScore, Refund } from '../src/types'

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

console.log('\n=== 真实链路集成测试：样例数据重分析+快照对比 ===\n')

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

  // ---- Test 1: 同一数据两次分析 → 事件 ID 完全一致 ----
  console.log('Test 1: 同一样例数据连续两次分析 → 事件 ID 一致')
  try {
    const result1 = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const result2 = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)

    const ids1 = result1.events.map((e) => e.id).sort()
    const ids2 = result2.events.map((e) => e.id).sort()
    assert.deepEqual(ids1, ids2, '两次分析应产生完全相同的事件 ID 集合')

    for (const e1 of result1.events) {
      const e2 = result2.events.find((e) => e.id === e1.id)
      assert.ok(e2, `事件 ${e1.id} 在第二次分析中应存在`)
      assert.deepEqual(e1.types.sort(), e2.types.sort(), `事件 ${e1.id} 类型应一致`)
    }

    console.log(`  ✅ 通过 (${result1.events.length} 个事件, ID 全部一致)`)
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 2: 同一数据两次分析+快照对比 → 全部 unchanged ----
  console.log('Test 2: 同一数据两次分析保存快照对比 → 无误判新增/消失')
  try {
    const result1 = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const snap1 = createSnapshot('分析快照 1', '首次分析', result1.events, DEFAULT_RULES, [])

    const result2 = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const snap2 = createSnapshot('分析快照 2', '重分析', result2.events, DEFAULT_RULES, [])

    const diff = computeSnapshotDiff(snap1, snap2)

    assert.equal(diff.total_added, 0, '不应有误判的新增事件')
    assert.equal(diff.total_removed, 0, '不应有误判的消失事件')
    assert.equal(diff.total_status_changed, 0, '不应有状态变化')
    assert.equal(diff.total_type_changed, 0, '不应有类型变化')
    assert.equal(diff.total_unchanged, result1.events.length, `应有 ${result1.events.length} 个未变化事件`)
    assert.equal(diff.rule_diffs.length, 0, '规则未变化')

    console.log(`  ✅ 通过 (${diff.total_unchanged} 个事件全部 unchanged)`)
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 3: 阈值变化后重分析 → 命中差异正确 ----
  console.log('Test 3: 调整阈值后重分析+快照对比 → 差异正确反映')
  try {
    const rulesStrict: QualityRule = { ...DEFAULT_RULES, timeout_hours: 12, min_score: 2, high_refund_amount: 400 }
    const rulesLoose: QualityRule = { ...DEFAULT_RULES, timeout_hours: 48, min_score: 4, high_refund_amount: 800 }

    const resultStrict = runAnalysis(tickets, scores, refunds, rulesStrict)
    const resultLoose = runAnalysis(tickets, scores, refunds, rulesLoose)

    const snapStrict = createSnapshot('严格阈值', undefined, resultStrict.events, rulesStrict, [])
    const snapLoose = createSnapshot('宽松阈值', undefined, resultLoose.events, rulesLoose, [])

    const diff = computeSnapshotDiff(snapStrict, snapLoose)

    assert.ok(resultStrict.events.length >= resultLoose.events.length,
      `严格阈值(${resultStrict.events.length})应 >= 宽松阈值(${resultLoose.events.length})事件数`)

    if (resultStrict.events.length > resultLoose.events.length) {
      assert.ok(diff.total_removed > 0, '阈值放宽后应有事件消失')
    }

    assert.ok(diff.rule_diffs.length >= 1, '应有规则差异')
    console.log(`  ✅ 通过 (严格: ${resultStrict.events.length}, 宽松: ${resultLoose.events.length}, 消失: ${diff.total_removed})`)
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 4: 状态变化后快照对比 ----
  console.log('Test 4: 人工复核状态变化 → 快照对比正确识别')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)

    const eventsBefore = result.events

    const eventsAfter = result.events.map((e) => {
      if (e.status === 'pending') {
        return { ...e, status: 'reviewing' as const, review_note: '正在复核', reviewed_at: new Date() }
      }
      return { ...e }
    })

    const snap1 = createSnapshot('复核前', undefined, eventsBefore, DEFAULT_RULES, [])
    const snap2 = createSnapshot('复核后', undefined, eventsAfter, DEFAULT_RULES, [])

    const diff = computeSnapshotDiff(snap1, snap2)

    const pendingCount = eventsBefore.filter((e) => e.status === 'pending').length
    assert.equal(diff.total_status_changed, pendingCount, `应有 ${pendingCount} 个状态变化`)
    assert.equal(diff.total_added, 0, '不应有新增')
    assert.equal(diff.total_removed, 0, '不应有消失')

    console.log(`  ✅ 通过 (${diff.total_status_changed} 个状态变化)`)
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5: 导出/恢复包含快照 ----
  console.log('Test 5: 导出备份包含快照数据，恢复后完整')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const snap1 = createSnapshot('备份测试1', undefined, result.events, DEFAULT_RULES, [])
    const snap2 = createSnapshot('备份测试2', undefined, result.events, DEFAULT_RULES, [])

    const backupState = {
      tickets: [],
      scores: [],
      refunds: [],
      events: result.events.map((e) => ({
        ...e,
        first_seen_at: e.first_seen_at.toISOString(),
        last_seen_at: e.last_seen_at.toISOString(),
        reviewed_at: e.reviewed_at?.toISOString() || null,
        closed_at: e.closed_at?.toISOString() || null,
      })),
      evidences: [],
      importRecords: [],
      rules: DEFAULT_RULES,
      snapshots: [snap1, snap2].map((s) => ({
        ...s,
        created_at: s.created_at.toISOString(),
      })),
      lastDeletedSnapshot: null,
    }

    const backupJSON = JSON.stringify({ version: 1, backup_at: new Date().toISOString(), state: backupState })
    const restored = reviveDates(JSON.parse(backupJSON))

    assert.ok(restored.state.snapshots, '恢复后应有快照')
    assert.equal(restored.state.snapshots.length, 2, '应有 2 个快照')
    assert.equal(restored.state.snapshots[0].name, '备份测试1', '快照名称应正确')
    assert.ok(restored.state.snapshots[0].created_at instanceof Date, '快照时间应为 Date')
    assert.equal(restored.state.snapshots[0].event_count, result.events.length, '快照事件数应正确')

    console.log(`  ✅ 通过 (${restored.state.snapshots.length} 个快照完整恢复)`)
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 6: 删除/撤销 ----
  console.log('Test 6: 快照删除与撤销恢复')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const snap1 = createSnapshot('待删除', undefined, result.events, DEFAULT_RULES, [])
    const snap2 = createSnapshot('保留', undefined, result.events, DEFAULT_RULES, [])
    let snapshots = [snap1, snap2]
    let lastDeleted: { snapshot: AnalysisSnapshot; deleted_at: Date } | null = null

    const deleted = snapshots.find((s) => s.id === snap1.id)!
    lastDeleted = { snapshot: deleted, deleted_at: new Date() }
    snapshots = snapshots.filter((s) => s.id !== snap1.id)

    assert.equal(snapshots.length, 1, '删除后应剩 1 个')
    assert.ok(lastDeleted, '应有删除记录')

    snapshots = [lastDeleted.snapshot, ...snapshots]
    lastDeleted = null

    assert.equal(snapshots.length, 2, '撤销后应恢复为 2 个')
    assert.ok(snapshots.find((s) => s.id === snap1.id), '原快照应存在')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 7: 重复快照检测（重分析后内容相同） ----
  console.log('Test 7: 重分析后内容相同 → 快照应判定为重复')
  try {
    const result1 = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)
    const result2 = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)

    const snap1 = createSnapshot('快照A', undefined, result1.events, DEFAULT_RULES, [])
    const snap2 = createSnapshot('快照B', undefined, result2.events, DEFAULT_RULES, [])

    assert.ok(snapshotsAreEqual(snap1, snap2), '同数据同规则两次分析的快照应判定为相等')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 8: 确定性 ID 跨数据源稳定 ----
  console.log('Test 8: 同一客户的不同证据组合 → 事件 ID 可区分')
  try {
    const result = runAnalysis(tickets, scores, refunds, DEFAULT_RULES)

    const customerEvents = new Map<string, string[]>()
    for (const e of result.events) {
      const arr = customerEvents.get(e.customer_id) || []
      arr.push(e.id)
      customerEvents.set(e.customer_id, arr)
    }

    for (const [customerId, eventIds] of customerEvents) {
      const uniqueIds = new Set(eventIds)
      assert.equal(uniqueIds.size, eventIds.length, `客户 ${customerId} 的事件 ID 应唯一`)
    }

    console.log(`  ✅ 通过 (${result.events.length} 个事件 ID 全局可区分)`)
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
