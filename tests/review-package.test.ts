/**
 * 异常事件复盘包回归测试
 *
 * 覆盖场景：
 * 1. 持久化验证 - 复盘包写入 localStorage，刷新/重启后不丢失
 * 2. 导入冲突处理 - ID 冲突和标题冲突的处理，不静默覆盖
 * 3. 事件快照不丢 - 创建后原事件修改/删除，快照保持不变
 * 4. 导出字段一致性 - 导出和导入的字段完整一致
 * 5. 操作日志 - 创建、追加备注、状态变更、导入、删除的审计记录
 * 6. 数据完整性 - 快照包含所有关键字段，不随原事件变化
 *
 * 运行方式：npx tsx tests/review-package.test.ts
 */

import assert from 'node:assert/strict'
import {
  createEventSnapshot,
  createReviewPackage,
  addRemark,
  updateStatus,
  exportReviewPackageToJSON,
  exportReviewPackagesToJSON,
  importReviewPackages,
  createReviewPackageAuditLog,
} from '../src/services/reviewPackageService'
import { reviveDates, uid } from '../src/utils'
import type {
  QualityEvent,
  ReviewPackage,
  ReviewPackageStatus,
  ReviewPackageCauseCategory,
  ReviewPackageAuditLog,
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
  ]
}

// ---------- 测试用例 ----------
console.log('\n=== 异常事件复盘包回归测试 ===\n')

async function runTests() {
  let passed = 0
  let failed = 0

  // ---- Test 1: 事件快照创建 - 完整复制所有关键字段 ----
  console.log('Test 1: 事件快照 - 创建时完整复制所有关键字段')
  try {
    const events = createTestEvents()
    const event = events[0]
    const snapshot = createEventSnapshot(event)

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
    const snapshot = createEventSnapshot(events[0])

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
    const snapshot = createEventSnapshot(events[0])

    const eventsAfterDelete = events.filter((e) => e.id !== 'evt_001')
    assert.equal(eventsAfterDelete.length, 2, '原事件应被删除')

    assert.ok(snapshot, '快照应仍然存在')
    assert.equal(snapshot.id, 'evt_001', '快照 ID 应保持不变')
    assert.equal(snapshot.title, '客户 C001 多次投诉且退款金额高', '快照标题应保持不变')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 4: 复盘包创建 - 完整包含所有字段 ----
  console.log('Test 4: 复盘包创建 - 完整包含所有必填字段')
  try {
    const events = createTestEvents()
    const deadline = new Date(Date.now() + 86400000 * 7)

    const pkg = createReviewPackage(
      '2024年Q1质量波动复盘',
      '张三',
      'process_issue',
      '优化工单分配流程，增加超时预警',
      deadline,
      events
    )

    assert.ok(pkg.id, '应有 ID')
    assert.ok(pkg.id.startsWith('rpkg_'), 'ID 应有 rpkg 前缀')
    assert.equal(pkg.title, '2024年Q1质量波动复盘', '标题应正确')
    assert.equal(pkg.responsible, '张三', '负责人应正确')
    assert.equal(pkg.cause_category, 'process_issue', '原因分类应正确')
    assert.equal(pkg.handling_suggestion, '优化工单分配流程，增加超时预警', '处理建议应正确')
    assert.equal(pkg.deadline?.getTime(), deadline.getTime(), '截止日期应正确')
    assert.equal(pkg.status, 'draft', '初始状态应为草稿')
    assert.equal(pkg.event_snapshots.length, 3, '应有 3 个事件快照')
    assert.deepEqual(pkg.event_ids, ['evt_001', 'evt_002', 'evt_003'], '事件 ID 列表应正确')
    assert.equal(pkg.remarks.length, 0, '初始备注应为空')
    assert.ok(pkg.created_at, '应有创建时间')
    assert.ok(pkg.updated_at, '应有更新时间')
    assert.equal(pkg.closed_at, null, '初始关闭时间应为 null')

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
    const pkg = createReviewPackage(
      '持久化测试复盘包',
      '测试员',
      'system_issue',
      '测试持久化功能',
      new Date(),
      [events[0]]
    )

    const state = {
      reviewPackages: [pkg],
      reviewPackageAuditLogs: [] as ReviewPackageAuditLog[],
    }

    const serialized = JSON.stringify({
      state: {
        reviewPackages: JSON.parse(exportReviewPackagesToJSON([pkg])).packages,
        reviewPackageAuditLogs: [],
      },
    })

    localStorage.setItem('test-store', serialized)

    const restoredRaw = localStorage.getItem('test-store')
    assert.ok(restoredRaw, '应能从 localStorage 读取数据')

    const parsed = JSON.parse(restoredRaw)
    const restoredPackages = parsed.state.reviewPackages.map((p: any) => reviveDates(p))

    assert.equal(restoredPackages.length, 1, '恢复后应有 1 个复盘包')
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
    const existingPkg = createReviewPackage(
      '现有复盘包',
      '张三',
      'process_issue',
      '现有处理建议',
      null,
      [events[0]]
    )

    const existingPackages = [existingPkg]
    const exportJson = exportReviewPackagesToJSON([existingPkg])

    const result = importReviewPackages(exportJson, existingPackages)

    assert.equal(result.imported.length, 0, 'ID 冲突时不应导入')
    assert.equal(result.skipped.length, 1, '应有 1 条跳过记录')
    assert.equal(result.skipped[0].type, 'duplicate_id', '跳过原因应为 duplicate_id')
    assert.equal(result.skipped[0].package_id, existingPkg.id, '跳过的 ID 应正确')
    assert.ok(result.warnings[0].includes('ID 已存在'), '警告信息应说明 ID 冲突')
    assert.equal(result.success, false, '全部冲突时 success 应为 false')

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
    const existingPkg = createReviewPackage(
      '重复标题的复盘包',
      '张三',
      'process_issue',
      '现有处理建议',
      null,
      [events[0]]
    )

    const newPkg = createReviewPackage(
      '重复标题的复盘包',
      '李四',
      'training_issue',
      '新的处理建议',
      null,
      [events[1]]
    )

    const existingPackages = [existingPkg]
    const exportJson = exportReviewPackagesToJSON([newPkg])

    const result = importReviewPackages(exportJson, existingPackages)

    assert.equal(result.imported.length, 0, '标题冲突时不应导入')
    assert.equal(result.skipped.length, 1, '应有 1 条跳过记录')
    assert.equal(result.skipped[0].type, 'duplicate_title', '跳过原因应为 duplicate_title')
    assert.equal(result.skipped[0].package_title, '重复标题的复盘包', '跳过的标题应正确')
    assert.ok(result.warnings[0].includes('标题已存在'), '警告信息应说明标题冲突')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 8: 导入冲突 - 混合 ID 和标题冲突 ----
  console.log('Test 8: 导入冲突 - 混合 ID 和标题冲突，给出清楚提示')
  try {
    const events = createTestEvents()
    const existingPkg1 = createReviewPackage(
      '现有复盘包1',
      '张三',
      'process_issue',
      '建议1',
      null,
      [events[0]]
    )
    const existingPkg2 = createReviewPackage(
      '现有复盘包2',
      '李四',
      'system_issue',
      '建议2',
      null,
      [events[1]]
    )

    const conflictIdPkg = createReviewPackage(
      '新标题1',
      '王五',
      'training_issue',
      '建议3',
      null,
      [events[2]]
    )
    conflictIdPkg.id = existingPkg1.id

    const conflictTitlePkg = createReviewPackage(
      '现有复盘包2',
      '赵六',
      'personnel_issue',
      '建议4',
      null,
      [events[0]]
    )

    const normalPkg = createReviewPackage(
      '正常导入的复盘包',
      '钱七',
      'other',
      '建议5',
      null,
      [events[1]]
    )

    const existingPackages = [existingPkg1, existingPkg2]
    const exportJson = exportReviewPackagesToJSON([conflictIdPkg, conflictTitlePkg, normalPkg])

    const result = importReviewPackages(exportJson, existingPackages)

    assert.equal(result.imported.length, 1, '应成功导入 1 个无冲突的包')
    assert.equal(result.imported[0].title, '正常导入的复盘包', '导入的应是无冲突的包')
    assert.equal(result.skipped.length, 2, '应有 2 条跳过记录')

    const skipTypes = result.skipped.map((s) => s.type).sort()
    assert.deepEqual(skipTypes, ['duplicate_id', 'duplicate_title'], '应包含两种冲突类型')
    assert.equal(result.warnings.length, 2, '应有 2 条警告')
    assert.equal(result.success, true, '有成功导入时 success 应为 true')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 9: 导出字段一致性 - 导出后再导入字段完整 ----
  console.log('Test 9: 导出字段一致性 - 导出 JSON 后再导入字段完整一致')
  try {
    const events = createTestEvents()
    const deadline = new Date(Date.now() + 86400000 * 7)

    let pkg = createReviewPackage(
      '导出测试复盘包',
      '张三',
      'process_issue',
      '测试导出导入一致性',
      deadline,
      events
    )

    const remarkResult = addRemark(pkg, '第一条处理备注')
    pkg = remarkResult.package

    const statusResult = updateStatus(pkg, 'analyzing')
    pkg = statusResult.package

    const exportJson = exportReviewPackageToJSON(pkg)
    const parsed = JSON.parse(exportJson)

    const expectedTopLevelFields = [
      'id', 'title', 'responsible', 'cause_category', 'handling_suggestion',
      'deadline', 'status', 'event_snapshots', 'event_ids', 'remarks',
      'created_at', 'updated_at', 'closed_at'
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

    const expectedRemarkFields = ['id', 'content', 'operator', 'created_at']
    for (const field of expectedRemarkFields) {
      assert.ok(field in parsed.remarks[0], `备注应包含字段: ${field}`)
    }

    const imported = reviveDates(parsed) as ReviewPackage
    assert.equal(imported.id, pkg.id, '导入后 ID 应一致')
    assert.equal(imported.title, pkg.title, '导入后标题应一致')
    assert.equal(imported.status, pkg.status, '导入后状态应一致')
    assert.equal(imported.remarks.length, pkg.remarks.length, '导入后备注数量应一致')
    assert.equal(imported.event_snapshots.length, pkg.event_snapshots.length, '导入后快照数量应一致')
    assert.ok(imported.created_at instanceof Date, '导入后 created_at 应为 Date')
    assert.ok(imported.event_snapshots[0].snapshotted_at instanceof Date, '导入后快照时间应为 Date')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 10: 操作日志 - 创建时记录审计日志 ----
  console.log('Test 10: 操作日志 - 创建复盘包时记录审计日志')
  try {
    const events = createTestEvents()
    const pkg = createReviewPackage(
      '审计日志测试',
      '张三',
      'process_issue',
      '测试',
      null,
      [events[0]]
    )

    const auditLog = createReviewPackageAuditLog('create', pkg)

    assert.ok(auditLog.id, '日志应有 ID')
    assert.equal(auditLog.action, 'create', '操作类型应为 create')
    assert.equal(auditLog.package_id, pkg.id, '应关联复盘包 ID')
    assert.equal(auditLog.package_title, pkg.title, '应记录复盘包标题')
    assert.equal(auditLog.operator, '当前用户', '应记录操作者')
    assert.ok(auditLog.operated_at instanceof Date, '应有操作时间')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 11: 操作日志 - 追加备注时记录审计日志 ----
  console.log('Test 11: 操作日志 - 追加备注时记录审计日志')
  try {
    const events = createTestEvents()
    const pkg = createReviewPackage('测试', '张三', 'process_issue', '测试', null, [events[0]])

    const result = addRemark(pkg, '测试备注内容')

    assert.ok(result.auditLog, '应返回审计日志')
    assert.equal(result.auditLog.action, 'add_remark', '操作类型应为 add_remark')
    assert.equal(result.auditLog.remark_content, '测试备注内容', '应记录备注内容')
    assert.ok(result.auditLog.note?.includes('追加处理备注'), '应有备注说明')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 12: 操作日志 - 状态变更时记录审计日志 ----
  console.log('Test 12: 操作日志 - 状态变更时记录审计日志')
  try {
    const events = createTestEvents()
    let pkg = createReviewPackage('测试', '张三', 'process_issue', '测试', null, [events[0]])

    const result = updateStatus(pkg, 'analyzing')

    assert.ok(result.auditLog, '应返回审计日志')
    assert.equal(result.auditLog.action, 'status_change', '操作类型应为 status_change')
    assert.equal(result.auditLog.old_status, 'draft', '应记录旧状态')
    assert.equal(result.auditLog.new_status, 'analyzing', '应记录新状态')
    assert.ok(result.auditLog.note?.includes('draft → analyzing'), '应有状态变更说明')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 13: 追加备注 - 更新包数据和时间戳 ----
  console.log('Test 13: 追加备注 - 更新包数据和时间戳')
  try {
    const events = createTestEvents()
    const pkg = createReviewPackage('测试', '张三', 'process_issue', '测试', null, events)
    const originalUpdatedAt = pkg.updated_at.getTime()

    await new Promise(resolve => setTimeout(resolve, 10))

    const result = addRemark(pkg, '这是一条处理备注')

    assert.equal(result.package.remarks.length, 1, '应增加 1 条备注')
    assert.equal(result.package.remarks[0].content, '这是一条处理备注', '备注内容应正确')
    assert.equal(result.package.remarks[0].operator, '当前用户', '备注操作者应正确')
    assert.ok(result.package.updated_at.getTime() > originalUpdatedAt, 'updated_at 应更新')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 14: 状态变更 - 更新状态和时间戳 ----
  console.log('Test 14: 状态变更 - 更新状态和时间戳')
  try {
    const events = createTestEvents()
    let pkg = createReviewPackage('测试', '张三', 'process_issue', '测试', null, events)
    const originalUpdatedAt = pkg.updated_at.getTime()

    await new Promise(resolve => setTimeout(resolve, 10))

    let result = updateStatus(pkg, 'analyzing')
    pkg = result.package

    assert.equal(pkg.status, 'analyzing', '状态应更新为 analyzing')
    assert.ok(pkg.updated_at.getTime() > originalUpdatedAt, 'updated_at 应更新')
    assert.equal(pkg.closed_at, null, '非 archived 状态 closed_at 应为 null')

    result = updateStatus(pkg, 'archived')
    pkg = result.package

    assert.equal(pkg.status, 'archived', '状态应更新为 archived')
    assert.ok(pkg.closed_at, 'archived 状态应设置 closed_at')
    assert.ok(pkg.closed_at instanceof Date, 'closed_at 应为 Date 对象')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 15: 数据完整性 - 批量导出所有字段一致 ----
  console.log('Test 15: 数据完整性 - 批量导出导入后所有字段一致')
  try {
    const events = createTestEvents()
    const pkg1 = createReviewPackage('包1', '张三', 'process_issue', '建议1', new Date(), [events[0]])
    const pkg2 = createReviewPackage('包2', '李四', 'system_issue', '建议2', null, [events[1], events[2]])

    const result1 = addRemark(pkg1, '包1的备注')
    const result2 = updateStatus(result1.package, 'resolved')

    const exportJson = exportReviewPackagesToJSON([result2.package, pkg2])
    const parsed = JSON.parse(exportJson)

    assert.equal(parsed.version, 1, '导出版本号应为 1')
    assert.ok(parsed.exported_at, '应有导出时间')
    assert.equal(parsed.packages.length, 2, '应导出 2 个复盘包')

    const restoredPkgs = parsed.packages.map((p: any) => reviveDates(p) as ReviewPackage)

    assert.equal(restoredPkgs[0].id, result2.package.id)
    assert.equal(restoredPkgs[0].status, 'resolved')
    assert.equal(restoredPkgs[0].remarks.length, 1)
    assert.equal(restoredPkgs[0].event_snapshots.length, 1)

    assert.equal(restoredPkgs[1].id, pkg2.id)
    assert.equal(restoredPkgs[1].status, 'draft')
    assert.equal(restoredPkgs[1].event_snapshots.length, 2)

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 16: 导入无效 JSON - 错误处理 ----
  console.log('Test 16: 错误处理 - 导入无效 JSON 应返回错误')
  try {
    const result = importReviewPackages('invalid json', [])

    assert.equal(result.success, false, '无效 JSON 时 success 应为 false')
    assert.equal(result.imported.length, 0, '不应导入任何包')
    assert.ok(result.errors[0].includes('JSON 格式无效'), '错误信息应说明格式无效')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 17: 事件快照 - 数组是深拷贝 ----
  console.log('Test 17: 事件快照 - types 数组是深拷贝，不随原事件变化')
  try {
    const events = createTestEvents()
    const event = events[0]
    const originalTypes = [...event.types]
    const snapshot = createEventSnapshot(event)

    event.types.push('low_score')

    assert.deepEqual(snapshot.types, originalTypes, '快照 types 不应随原事件变化')
    assert.notDeepEqual(snapshot.types, event.types, '快照 types 与原事件 types 应不同')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 18: 持久化 - 多轮刷新后数据保持一致 ----
  console.log('Test 18: 持久化 - 多轮模拟刷新后数据保持一致')
  try {
    const events = createTestEvents()
    let pkg = createReviewPackage('多轮持久化测试', '张三', 'process_issue', '测试', null, events)

    pkg = addRemark(pkg, '备注1').package
    pkg = updateStatus(pkg, 'analyzing').package
    pkg = addRemark(pkg, '备注2').package
    pkg = updateStatus(pkg, 'resolved').package

    for (let i = 0; i < 5; i++) {
      const exportJson = exportReviewPackageToJSON(pkg)
      const restored = reviveDates(JSON.parse(exportJson)) as ReviewPackage

      assert.equal(restored.id, pkg.id, `第 ${i + 1} 轮: ID 应一致`)
      assert.equal(restored.status, 'resolved', `第 ${i + 1} 轮: 状态应一致`)
      assert.equal(restored.remarks.length, 2, `第 ${i + 1} 轮: 备注数量应一致`)
      assert.equal(restored.event_snapshots.length, 3, `第 ${i + 1} 轮: 快照数量应一致`)
      assert.equal(
        restored.event_snapshots[0].total_refund,
        pkg.event_snapshots[0].total_refund,
        `第 ${i + 1} 轮: 快照数据应一致`
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
