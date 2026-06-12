/**
 * 分析快照对比功能回归测试
 *
 * 覆盖场景：
 * 1. 快照创建 - 正确记录规则、数据摘要、事件统计
 * 2. 快照对比 - 新增/消失/状态变化/类型变化事件识别
 * 3. 规则变化影响 - 阈值变化的差异计算和影响说明
 * 4. 重名处理 - 自动生成唯一名称
 * 5. 空快照检测 - 无数据时无法保存
 * 6. 重复保存检测 - 相同内容不重复保存
 * 7. 删除撤销 - 删除后可撤销一次恢复
 * 8. 持久化验证 - 刷新后快照保持
 * 9. 备份恢复 - 全量备份包含快照，恢复后快照完整
 * 10. 边界情况 - 空数据、重命名冲突、大量快照
 *
 * 运行方式：npx tsx tests/snapshot-compare.test.ts
 */

import assert from 'node:assert/strict'
import { uid } from '../src/utils'
import type {
  QualityEvent,
  QualityRule,
  ImportRecord,
  AnalysisSnapshot,
  QualityEventType,
  EventStatus,
} from '../src/types'
import {
  createSnapshot,
  computeSnapshotDiff,
  generateUniqueSnapshotName,
  isSnapshotEmpty,
  snapshotsAreEqual,
} from '../src/services/snapshotService'

const DEFAULT_RULES: QualityRule = {
  timeout_hours: 24,
  min_score: 3,
  repeat_days: 7,
  repeat_count: 3,
  high_refund_amount: 500,
}

function createTestEvents(overrides?: Partial<QualityEvent>[]): QualityEvent[] {
  const now = new Date()
  const base: QualityEvent[] = [
    {
      id: 'evt_001',
      customer_id: 'C001',
      title: '客户 C001 - 高额退款(3条证据)',
      types: ['high_refund', 'repeat_complaint'],
      status: 'pending',
      review_note: '',
      reviewed_at: null,
      closed_at: null,
      first_seen_at: new Date(now.getTime() - 86400000 * 3),
      last_seen_at: new Date(now.getTime() - 86400000),
      evidence_count: 3,
      total_refund: 2599,
    },
    {
      id: 'evt_002',
      customer_id: 'C002',
      title: '客户 C002 - 超时工单(2条证据)',
      types: ['timeout'],
      status: 'pending',
      review_note: '',
      reviewed_at: null,
      closed_at: null,
      first_seen_at: new Date(now.getTime() - 86400000 * 2),
      last_seen_at: new Date(now.getTime() - 86400000),
      evidence_count: 2,
      total_refund: 0,
    },
    {
      id: 'evt_003',
      customer_id: 'C003',
      title: '客户 C003 - 低分投诉(3条证据)',
      types: ['low_score'],
      status: 'reviewing',
      review_note: '正在核实',
      reviewed_at: new Date(now.getTime() - 3600000),
      closed_at: null,
      first_seen_at: new Date(now.getTime() - 86400000 * 5),
      last_seen_at: new Date(now.getTime() - 86400000 * 2),
      evidence_count: 3,
      total_refund: 0,
    },
    {
      id: 'evt_004',
      customer_id: 'C004',
      title: '客户 C004 - 重复投诉(4条证据)',
      types: ['repeat_complaint'],
      status: 'closed',
      review_note: '已处理',
      reviewed_at: new Date(now.getTime() - 86400000),
      closed_at: new Date(now.getTime() - 43200000),
      first_seen_at: new Date(now.getTime() - 86400000 * 4),
      last_seen_at: new Date(now.getTime() - 86400000),
      evidence_count: 4,
      total_refund: 0,
    },
    {
      id: 'evt_005',
      customer_id: 'C005',
      title: '客户 C005 - 高额退款(2条证据)',
      types: ['high_refund'],
      status: 'reviewing',
      review_note: '',
      reviewed_at: new Date(now.getTime() - 7200000),
      closed_at: null,
      first_seen_at: new Date(now.getTime() - 86400000 * 7),
      last_seen_at: new Date(now.getTime() - 86400000 * 3),
      evidence_count: 2,
      total_refund: 1299,
    },
  ]

  if (overrides) {
    return base.map((e, i) => (overrides[i] ? { ...e, ...overrides[i] } : e))
  }
  return base
}

function createTestImportRecords(): ImportRecord[] {
  return [
    {
      id: 'rec_001',
      file_name: 'tickets.csv',
      file_type: 'ticket',
      total_count: 50,
      valid_count: 48,
      invalid_count: 2,
      file_hash: 'abc123',
      imported_at: new Date(),
      errors: [],
      raw_content: '',
    },
    {
      id: 'rec_002',
      file_name: 'scores.csv',
      file_type: 'score',
      total_count: 30,
      valid_count: 30,
      invalid_count: 0,
      file_hash: 'def456',
      imported_at: new Date(),
      errors: [],
      raw_content: '',
    },
  ]
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

function parseDate(str: string): Date | null {
  if (ISO_DATE_REGEX.test(str)) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function reviveDates(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) return obj
  if (typeof obj === 'string') {
    const d = parseDate(obj)
    return d || obj
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

// ---------- 测试用例 ----------
console.log('\n=== 分析快照对比功能回归测试 ===\n')

async function runTests() {
  let passed = 0
  let failed = 0

  // ---- Test 1: 快照创建 - 基本信息正确 ----
  console.log('Test 1: 快照创建 - 基本信息和统计数据正确')
  try {
    const events = createTestEvents()
    const importRecords = createTestImportRecords()
    const snapshot = createSnapshot('测试快照', '测试描述', events, DEFAULT_RULES, importRecords)

    assert.ok(snapshot.id, '快照应有 ID')
    assert.equal(snapshot.name, '测试快照', '快照名称应正确')
    assert.equal(snapshot.description, '测试描述', '快照描述应正确')
    assert.ok(snapshot.created_at instanceof Date, '创建时间应为 Date')

    assert.equal(snapshot.event_count, 5, '事件总数应为 5')
    assert.equal(snapshot.batch_summary.file_count, 2, '文件数应为 2')
    assert.equal(snapshot.batch_summary.total_count, 80, '数据总数应为 80')
    assert.equal(snapshot.batch_summary.valid_count, 78, '有效数据应为 78')

    assert.equal(snapshot.by_type.timeout, 1, '超时事件应为 1')
    assert.equal(snapshot.by_type.low_score, 1, '低分事件应为 1')
    assert.equal(snapshot.by_type.repeat_complaint, 2, '重复投诉事件应为 2')
    assert.equal(snapshot.by_type.high_refund, 2, '高额退款事件应为 2')

    assert.equal(snapshot.by_status.pending, 2, '待复核应为 2')
    assert.equal(snapshot.by_status.reviewing, 2, '复核中应为 2')
    assert.equal(snapshot.by_status.closed, 1, '已关闭应为 1')

    assert.deepEqual(snapshot.rules, DEFAULT_RULES, '规则配置应完整保存')
    assert.equal(snapshot.events.length, 5, '事件摘要数量应正确')

    const firstEvent = snapshot.events[0]
    assert.ok(firstEvent.id, '事件摘要应有 ID')
    assert.ok(firstEvent.customer_id, '事件摘要应有客户 ID')
    assert.ok(firstEvent.title, '事件摘要应有标题')
    assert.ok(Array.isArray(firstEvent.types), '事件摘要应有类型数组')
    assert.ok(firstEvent.status, '事件摘要应有状态')
    assert.equal(typeof firstEvent.evidence_count, 'number', '事件摘要应有证据数')
    assert.equal(typeof firstEvent.total_refund, 'number', '事件摘要应有退款总额')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 2: 快照对比 - 新增和消失事件 ----
  console.log('Test 2: 快照对比 - 正确识别新增和消失的事件')
  try {
    const events1 = createTestEvents()
    const events2 = createTestEvents()

    const newEvent: QualityEvent = {
      id: 'evt_006',
      customer_id: 'C006',
      title: '客户 C006 - 超时工单(1条证据)',
      types: ['timeout'],
      status: 'pending',
      review_note: '',
      reviewed_at: null,
      closed_at: null,
      first_seen_at: new Date(),
      last_seen_at: new Date(),
      evidence_count: 1,
      total_refund: 0,
    }
    events2.push(newEvent)

    const events2Removed = events2.filter((e) => e.id !== 'evt_005')

    const snap1 = createSnapshot('旧快照', undefined, events1, DEFAULT_RULES, [])
    const snap2 = createSnapshot('新快照', undefined, events2Removed, DEFAULT_RULES, [])

    const diff = computeSnapshotDiff(snap1, snap2)

    assert.equal(diff.old_snapshot_id, snap1.id, '旧快照 ID 应正确')
    assert.equal(diff.new_snapshot_id, snap2.id, '新快照 ID 应正确')
    assert.equal(diff.total_added, 1, '应新增 1 个事件')
    assert.equal(diff.total_removed, 1, '应消失 1 个事件')

    const added = diff.event_diffs.filter((d) => d.change_type === 'added')
    assert.equal(added.length, 1, '应有 1 条新增记录')
    assert.equal(added[0].id, 'evt_006', '新增事件 ID 应正确')
    assert.equal(added[0].new_status, 'pending', '新增事件状态应正确')

    const removed = diff.event_diffs.filter((d) => d.change_type === 'removed')
    assert.equal(removed.length, 1, '应有 1 条消失记录')
    assert.equal(removed[0].id, 'evt_005', '消失事件 ID 应正确')
    assert.equal(removed[0].old_status, 'reviewing', '消失事件原状态应正确')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 3: 快照对比 - 状态变化 ----
  console.log('Test 3: 快照对比 - 正确识别状态变化的事件')
  try {
    const events1 = createTestEvents()
    const events2 = createTestEvents()

    events2[0].status = 'closed'
    events2[1].status = 'reviewing'

    const snap1 = createSnapshot('旧快照', undefined, events1, DEFAULT_RULES, [])
    const snap2 = createSnapshot('新快照', undefined, events2, DEFAULT_RULES, [])

    const diff = computeSnapshotDiff(snap1, snap2)

    assert.equal(diff.total_status_changed, 2, '应有 2 个状态变化事件')
    assert.equal(diff.total_added, 0, '不应有新增事件')
    assert.equal(diff.total_removed, 0, '不应有消失事件')

    const statusChanged = diff.event_diffs.filter((d) => d.change_type === 'status_changed')
    assert.equal(statusChanged.length, 2, '应有 2 条状态变化记录')

    const evt001Diff = diff.event_diffs.find((d) => d.id === 'evt_001')
    assert.ok(evt001Diff, 'evt_001 应在差异列表中')
    assert.equal(evt001Diff!.old_status, 'pending', '原状态应为 pending')
    assert.equal(evt001Diff!.new_status, 'closed', '新状态应为 closed')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 4: 快照对比 - 类型变化 ----
  console.log('Test 4: 快照对比 - 正确识别类型变化的事件')
  try {
    const events1 = createTestEvents()
    const events2 = createTestEvents()

    events2[0].types = ['high_refund']
    events2[1].types = ['timeout', 'low_score']

    const snap1 = createSnapshot('旧快照', undefined, events1, DEFAULT_RULES, [])
    const snap2 = createSnapshot('新快照', undefined, events2, DEFAULT_RULES, [])

    const diff = computeSnapshotDiff(snap1, snap2)

    assert.equal(diff.total_type_changed, 2, '应有 2 个类型变化事件')

    const evt001Diff = diff.event_diffs.find((d) => d.id === 'evt_001')
    assert.ok(evt001Diff, 'evt_001 应在差异列表中')
    assert.deepEqual(evt001Diff!.old_types, ['high_refund', 'repeat_complaint'], '原类型应正确')
    assert.deepEqual(evt001Diff!.new_types, ['high_refund'], '新类型应正确')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5: 规则变化差异 ----
  console.log('Test 5: 快照对比 - 规则配置变化识别和影响说明')
  try {
    const events = createTestEvents()
    const rules1 = { ...DEFAULT_RULES }
    const rules2 = { ...DEFAULT_RULES, timeout_hours: 48, min_score: 2, high_refund_amount: 1000 }

    const snap1 = createSnapshot('旧快照', undefined, events, rules1, [])
    const snap2 = createSnapshot('新快照', undefined, events, rules2, [])

    const diff = computeSnapshotDiff(snap1, snap2)

    assert.equal(diff.rule_diffs.length, 3, '应有 3 项规则变化')

    const timeoutDiff = diff.rule_diffs.find((r) => r.field === 'timeout_hours')
    assert.ok(timeoutDiff, '应有 timeout_hours 变化')
    assert.equal(timeoutDiff!.old_value, 24, '旧值应为 24')
    assert.equal(timeoutDiff!.new_value, 48, '新值应为 48')
    assert.equal(timeoutDiff!.change_direction, 'increased', '变化方向应为 increased')
    assert.ok(timeoutDiff!.impact_note.length > 0, '应有影响说明')
    assert.ok(timeoutDiff!.impact_note.includes('减少'), '阈值提高应导致事件减少')

    const minScoreDiff = diff.rule_diffs.find((r) => r.field === 'min_score')
    assert.ok(minScoreDiff, '应有 min_score 变化')
    assert.equal(minScoreDiff!.change_direction, 'decreased', 'min_score 变化方向应为 decreased')
    assert.ok(minScoreDiff!.impact_note.includes('减少'), 'min_score 降低应导致低分事件减少')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 6: 类型统计差异 ----
  console.log('Test 6: 快照对比 - 类型和状态统计差异正确')
  try {
    const events1 = createTestEvents()
    const events2 = createTestEvents()

    events2[0].status = 'closed'
    events2.push({
      id: 'evt_new',
      customer_id: 'C999',
      title: '新事件',
      types: ['timeout'],
      status: 'pending',
      review_note: '',
      reviewed_at: null,
      closed_at: null,
      first_seen_at: new Date(),
      last_seen_at: new Date(),
      evidence_count: 1,
      total_refund: 0,
    })

    const snap1 = createSnapshot('旧快照', undefined, events1, DEFAULT_RULES, [])
    const snap2 = createSnapshot('新快照', undefined, events2, DEFAULT_RULES, [])

    const diff = computeSnapshotDiff(snap1, snap2)

    assert.equal(diff.type_stats_diff.timeout, 1, '超时类型差异应为 +1（新增 evt_new）')
    assert.equal(diff.type_stats_diff.repeat_complaint, 0, '重复投诉类型差异应为 0（evt_001 状态变了但类型没变）')

    assert.equal(diff.status_stats_diff.pending, 0, '待复核状态差异：+1新增 -1转出 = 0')
    assert.equal(diff.status_stats_diff.closed, 1, '已关闭状态差异应为 +1（evt_001 转入）')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 7: 重名处理 - 自动生成唯一名称 ----
  console.log('Test 7: 重名处理 - 自动生成唯一快照名称')
  try {
    const names1 = ['分析快照']
    assert.equal(generateUniqueSnapshotName(names1), '分析快照 2', '重名时应生成 "分析快照 2"')

    const names2 = ['分析快照', '分析快照 2', '分析快照 3']
    assert.equal(generateUniqueSnapshotName(names2), '分析快照 4', '应生成正确的序号')

    const names3 = ['自定义名称']
    assert.equal(generateUniqueSnapshotName(names3, '自定义名称'), '自定义名称 2', '支持自定义基础名称')

    const names4 = []
    assert.equal(generateUniqueSnapshotName(names4, '新快照'), '新快照', '无重名时直接返回原名')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 8: 空快照检测 ----
  console.log('Test 8: 空快照检测 - 无数据时正确识别')
  try {
    const emptySnapshot = createSnapshot('空快照', undefined, [], DEFAULT_RULES, [])
    assert.ok(isSnapshotEmpty(emptySnapshot), '无事件无数据应为空快照')

    const withEventsSnapshot = createSnapshot('有事件', undefined, createTestEvents(), DEFAULT_RULES, [])
    assert.ok(!isSnapshotEmpty(withEventsSnapshot), '有事件时不应为空')

    const withDataSnapshot = createSnapshot('有数据', undefined, [], DEFAULT_RULES, createTestImportRecords())
    assert.ok(!isSnapshotEmpty(withDataSnapshot), '有导入记录时不应为空')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 9: 重复快照检测 ----
  console.log('Test 9: 重复快照检测 - 相同内容正确识别')
  try {
    const events = createTestEvents()
    const records = createTestImportRecords()

    const snap1 = createSnapshot('快照1', undefined, events, DEFAULT_RULES, records)
    const snap2 = createSnapshot('快照2', undefined, events, DEFAULT_RULES, records)

    assert.ok(snapshotsAreEqual(snap1, snap2), '相同内容的快照应被判定为相等')

    const events2 = createTestEvents()
    events2[0].status = 'closed'
    const snap3 = createSnapshot('快照3', undefined, events2, DEFAULT_RULES, records)
    assert.ok(!snapshotsAreEqual(snap1, snap3), '状态不同的快照不应相等')

    const rules2 = { ...DEFAULT_RULES, timeout_hours: 48 }
    const snap4 = createSnapshot('快照4', undefined, events, rules2, records)
    assert.ok(!snapshotsAreEqual(snap1, snap4), '规则不同的快照不应相等')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 10: 持久化验证 - JSON 序列化反序列化 ----
  console.log('Test 10: 持久化验证 - JSON 序列化后数据完整')
  try {
    const events = createTestEvents()
    const records = createTestImportRecords()
    const snapshot = createSnapshot('持久化测试', '测试描述', events, DEFAULT_RULES, records)

    const serialized = JSON.stringify({
      ...snapshot,
      created_at: snapshot.created_at.toISOString(),
      events: snapshot.events.map((e) => ({
        ...e,
      })),
    })

    const restored = reviveDates(JSON.parse(serialized)) as AnalysisSnapshot

    assert.equal(restored.name, '持久化测试', '名称应一致')
    assert.equal(restored.event_count, snapshot.event_count, '事件数应一致')
    assert.equal(restored.events.length, snapshot.events.length, '事件列表长度应一致')
    assert.ok(restored.created_at instanceof Date, 'created_at 应恢复为 Date')
    assert.deepEqual(restored.by_type, snapshot.by_type, '类型统计应一致')
    assert.deepEqual(restored.by_status, snapshot.by_status, '状态统计应一致')
    assert.deepEqual(restored.rules, snapshot.rules, '规则应一致')
    assert.equal(restored.batch_summary.file_count, snapshot.batch_summary.file_count, '文件数应一致')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 11: 备份恢复 - 全量备份包含快照 ----
  console.log('Test 11: 备份恢复 - 全量备份包含快照数据')
  try {
    const events = createTestEvents()
    const records = createTestImportRecords()
    const snap1 = createSnapshot('快照1', '描述1', events, DEFAULT_RULES, records)
    const snap2 = createSnapshot('快照2', '描述2', events, { ...DEFAULT_RULES, min_score: 2 }, records)
    const snapshots = [snap1, snap2]

    const fullState = {
      tickets: [],
      scores: [],
      refunds: [],
      events: events.map((e) => ({
        ...e,
        first_seen_at: e.first_seen_at.toISOString(),
        last_seen_at: e.last_seen_at.toISOString(),
        reviewed_at: e.reviewed_at?.toISOString() || null,
        closed_at: e.closed_at?.toISOString() || null,
      })),
      evidences: [],
      importRecords: records.map((r) => ({ ...r, imported_at: r.imported_at.toISOString() })),
      rules: DEFAULT_RULES,
      snapshots: snapshots.map((s) => ({
        ...s,
        created_at: s.created_at.toISOString(),
      })),
      lastDeletedSnapshot: null,
    }

    const backup = JSON.stringify({
      version: 1,
      backup_at: new Date().toISOString(),
      state: fullState,
    })

    const parsed = JSON.parse(backup)
    const restoredState = reviveDates(parsed.state)

    assert.ok(restoredState.snapshots, '恢复后应有快照数组')
    assert.equal(restoredState.snapshots.length, 2, '快照数量应为 2')
    assert.equal(restoredState.snapshots[0].name, '快照1', '第一个快照名称应正确')
    assert.equal(restoredState.snapshots[1].name, '快照2', '第二个快照名称应正确')
    assert.ok(restoredState.snapshots[0].created_at instanceof Date, '快照时间应恢复为 Date')
    assert.equal(restoredState.snapshots[0].event_count, 5, '快照事件数应正确')
    assert.deepEqual(restoredState.snapshots[0].rules, DEFAULT_RULES, '快照规则应正确')
    assert.equal(restoredState.snapshots[1].rules.min_score, 2, '第二个快照规则应不同')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 12: 删除撤销 - 模拟删除后撤销 ----
  console.log('Test 12: 删除撤销 - 逻辑验证删除后可恢复')
  try {
    const events = createTestEvents()
    const snap1 = createSnapshot('快照1', undefined, events, DEFAULT_RULES, [])
    const snap2 = createSnapshot('快照2', undefined, events, DEFAULT_RULES, [])
    let snapshots = [snap1, snap2]
    let lastDeletedSnapshot: { snapshot: AnalysisSnapshot; deleted_at: Date } | null = null

    const deleteFn = (id: string) => {
      const snap = snapshots.find((s) => s.id === id)
      if (!snap) return false
      lastDeletedSnapshot = { snapshot: snap, deleted_at: new Date() }
      snapshots = snapshots.filter((s) => s.id !== id)
      return true
    }

    const undoFn = () => {
      if (!lastDeletedSnapshot) return false
      snapshots = [lastDeletedSnapshot.snapshot, ...snapshots].sort(
        (a, b) => b.created_at.getTime() - a.created_at.getTime()
      )
      lastDeletedSnapshot = null
      return true
    }

    assert.equal(snapshots.length, 2, '初始应有 2 个快照')

    const deleted = deleteFn(snap1.id)
    assert.ok(deleted, '删除应成功')
    assert.equal(snapshots.length, 1, '删除后应有 1 个快照')
    assert.ok(lastDeletedSnapshot, '应有最近删除记录')
    assert.equal(lastDeletedSnapshot.snapshot.id, snap1.id, '删除的快照 ID 应正确')

    const undone = undoFn()
    assert.ok(undone, '撤销应成功')
    assert.equal(snapshots.length, 2, '撤销后应有 2 个快照')
    assert.equal(lastDeletedSnapshot, null, '撤销后删除记录应清空')
    assert.ok(snapshots.find((s) => s.id === snap1.id), '撤销后原快照应存在')

    const secondUndo = undoFn()
    assert.ok(!secondUndo, '再次撤销应失败')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 13: 边界 - 大量快照性能 ----
  console.log('Test 13: 边界测试 - 大量快照排序和查找')
  try {
    const events = createTestEvents()
    const snapshots: AnalysisSnapshot[] = []

    for (let i = 0; i < 50; i++) {
      const snap = createSnapshot(`快照 ${i}`, undefined, events, DEFAULT_RULES, [])
      snapshots.push(snap)
    }

    const sorted = [...snapshots].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    assert.equal(sorted.length, 50, '排序后数量应一致')
    assert.ok(
      sorted[0].created_at.getTime() >= sorted[49].created_at.getTime(),
      '应按创建时间降序排列'
    )

    const found = sorted.find((s) => s.name === '快照 25')
    assert.ok(found, '应能找到指定名称的快照')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 14: 未变化事件识别 ----
  console.log('Test 14: 快照对比 - 未变化事件正确标记为 unchanged')
  try {
    const events1 = createTestEvents()
    const events2 = createTestEvents()

    const snap1 = createSnapshot('旧快照', undefined, events1, DEFAULT_RULES, [])
    const snap2 = createSnapshot('新快照', undefined, events2, DEFAULT_RULES, [])

    const diff = computeSnapshotDiff(snap1, snap2)

    assert.equal(diff.total_unchanged, 5, '所有事件应均为未变化')
    assert.equal(diff.total_added, 0, '不应有新增')
    assert.equal(diff.total_removed, 0, '不应有消失')
    assert.equal(diff.total_status_changed, 0, '不应有状态变化')
    assert.equal(diff.total_type_changed, 0, '不应有类型变化')
    assert.equal(diff.rule_diffs.length, 0, '不应有规则变化')

    const unchangedEvt = diff.event_diffs.find((d) => d.id === 'evt_001')
    assert.ok(unchangedEvt, 'evt_001 应在差异列表中')
    assert.equal(unchangedEvt!.change_type, 'unchanged', '变化类型应为 unchanged')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 15: 重命名验证 ----
  console.log('Test 15: 重命名 - 空名称和重名检测')
  try {
    const events = createTestEvents()
    let snapshots = [
      createSnapshot('快照A', undefined, events, DEFAULT_RULES, []),
      createSnapshot('快照B', undefined, events, DEFAULT_RULES, []),
    ]

    const renameFn = (id: string, newName: string): { success: boolean; error?: string } => {
      const trimmed = newName.trim()
      if (!trimmed) return { success: false, error: '名称不能为空' }

      const existing = snapshots.find((s) => s.id !== id && s.name === trimmed)
      if (existing) return { success: false, error: '名称已存在' }

      snapshots = snapshots.map((s) => (s.id === id ? { ...s, name: trimmed } : s))
      return { success: true }
    }

    const r1 = renameFn(snapshots[0].id, '   ')
    assert.ok(!r1.success, '空名称应失败')
    assert.equal(r1.error, '名称不能为空', '错误信息应正确')

    const r2 = renameFn(snapshots[0].id, '快照B')
    assert.ok(!r2.success, '重名应失败')
    assert.equal(r2.error, '名称已存在', '错误信息应正确')

    const r3 = renameFn(snapshots[0].id, '新名称A')
    assert.ok(r3.success, '有效名称应成功')
    assert.equal(snapshots[0].name, '新名称A', '名称应已更新')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 16: 描述和空描述 ----
  console.log('Test 16: 快照描述 - 有描述和无描述均正常')
  try {
    const events = createTestEvents()

    const withDesc = createSnapshot('有名', '这是描述内容', events, DEFAULT_RULES, [])
    assert.equal(withDesc.description, '这是描述内容', '描述应正确保存')

    const withoutDesc = createSnapshot('无名', undefined, events, DEFAULT_RULES, [])
    assert.equal(withoutDesc.description, undefined, '无描述时应为 undefined')

    const emptyDesc = createSnapshot('空描述', '   ', events, DEFAULT_RULES, [])
    assert.equal(emptyDesc.description, undefined, '空白描述应被视为无描述')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 17: 事件摘要完整性 ----
  console.log('Test 17: 事件摘要 - 所有必要字段完整保存')
  try {
    const events = createTestEvents()
    const snapshot = createSnapshot('测试', undefined, events, DEFAULT_RULES, [])

    for (let i = 0; i < events.length; i++) {
      const original = events[i]
      const brief = snapshot.events.find((e) => e.id === original.id)
      assert.ok(brief, `事件 ${original.id} 应在摘要中`)
      assert.equal(brief!.customer_id, original.customer_id, '客户 ID 应一致')
      assert.equal(brief!.title, original.title, '标题应一致')
      assert.deepEqual(brief!.types, original.types, '类型应一致')
      assert.equal(brief!.status, original.status, '状态应一致')
      assert.equal(brief!.evidence_count, original.evidence_count, '证据数应一致')
      assert.equal(brief!.total_refund, original.total_refund, '退款总额应一致')
    }

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
