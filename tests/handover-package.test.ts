/**
 * 责任交接包回归测试
 *
 * 覆盖场景：
 * 1. 持久化验证 - 交接包写入 localStorage，刷新/重启后不丢失
 * 2. 导入冲突处理 - ID 冲突、标题冲突、事件不存在、状态冲突的处理
 * 3. 事件快照不丢 - 创建后原事件修改/删除，快照保持不变
 * 4. 撤销日志 - 撤销完成时记录原因和操作人
 * 5. 导出字段一致性 - 导出和导入的字段完整一致
 * 6. 操作日志 - 创建、追加记录、完成、撤销、导入、删除的审计记录
 * 7. 状态流转 - 待接手→处理中→已完成→撤销→处理中
 * 8. 事件筛选 - 按状态、类型、客户、退款金额区间筛选事件
 *
 * 运行方式：npx tsx tests/handover-package.test.ts
 */

import assert from 'node:assert/strict'
import {
  createHandoverEventSnapshot,
  createHandoverPackage,
  addCommunicationRecord,
  markAsCompleted,
  undoComplete,
  updateHandoverStatus,
  exportHandoverPackageToJSON,
  exportHandoverPackagesToJSON,
  importHandoverPackages,
  filterHandoverEvents,
  filterHandoverPackages,
  validateHandoverPackageImport,
  createHandoverAuditLog,
  parseHandoverPackagesJSON,
} from '../src/services/handoverPackageService'
import { reviveDates, uid } from '../src/utils'
import type {
  QualityEvent,
  HandoverPackage,
  HandoverEventFilter,
  EventStatus,
  QualityEventType,
  HandoverPriority,
} from '../src/types'

// ---------- Mock 浏览器 API ----------
class MockLocalStorage {
  private store: Record<string, string> = {}
  getItem(key: string): string | null {
    return this.store[key] || null
  }
  setItem(key: string, value: string): void {
    this.store[key] = value
  }
  removeItem(key: string): void {
    delete this.store[key]
  }
  clear(): void {
    this.store = {}
  }
}

// @ts-ignore
globalThis.localStorage = new MockLocalStorage()

// ---------- 测试数据 ----------
function createTestEvents(): QualityEvent[] {
  const now = new Date()
  return [
    {
      id: 'evt_001',
      customer_id: 'C001',
      title: '客户 C001 多次投诉且退款金额高',
      types: ['high_refund', 'repeat_complaint'],
      status: 'pending',
      review_note: '需要重点关注',
      reviewed_at: null,
      closed_at: null,
      first_seen_at: new Date(now.getTime() - 86400000 * 3),
      last_seen_at: new Date(now.getTime() - 86400000),
      evidence_count: 5,
      total_refund: 2599,
    },
    {
      id: 'evt_002',
      customer_id: 'C002',
      title: '客户 C002 工单响应超时',
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
      title: '客户 C003 评分极低',
      types: ['low_score'],
      status: 'reviewing',
      review_note: '正在核实情况',
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
      title: '客户 C004 高额退款',
      types: ['high_refund'],
      status: 'closed',
      review_note: '已处理',
      reviewed_at: new Date(now.getTime() - 7200000),
      closed_at: new Date(now.getTime() - 3600000),
      first_seen_at: new Date(now.getTime() - 86400000 * 7),
      last_seen_at: new Date(now.getTime() - 86400000 * 3),
      evidence_count: 4,
      total_refund: 5000,
    },
    {
      id: 'evt_005',
      customer_id: 'C005',
      title: '客户 C005 重复投诉',
      types: ['repeat_complaint'],
      status: 'pending',
      review_note: '',
      reviewed_at: null,
      closed_at: null,
      first_seen_at: new Date(now.getTime() - 86400000 * 4),
      last_seen_at: new Date(now.getTime() - 86400000),
      evidence_count: 6,
      total_refund: 800,
    },
  ]
}

// ---------- 测试用例 ----------
console.log('\n=== 责任交接包回归测试 ===\n')

async function runTests() {
  let passed = 0
  let failed = 0

  // ---- Test 1: 事件快照创建 - 完整复制所有关键字段 ----
  console.log('Test 1: 事件快照 - 创建时完整复制所有关键字段')
  try {
    const events = createTestEvents()
    const event = events[0]
    const snapshot = createHandoverEventSnapshot(event)

    assert.equal(snapshot.id, event.id, '快照应保留事件 ID')
    assert.equal(snapshot.customer_id, event.customer_id, '快照应保留客户 ID')
    assert.equal(snapshot.title, event.title, '快照应保留标题')
    assert.deepEqual(snapshot.types, event.types, '快照应保留事件类型数组')
    assert.equal(snapshot.status, event.status, '快照应保留状态')
    assert.equal(snapshot.review_note, event.review_note, '快照应保留复核备注')
    assert.equal(snapshot.reviewed_at, event.reviewed_at, '快照应保留复核时间')
    assert.equal(snapshot.closed_at, event.closed_at, '快照应保留关闭时间')
    assert.equal(snapshot.first_seen_at.getTime(), event.first_seen_at.getTime(), '快照应保留首次出现时间')
    assert.equal(snapshot.last_seen_at.getTime(), event.last_seen_at.getTime(), '快照应保留最后出现时间')
    assert.equal(snapshot.evidence_count, event.evidence_count, '快照应保留证据数量')
    assert.equal(snapshot.total_refund, event.total_refund, '快照应保留退款总额')
    assert.ok(snapshot.snapshotted_at, '快照应记录快照时间')
    assert.ok(snapshot.snapshotted_at instanceof Date, '快照时间应为 Date 对象')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 2: 事件快照不丢 - 原事件修改后快照保持不变 ----
  console.log('Test 2: 事件快照不丢 - 原事件修改后快照保持不变')
  try {
    const events = createTestEvents()
    const originalEvent = { ...events[0] }
    const snapshot = createHandoverEventSnapshot(events[0])

    events[0].status = 'closed'
    events[0].review_note = '已处理完成'
    events[0].total_refund = 3000
    events[0].closed_at = new Date()

    assert.equal(snapshot.status, originalEvent.status, '快照状态不应随原事件变化')
    assert.equal(snapshot.review_note, originalEvent.review_note, '快照备注不应随原事件变化')
    assert.equal(snapshot.total_refund, originalEvent.total_refund, '快照退款额不应随原事件变化')
    assert.equal(snapshot.closed_at, originalEvent.closed_at, '快照关闭时间不应随原事件变化')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 3: 事件快照不丢 - 原事件删除后快照保持不变 ----
  console.log('Test 3: 事件快照不丢 - 原事件删除后快照保持不变')
  try {
    const events = createTestEvents()
    const snapshot = createHandoverEventSnapshot(events[0])

    const eventsAfterDelete = events.filter((e) => e.id !== 'evt_001')
    assert.equal(eventsAfterDelete.length, 4, '原事件应被删除')

    assert.ok(snapshot, '快照应仍然存在')
    assert.equal(snapshot.id, 'evt_001', '快照 ID 应保持不变')
    assert.equal(snapshot.title, '客户 C001 多次投诉且退款金额高', '快照标题应保持不变')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 4: 交接包创建 - 完整包含所有字段 ----
  console.log('Test 4: 交接包创建 - 完整包含所有必填字段')
  try {
    const events = createTestEvents()
    const deadline = new Date(Date.now() + 86400000 * 7)

    const pkg = createHandoverPackage(
      '2024年Q1质量波动交接',
      '李四',
      deadline,
      'high',
      '请优先处理高优先级事件，及时与客户沟通',
      events
    )

    assert.ok(pkg.id, '应有 ID')
    assert.ok(pkg.id.startsWith('hpkg'), 'ID 应有 hpkg 前缀')
    assert.equal(pkg.title, '2024年Q1质量波动交接', '标题应正确')
    assert.equal(pkg.assignee, '李四', '接手人应正确')
    assert.equal(pkg.priority, 'high', '优先级应正确')
    assert.equal(pkg.description, '请优先处理高优先级事件，及时与客户沟通', '处理说明应正确')
    assert.equal(pkg.deadline?.getTime(), deadline.getTime(), '截止日期应正确')
    assert.equal(pkg.status, 'pending', '初始状态应为待接手')
    assert.equal(pkg.event_snapshots.length, 5, '应有 5 个事件快照')
    assert.deepEqual(pkg.event_ids, ['evt_001', 'evt_002', 'evt_003', 'evt_004', 'evt_005'], '事件 ID 列表应正确')
    assert.equal(pkg.communication_records.length, 0, '初始沟通记录应为空')
    assert.equal(pkg.undo_records.length, 0, '初始撤销记录应为空')
    assert.ok(pkg.created_at, '应有创建时间')
    assert.ok(pkg.updated_at, '应有更新时间')
    assert.equal(pkg.completed_at, null, '初始完成时间应为 null')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5: 持久化验证 - 写入 localStorage 后可恢复 ----
  console.log('Test 5: 持久化验证 - 写入 localStorage 后刷新可恢复')
  try {
    const events = createTestEvents()
    const pkg = createHandoverPackage(
      '持久化测试交接包',
      '测试员',
      new Date(),
      'medium',
      '测试持久化功能',
      [events[0]]
    )

    const state = {
      handoverPackages: [pkg],
      handoverPackageAuditLogs: [] as any[],
    }

    const serialized = JSON.stringify({
      state: {
        handoverPackages: JSON.parse(exportHandoverPackagesToJSON([pkg])).packages,
        handoverPackageAuditLogs: [],
      },
    })

    localStorage.setItem('test-store', serialized)

    const restoredRaw = localStorage.getItem('test-store')
    assert.ok(restoredRaw, '应能从 localStorage 读取数据')

    const parsed = JSON.parse(restoredRaw)
    const restoredPackages = parsed.state.handoverPackages.map((p: any) => reviveDates(p))

    assert.equal(restoredPackages.length, 1, '恢复后应有 1 个交接包')
    assert.equal(restoredPackages[0].id, pkg.id, '恢复后 ID 应一致')
    assert.equal(restoredPackages[0].title, pkg.title, '恢复后标题应一致')
    assert.ok(restoredPackages[0].created_at instanceof Date, '恢复后 created_at 应为 Date 对象')
    assert.ok(restoredPackages[0].event_snapshots[0].first_seen_at instanceof Date, '恢复后快照时间应为 Date 对象')
    assert.equal(
      restoredPackages[0].event_snapshots[0].total_refund,
      pkg.event_snapshots[0].total_refund,
      '恢复后快照数据应完整'
    )

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 6: 导入冲突 - ID 冲突应跳过并提示 ----
  console.log('Test 6: 导入冲突 - ID 冲突应跳过，不静默覆盖')
  try {
    const events = createTestEvents()
    const existingPkg = createHandoverPackage(
      '现有交接包',
      '张三',
      null,
      'medium',
      '现有处理说明',
      [events[0]]
    )

    const existingPackages = [existingPkg]
    const existingEvents = events
    const exportJson = exportHandoverPackagesToJSON([existingPkg])

    const result = importHandoverPackages(exportJson, existingPackages, existingEvents)

    assert.equal(result.imported.length, 0, 'ID 冲突时不应导入')
    assert.equal(result.skipped.length, 1, '应有 1 条跳过记录')
    assert.equal(result.skipped[0].type, 'duplicate_id', '跳过原因应为 duplicate_id')
    assert.equal(result.skipped[0].package_id, existingPkg.id, '跳过的 ID 应正确')
    assert.ok(result.warnings[0].includes('ID 已存在'), '警告信息应说明 ID 冲突')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 7: 导入冲突 - 标题冲突应跳过并提示 ----
  console.log('Test 7: 导入冲突 - 标题冲突应跳过，不静默覆盖')
  try {
    const events = createTestEvents()
    const existingPkg = createHandoverPackage(
      '重复标题的交接包',
      '张三',
      null,
      'medium',
      '现有处理说明',
      [events[0]]
    )

    const newPkg = createHandoverPackage(
      '重复标题的交接包',
      '李四',
      null,
      'high',
      '新的处理说明',
      [events[1]]
    )

    const existingPackages = [existingPkg]
    const exportJson = exportHandoverPackagesToJSON([newPkg])

    const result = importHandoverPackages(exportJson, existingPackages, events)

    assert.equal(result.imported.length, 0, '标题冲突时不应导入')
    assert.equal(result.skipped.length, 1, '应有 1 条跳过记录')
    assert.equal(result.skipped[0].type, 'duplicate_title', '跳过原因应为 duplicate_title')
    assert.equal(result.skipped[0].package_title, '重复标题的交接包', '跳过的标题应正确')
    assert.ok(result.warnings[0].includes('标题已存在'), '警告信息应说明标题冲突')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 8: 导入冲突 - 事件不存在应跳过并提示 ----
  console.log('Test 8: 导入冲突 - 事件不存在应跳过并提示')
  try {
    const events = createTestEvents()
    const pkg = createHandoverPackage(
      '包含已删除事件的交接包',
      '张三',
      null,
      'medium',
      '测试',
      [events[0]]
    )

    // 模拟原事件已被删除
    const existingEvents = events.filter((e) => e.id !== 'evt_001')
    const existingPackages: HandoverPackage[] = []
    const exportJson = exportHandoverPackagesToJSON([pkg])

    const result = importHandoverPackages(exportJson, existingPackages, existingEvents)

    assert.equal(result.imported.length, 0, '事件不存在时不应导入')
    assert.equal(result.skipped.length, 1, '应有 1 条跳过记录')
    assert.equal(result.skipped[0].type, 'event_not_found', '跳过原因应为 event_not_found')
    assert.equal(result.skipped[0].event_id, 'evt_001', '跳过的事件 ID 应正确')
    assert.ok(result.warnings[0].includes('已不存在'), '警告信息应说明事件不存在')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 9: 导入冲突 - 事件状态冲突应跳过并提示 ----
  console.log('Test 9: 导入冲突 - 事件状态冲突应跳过并提示')
  try {
    const events = createTestEvents()
    const pkg = createHandoverPackage(
      '包含状态变化事件的交接包',
      '张三',
      null,
      'medium',
      '测试',
      [events[0]]
    )

    // 修改原事件状态
    const modifiedEvents = events.map((e) =>
      e.id === 'evt_001' ? { ...e, status: 'closed' as const } : e
    )
    const existingPackages: HandoverPackage[] = []
    const exportJson = exportHandoverPackagesToJSON([pkg])

    const result = importHandoverPackages(exportJson, existingPackages, modifiedEvents)

    assert.equal(result.imported.length, 0, '状态冲突时不应导入')
    assert.equal(result.skipped.length, 1, '应有 1 条跳过记录')
    assert.equal(result.skipped[0].type, 'event_status_conflict', '跳过原因应为 event_status_conflict')
    assert.equal(result.skipped[0].expected_status, 'pending', '期望状态应为 pending')
    assert.equal(result.skipped[0].actual_status, 'closed', '实际状态应为 closed')
    assert.ok(result.warnings[0].includes('状态不匹配'), '警告信息应说明状态冲突')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 10: 导入冲突 - 按快照导入模式 ----
  console.log('Test 10: 导入冲突 - 按快照导入模式忽略冲突')
  try {
    const events = createTestEvents()
    const existingPkg = createHandoverPackage(
      '现有交接包',
      '张三',
      null,
      'medium',
      '现有说明',
      [events[0]]
    )

    const existingPackages = [existingPkg]
    const exportJson = exportHandoverPackagesToJSON([existingPkg])

    // 使用按快照导入的冲突处理策略
    const conflictKey = `${existingPkg.id}_duplicate_id`
    const result = importHandoverPackages(exportJson, existingPackages, events, {
      [conflictKey]: 'import_as_snapshot',
    })

    assert.equal(result.imported.length, 1, '按快照导入应成功')
    assert.equal(result.skipped.length, 0, '不应有跳过记录')
    assert.ok(result.warnings[0].includes('按快照方式导入'), '警告信息应说明按快照导入')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 11: 导入冲突 - 重命名导入模式 ----
  console.log('Test 11: 导入冲突 - 重命名导入模式自动生成新标题')
  try {
    const events = createTestEvents()
    const existingPkg = createHandoverPackage(
      '待重命名的交接包',
      '张三',
      null,
      'medium',
      '现有说明',
      [events[0]]
    )

    const existingPackages = [existingPkg]
    const exportJson = exportHandoverPackagesToJSON([existingPkg])

    // 使用重命名的冲突处理策略
    const conflictKey = `${existingPkg.id}_duplicate_id`
    const result = importHandoverPackages(exportJson, existingPackages, events, {
      [conflictKey]: 'rename',
    })

    assert.equal(result.imported.length, 1, '重命名导入应成功')
    assert.equal(result.imported[0].title, '待重命名的交接包 (导入)', '标题应自动加上 (导入) 后缀')
    assert.ok(result.warnings[0].includes('已重命名为'), '警告信息应说明重命名')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 12: 撤销完成 - 记录原因和操作人 ----
  console.log('Test 12: 撤销完成 - 记录撤销原因和操作人')
  try {
    const events = createTestEvents()
    let pkg = createHandoverPackage('撤销测试', '张三', null, 'medium', '测试', events)

    // 先标记完成
    const completeResult = markAsCompleted(pkg)
    pkg = completeResult.package
    assert.equal(pkg.status, 'completed', '状态应为已完成')
    assert.ok(pkg.completed_at, '应有完成时间')

    // 撤销完成
    await new Promise(resolve => setTimeout(resolve, 10))
    const undoResult = undoComplete(pkg, '发现部分事件处理有误，需要重新处理')

    assert.equal(undoResult.package.status, 'processing', '撤销后状态应为处理中')
    assert.equal(undoResult.package.completed_at, null, '撤销后 completed_at 应为 null')
    assert.equal(undoResult.package.undo_records.length, 1, '应有 1 条撤销记录')
    assert.equal(undoResult.package.undo_records[0].reason, '发现部分事件处理有误，需要重新处理', '撤销原因应正确')
    assert.equal(undoResult.package.undo_records[0].operator, '当前用户', '操作人应正确')
    assert.equal(undoResult.package.undo_records[0].previous_status, 'completed', '之前状态应为 completed')
    assert.ok(undoResult.package.undo_records[0].created_at instanceof Date, '撤销时间应为 Date')

    assert.equal(undoResult.auditLog.action, 'undo_complete', '审计日志操作类型应为 undo_complete')
    assert.equal(undoResult.auditLog.undo_reason, '发现部分事件处理有误，需要重新处理', '审计日志应记录撤销原因')
    assert.equal(undoResult.auditLog.old_status, 'completed', '审计日志应记录旧状态')
    assert.equal(undoResult.auditLog.new_status, 'processing', '审计日志应记录新状态')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 13: 导出字段一致性 - 导出后再导入字段完整 ----
  console.log('Test 13: 导出字段一致性 - 导出 JSON 后再导入字段完整一致')
  try {
    const events = createTestEvents()
    const deadline = new Date(Date.now() + 86400000 * 7)

    let pkg = createHandoverPackage(
      '导出测试交接包',
      '张三',
      deadline,
      'high',
      '测试导出导入一致性',
      events
    )

    const recordResult = addCommunicationRecord(pkg, '第一条沟通记录')
    pkg = recordResult.package

    const completeResult = markAsCompleted(pkg)
    pkg = completeResult.package

    const exportJson = exportHandoverPackageToJSON(pkg)
    const parsed = JSON.parse(exportJson)

    const expectedTopLevelFields = [
      'id', 'title', 'assignee', 'deadline', 'priority', 'description',
      'status', 'event_snapshots', 'event_ids', 'communication_records',
      'undo_records', 'created_at', 'updated_at', 'completed_at'
    ]

    for (const field of expectedTopLevelFields) {
      assert.ok(field in parsed, `导出 JSON 应包含字段: ${field}`)
    }

    const expectedSnapshotFields = [
      'id', 'customer_id', 'title', 'types', 'status', 'review_note',
      'reviewed_at', 'closed_at', 'first_seen_at', 'last_seen_at',
      'evidence_count', 'total_refund', 'snapshotted_at'
    ]

    for (const field of expectedSnapshotFields) {
      assert.ok(field in parsed.event_snapshots[0], `快照应包含字段: ${field}`)
    }

    const expectedRecordFields = ['id', 'content', 'operator', 'created_at']
    for (const field of expectedRecordFields) {
      assert.ok(field in parsed.communication_records[0], `沟通记录应包含字段: ${field}`)
    }

    const imported = reviveDates(parsed) as HandoverPackage
    assert.equal(imported.id, pkg.id, '导入后 ID 应一致')
    assert.equal(imported.title, pkg.title, '导入后标题应一致')
    assert.equal(imported.status, pkg.status, '导入后状态应一致')
    assert.equal(imported.communication_records.length, pkg.communication_records.length, '导入后沟通记录数量应一致')
    assert.equal(imported.event_snapshots.length, pkg.event_snapshots.length, '导入后快照数量应一致')
    assert.ok(imported.created_at instanceof Date, '导入后 created_at 应为 Date')
    assert.ok(imported.event_snapshots[0].snapshotted_at instanceof Date, '导入后快照时间应为 Date')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 14: 操作日志 - 创建时记录审计日志 ----
  console.log('Test 14: 操作日志 - 创建交接包时记录审计日志')
  try {
    const events = createTestEvents()
    const pkg = createHandoverPackage(
      '审计日志测试',
      '张三',
      null,
      'medium',
      '测试',
      [events[0]]
    )

    const auditLog = createHandoverAuditLog('create', pkg)

    assert.ok(auditLog.id, '日志应有 ID')
    assert.equal(auditLog.action, 'create', '操作类型应为 create')
    assert.equal(auditLog.package_id, pkg.id, '应关联交接包 ID')
    assert.equal(auditLog.package_title, pkg.title, '应记录交接包标题')
    assert.equal(auditLog.operator, '当前用户', '应记录操作者')
    assert.ok(auditLog.operated_at instanceof Date, '应有操作时间')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 15: 操作日志 - 追加沟通记录时记录 ----
  console.log('Test 15: 操作日志 - 追加沟通记录时记录审计日志')
  try {
    const events = createTestEvents()
    const pkg = createHandoverPackage('测试', '张三', null, 'medium', '测试', [events[0]])

    const result = addCommunicationRecord(pkg, '测试沟通记录')

    assert.ok(result.auditLog, '应返回审计日志')
    assert.equal(result.auditLog.action, 'add_record', '操作类型应为 add_record')
    assert.equal(result.auditLog.record_content, '测试沟通记录', '应记录沟通内容')
    assert.ok(result.auditLog.note?.includes('追加沟通记录'), '应有备注说明')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 16: 状态流转 - 完整生命周期 ----
  console.log('Test 16: 状态流转 - 待接手→处理中→已完成→撤销→处理中')
  try {
    const events = createTestEvents()
    let pkg = createHandoverPackage('状态流转测试', '张三', null, 'medium', '测试', events)
    const originalCreatedAt = pkg.created_at.getTime()

    await new Promise(resolve => setTimeout(resolve, 10))

    // 待接手 → 处理中
    let result = updateHandoverStatus(pkg, 'processing')
    pkg = result.package
    assert.equal(pkg.status, 'processing', '状态应为处理中')
    assert.ok(pkg.updated_at.getTime() > originalCreatedAt, 'updated_at 应更新')

    await new Promise(resolve => setTimeout(resolve, 10))

    // 处理中 → 已完成
    result = markAsCompleted(pkg)
    pkg = result.package
    assert.equal(pkg.status, 'completed', '状态应为已完成')
    assert.ok(pkg.completed_at, '应设置 completed_at')

    await new Promise(resolve => setTimeout(resolve, 10))

    // 已完成 → 撤销 → 处理中
    const undoResult = undoComplete(pkg, '需要重新处理')
    pkg = undoResult.package
    assert.equal(pkg.status, 'processing', '撤销后应为处理中')
    assert.equal(pkg.completed_at, null, 'completed_at 应重置为 null')
    assert.equal(pkg.undo_records.length, 1, '应有撤销记录')

    // 处理中 → 已撤销
    const updateResult = updateHandoverStatus(pkg, 'cancelled')
    pkg = updateResult.package
    assert.equal(pkg.status, 'cancelled', '状态应为已撤销')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 17: 事件筛选 - 按状态筛选 ----
  console.log('Test 17: 事件筛选 - 按状态筛选事件')
  try {
    const events = createTestEvents()

    const filter: HandoverEventFilter = { statuses: ['pending'] }
    const filtered = filterHandoverEvents(events, filter)

    assert.equal(filtered.length, 3, '应筛选出 3 个待复核状态的事件')
    assert.ok(filtered.every((e) => e.status === 'pending'), '所有事件状态应为 pending')

    const filter2: HandoverEventFilter = { statuses: ['pending', 'reviewing'] }
    const filtered2 = filterHandoverEvents(events, filter2)
    assert.equal(filtered2.length, 4, '应筛选出 4 个待复核或复核中的事件')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 18: 事件筛选 - 按类型筛选 ----
  console.log('Test 18: 事件筛选 - 按事件类型筛选')
  try {
    const events = createTestEvents()

    const filter: HandoverEventFilter = { types: ['high_refund'] }
    const filtered = filterHandoverEvents(events, filter)

    assert.equal(filtered.length, 2, '应筛选出 2 个高额退款类型的事件')
    assert.ok(filtered.every((e) => e.types.includes('high_refund')), '所有事件应包含 high_refund 类型')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 19: 事件筛选 - 按客户 ID 筛选 ----
  console.log('Test 19: 事件筛选 - 按客户 ID 筛选')
  try {
    const events = createTestEvents()

    const filter: HandoverEventFilter = { customer_id: 'C001' }
    const filtered = filterHandoverEvents(events, filter)

    assert.equal(filtered.length, 1, '应筛选出 1 个客户 C001 的事件')
    assert.equal(filtered[0].customer_id, 'C001', '客户 ID 应为 C001')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 20: 事件筛选 - 按退款金额区间筛选 ----
  console.log('Test 20: 事件筛选 - 按退款金额区间筛选')
  try {
    const events = createTestEvents()

    const filter: HandoverEventFilter = { min_refund: 1000 }
    const filtered = filterHandoverEvents(events, filter)

    assert.equal(filtered.length, 2, '应筛选出 2 个退款金额 ≥ 1000 的事件')
    assert.ok(filtered.every((e) => e.total_refund >= 1000), '所有事件退款金额应 ≥ 1000')

    const filter2: HandoverEventFilter = { max_refund: 1000 }
    const filtered2 = filterHandoverEvents(events, filter2)
    assert.equal(filtered2.length, 3, '应筛选出 3 个退款金额 ≤ 1000 的事件')
    assert.ok(filtered2.every((e) => e.total_refund <= 1000), '所有事件退款金额应 ≤ 1000')

    const filter3: HandoverEventFilter = { min_refund: 500, max_refund: 3000 }
    const filtered3 = filterHandoverEvents(events, filter3)
    assert.equal(filtered3.length, 2, '应筛选出 2 个退款金额在 500-3000 之间的事件')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 21: 交接包筛选 - 按状态、优先级、接手人筛选 ----
  console.log('Test 21: 交接包筛选 - 按状态、优先级、接手人筛选')
  try {
    const events = createTestEvents()
    const pkg1 = createHandoverPackage('包1', '张三', null, 'high', '说明1', [events[0]])
    const pkg2 = createHandoverPackage('包2', '李四', null, 'medium', '说明2', [events[1]])
    const pkg3 = createHandoverPackage('包3', '张三', null, 'low', '说明3', [events[2]])

    const processedPkg2 = markAsCompleted(pkg2).package
    const packages = [pkg1, processedPkg2, pkg3]

    // 按状态筛选
    const filtered1 = filterHandoverPackages(packages, { status: 'pending' })
    assert.equal(filtered1.length, 2, '应筛选出 2 个待接手状态的包')

    // 按优先级筛选
    const filtered2 = filterHandoverPackages(packages, { priority: 'high' })
    assert.equal(filtered2.length, 1, '应筛选出 1 个高优先级的包')

    // 按接手人筛选
    const filtered3 = filterHandoverPackages(packages, { assignee: '张三' })
    assert.equal(filtered3.length, 2, '应筛选出 2 个张三负责的包')

    // 组合筛选
    const filtered4 = filterHandoverPackages(packages, { status: 'pending', assignee: '张三' })
    assert.equal(filtered4.length, 2, '组合筛选应返回正确结果')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 22: 数据完整性 - 批量导出所有字段一致 ----
  console.log('Test 22: 数据完整性 - 批量导出导入后所有字段一致')
  try {
    const events = createTestEvents()
    const pkg1 = createHandoverPackage('包1', '张三', new Date(), 'high', '建议1', [events[0]])
    const pkg2 = createHandoverPackage('包2', '李四', null, 'medium', '建议2', [events[1], events[2]])

    let pkg1Updated = addCommunicationRecord(pkg1, '包1的沟通记录').package
    pkg1Updated = markAsCompleted(pkg1Updated).package

    const exportJson = exportHandoverPackagesToJSON([pkg1Updated, pkg2])
    const parsed = JSON.parse(exportJson)

    assert.equal(parsed.version, 1, '导出版本号应为 1')
    assert.ok(parsed.exported_at, '应有导出时间')
    assert.equal(parsed.packages.length, 2, '应导出 2 个交接包')

    const restoredPkgs = parsed.packages.map((p: any) => reviveDates(p) as HandoverPackage)

    assert.equal(restoredPkgs[0].id, pkg1Updated.id)
    assert.equal(restoredPkgs[0].status, 'completed')
    assert.equal(restoredPkgs[0].communication_records.length, 1)
    assert.equal(restoredPkgs[0].event_snapshots.length, 1)

    assert.equal(restoredPkgs[1].id, pkg2.id)
    assert.equal(restoredPkgs[1].status, 'pending')
    assert.equal(restoredPkgs[1].event_snapshots.length, 2)

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 23: 错误处理 - 导入无效 JSON ----
  console.log('Test 23: 错误处理 - 导入无效 JSON 应返回错误')
  try {
    const result = importHandoverPackages('invalid json', [], [])

    assert.equal(result.success, false, '无效 JSON 时 success 应为 false')
    assert.equal(result.imported.length, 0, '不应导入任何包')
    assert.ok(result.errors[0].includes('JSON 格式无效'), '错误信息应说明格式无效')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 24: 事件快照 - types 数组是深拷贝 ----
  console.log('Test 24: 事件快照 - types 数组是深拷贝，不随原事件变化')
  try {
    const events = createTestEvents()
    const event = events[0]
    const originalTypes = [...event.types]
    const snapshot = createHandoverEventSnapshot(event)

    event.types.push('low_score')

    assert.deepEqual(snapshot.types, originalTypes, '快照 types 不应随原事件变化')
    assert.notDeepEqual(snapshot.types, event.types, '快照 types 与原事件 types 应不同')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 25: 持久化 - 多轮刷新后数据保持一致 ----
  console.log('Test 25: 持久化 - 多轮模拟刷新后数据保持一致')
  try {
    const events = createTestEvents()
    let pkg = createHandoverPackage('多轮持久化测试', '张三', null, 'high', '测试', events)

    pkg = addCommunicationRecord(pkg, '记录1').package
    pkg = updateHandoverStatus(pkg, 'processing').package
    pkg = addCommunicationRecord(pkg, '记录2').package
    pkg = markAsCompleted(pkg).package
    pkg = undoComplete(pkg, '撤销原因').package

    for (let i = 0; i < 5; i++) {
      const exportJson = exportHandoverPackageToJSON(pkg)
      const restored = reviveDates(JSON.parse(exportJson)) as HandoverPackage

      assert.equal(restored.id, pkg.id, `第 ${i + 1} 轮: ID 应一致`)
      assert.equal(restored.status, 'processing', `第 ${i + 1} 轮: 状态应一致`)
      assert.equal(restored.communication_records.length, 2, `第 ${i + 1} 轮: 沟通记录数量应一致`)
      assert.equal(restored.undo_records.length, 1, `第 ${i + 1} 轮: 撤销记录数量应一致`)
      assert.equal(restored.event_snapshots.length, 5, `第 ${i + 1} 轮: 快照数量应一致`)
      assert.equal(
        restored.event_snapshots[0].total_refund,
        pkg.event_snapshots[0].total_refund,
        `第 ${i + 1} 轮: 快照数据应一致`
      )
      assert.equal(
        restored.undo_records[0].reason,
        pkg.undo_records[0].reason,
        `第 ${i + 1} 轮: 撤销原因应一致`
      )

      pkg = restored
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
