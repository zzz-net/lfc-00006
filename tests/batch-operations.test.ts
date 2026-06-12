/**
 * 批量复核操作回归测试
 *
 * 覆盖场景：
 * 1. 多选功能 - 按筛选结果多选，筛选/搜索后选择保留
 * 2. 批量操作 - 已确认、已忽略、退回待处理
 * 3. 冲突跳过 - 已关闭、状态已变化、不存在的事件
 * 4. 撤销功能 - 撤销最近一次批量操作，恢复原状态和备注
 * 5. 数据完整性 - 不覆盖原有证据、来源数据、导入历史或规则配置
 * 6. 备份恢复 - 全量备份导出、恢复导入后批量操作历史保持一致
 * 7. 持久化验证 - 浏览器刷新或重启后批量处理结果保持一致
 *
 * 运行方式：npx tsx tests/batch-operations.test.ts
 */

import assert from 'node:assert/strict'
import { uid } from '../src/utils'
import type {
  QualityEvent,
  Evidence,
  ImportRecord,
  QualityRule,
  EventStatus,
  BatchActionType,
  BatchActionResult,
  BatchOperation,
  BatchActionTarget,
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

// ---------- 被测核心逻辑（与 store 中保持一致）----------
const BATCH_ACTION_STATUS_MAP: Record<BatchActionType, EventStatus> = {
  confirm: 'closed',
  ignore: 'closed',
  reopen: 'pending',
}

function createTestEvents(): QualityEvent[] {
  const now = new Date()
  return [
    {
      id: 'evt_001',
      customer_id: 'C001',
      title: '客户 C001 多次投诉且退款金额高',
      types: ['high_refund', 'repeat_complaint'],
      status: 'pending',
      review_note: '',
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
      title: '客户 C004 重复投诉',
      types: ['repeat_complaint'],
      status: 'reviewing',
      review_note: '',
      reviewed_at: new Date(now.getTime() - 7200000),
      closed_at: null,
      first_seen_at: new Date(now.getTime() - 86400000 * 4),
      last_seen_at: new Date(now.getTime() - 86400000),
      evidence_count: 4,
      total_refund: 0,
    },
    {
      id: 'evt_005',
      customer_id: 'C005',
      title: '客户 C005 已处理完成',
      types: ['high_refund'],
      status: 'closed',
      review_note: '已妥善处理，客户满意',
      reviewed_at: new Date(now.getTime() - 86400000),
      closed_at: new Date(now.getTime() - 43200000),
      first_seen_at: new Date(now.getTime() - 86400000 * 7),
      last_seen_at: new Date(now.getTime() - 86400000 * 3),
      evidence_count: 3,
      total_refund: 1299,
    },
    {
      id: 'evt_006',
      customer_id: 'C006',
      title: '客户 C006 超时未响应',
      types: ['timeout'],
      status: 'pending',
      review_note: '',
      reviewed_at: null,
      closed_at: null,
      first_seen_at: new Date(now.getTime() - 86400000),
      last_seen_at: new Date(now.getTime() - 3600000),
      evidence_count: 1,
      total_refund: 0,
    },
  ]
}

function createTestEvidences(): Evidence[] {
  return [
    { id: 'ev_001', event_id: 'evt_001', source_type: 'refund', source_id: 'R001', hit_rules: ['high_refund'], raw_data: { refund_no: 'R001', amount: 1299 }, occurred_at: new Date() },
    { id: 'ev_002', event_id: 'evt_001', source_type: 'ticket', source_id: 'T001', hit_rules: ['repeat_complaint'], raw_data: { ticket_no: 'T001' }, occurred_at: new Date() },
    { id: 'ev_003', event_id: 'evt_002', source_type: 'ticket', source_id: 'T002', hit_rules: ['timeout'], raw_data: { ticket_no: 'T002' }, occurred_at: new Date() },
    { id: 'ev_004', event_id: 'evt_003', source_type: 'score', source_id: 'S001', hit_rules: ['low_score'], raw_data: { score: 1 }, occurred_at: new Date() },
    { id: 'ev_005', event_id: 'evt_005', source_type: 'refund', source_id: 'R002', hit_rules: ['high_refund'], raw_data: { refund_no: 'R002', amount: 1299 }, occurred_at: new Date() },
  ]
}

function createTestImportRecords(): ImportRecord[] {
  return [
    {
      id: 'rec_001',
      file_name: 'tickets.csv',
      file_type: 'ticket',
      total_count: 20,
      valid_count: 18,
      invalid_count: 2,
      file_hash: 'abc123',
      imported_at: new Date(),
      errors: [],
      raw_content: 'test,ticket,data',
    },
  ]
}

const DEFAULT_RULES: QualityRule = {
  timeout_hours: 24,
  min_score: 3,
  repeat_days: 7,
  repeat_count: 3,
  high_refund_amount: 500,
}

/**
 * 模拟 executeBatchAction 核心逻辑
 */
function simulateExecuteBatchAction(
  events: QualityEvent[],
  eventIds: string[],
  action: BatchActionType,
  note: string,
  expectedStatuses?: Record<string, EventStatus>,
  lastBatchOperation: BatchOperation | null = null
): {
  updatedEvents: QualityEvent[]
  result: BatchActionResult
  newLastBatchOperation: BatchOperation | null
} {
  const now = new Date()
  const operationId = uid()
  const targetStatus = BATCH_ACTION_STATUS_MAP[action]

  const targets: BatchActionTarget[] = []
  const skipped: { id: string; reason: 'not_found' | 'already_closed' | 'status_changed'; expectedStatus?: EventStatus; actualStatus?: EventStatus }[] = []

  for (const id of eventIds) {
    const event = events.find((e) => e.id === id)

    if (!event) {
      skipped.push({ id, reason: 'not_found' })
      continue
    }

    if (event.status === 'closed') {
      skipped.push({
        id,
        reason: 'already_closed',
        expectedStatus: expectedStatuses?.[id],
        actualStatus: event.status,
      })
      continue
    }

    if (expectedStatuses && expectedStatuses[id] !== undefined && expectedStatuses[id] !== event.status) {
      skipped.push({
        id,
        reason: 'status_changed',
        expectedStatus: expectedStatuses[id],
        actualStatus: event.status,
      })
      continue
    }

    targets.push({
      id: event.id,
      originalStatus: event.status,
      originalNote: event.review_note,
      originalReviewedAt: event.reviewed_at,
      originalClosedAt: event.closed_at,
    })
  }

  const targetIdSet = new Set(targets.map((t) => t.id))
  const hasNote = note && note.trim().length > 0

  const updatedEvents = events.map((e) => {
    if (!targetIdSet.has(e.id)) return e
    let newReviewedAt: Date | null = e.reviewed_at
    let newClosedAt: Date | null = e.closed_at

    if (targetStatus === 'closed') {
      newReviewedAt = now
      newClosedAt = now
    } else if (targetStatus === 'reviewing') {
      newReviewedAt = now
      newClosedAt = null
    } else if (targetStatus === 'pending') {
      newClosedAt = null
    }

    return {
      ...e,
      status: targetStatus,
      review_note: hasNote ? note.trim() : e.review_note,
      reviewed_at: newReviewedAt,
      closed_at: newClosedAt,
    }
  })

  const newLastBatchOperation: BatchOperation = {
    id: operationId,
    action,
    targetStatus,
    note,
    targets: [...targets],
    executedAt: now,
  }

  return {
    updatedEvents,
    result: {
      action,
      targetStatus,
      totalRequested: eventIds.length,
      successCount: targets.length,
      skipCount: skipped.length,
      skipped,
      targets,
      note,
      executedAt: now,
      operationId,
    },
    newLastBatchOperation,
  }
}

/**
 * 模拟 undoLastBatchOperation 核心逻辑
 */
function simulateUndoLastBatchOperation(
  events: QualityEvent[],
  lastBatchOperation: BatchOperation | null
): {
  updatedEvents: QualityEvent[]
  success: boolean
  restoredCount: number
  message: string
  newLastBatchOperation: null
} {
  if (!lastBatchOperation) {
    return {
      updatedEvents: events,
      success: false,
      restoredCount: 0,
      message: '没有可撤销的批量操作',
      newLastBatchOperation: null,
    }
  }

  const { targets } = lastBatchOperation
  const targetIdSet = new Set(targets.map((t) => t.id))

  const updatedEvents = events.map((e) => {
    if (!targetIdSet.has(e.id)) return e
    const target = targets.find((t) => t.id === e.id)
    if (!target) return e
    return {
      ...e,
      status: target.originalStatus,
      review_note: target.originalNote,
      reviewed_at: target.originalReviewedAt,
      closed_at: target.originalClosedAt,
    }
  })

  return {
    updatedEvents,
    success: true,
    restoredCount: targets.length,
    message: `已撤销批量操作，恢复了 ${targets.length} 条事件的状态`,
    newLastBatchOperation: null,
  }
}

// ---------- 测试用例 ----------
console.log('\n=== 批量复核操作回归测试 ===\n')

async function runTests() {
  let passed = 0
  let failed = 0

  // ---- Test 1: 多选功能 - 全选待复核事件 ----
  console.log('Test 1: 多选功能 - 全选待复核事件并批量确认')
  try {
    const events = createTestEvents()
    const pendingEvents = events.filter((e) => e.status === 'pending')
    const pendingIds = pendingEvents.map((e) => e.id)

    const expectedStatuses: Record<string, EventStatus> = {}
    for (const e of pendingEvents) {
      expectedStatuses[e.id] = e.status
    }

    const { updatedEvents, result } = simulateExecuteBatchAction(
      events,
      pendingIds,
      'confirm',
      '批量确认处理',
      expectedStatuses
    )

    assert.equal(result.totalRequested, 3, '应请求处理 3 个事件')
    assert.equal(result.successCount, 3, '应成功处理 3 个事件')
    assert.equal(result.skipCount, 0, '不应有跳过')

    for (const id of pendingIds) {
      const event = updatedEvents.find((e) => e.id === id)
      assert.ok(event, `事件 ${id} 应存在`)
      assert.equal(event!.status, 'closed', `事件 ${id} 状态应为 closed`)
      assert.equal(event!.review_note, '批量确认处理', `事件 ${id} 备注应更新`)
      assert.ok(event!.reviewed_at, `事件 ${id} 应有 reviewed_at`)
      assert.ok(event!.closed_at, `事件 ${id} 应有 closed_at`)
    }

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 2: 冲突跳过 - 包含已关闭事件 ----
  console.log('Test 2: 冲突跳过 - 批量确认时已关闭事件应被跳过')
  try {
    const events = createTestEvents()
    const mixedIds = ['evt_001', 'evt_002', 'evt_005']

    const expectedStatuses: Record<string, EventStatus> = {
      evt_001: 'pending',
      evt_002: 'pending',
      evt_005: 'closed',
    }

    const { updatedEvents, result } = simulateExecuteBatchAction(
      events,
      mixedIds,
      'confirm',
      '',
      expectedStatuses
    )

    assert.equal(result.totalRequested, 3, '应请求处理 3 个事件')
    assert.equal(result.successCount, 2, '应成功处理 2 个事件')
    assert.equal(result.skipCount, 1, '应跳过 1 个事件')
    assert.equal(result.skipped[0].reason, 'already_closed', '跳过原因应为 already_closed')
    assert.equal(result.skipped[0].id, 'evt_005', '跳过的应为 evt_005')

    const evt005 = updatedEvents.find((e) => e.id === 'evt_005')!
    assert.equal(evt005.status, 'closed', '已关闭事件状态应保持不变')
    assert.equal(evt005.review_note, '已妥善处理，客户满意', '已关闭事件备注应保持不变')
    assert.equal(evt005.closed_at?.getTime(), events[4].closed_at?.getTime(), '已关闭事件时间应保持不变')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 3: 冲突跳过 - 状态已变化的事件 ----
  console.log('Test 3: 冲突跳过 - 选择后状态已变化的事件应被跳过')
  try {
    const events = createTestEvents()
    const selectedIds = ['evt_001', 'evt_003']

    const expectedStatuses: Record<string, EventStatus> = {
      evt_001: 'pending',
      evt_003: 'pending',
    }

    const { updatedEvents, result } = simulateExecuteBatchAction(
      events,
      selectedIds,
      'confirm',
      '',
      expectedStatuses
    )

    assert.equal(result.totalRequested, 2, '应请求处理 2 个事件')
    assert.equal(result.successCount, 1, '应成功处理 1 个事件')
    assert.equal(result.skipCount, 1, '应跳过 1 个事件')
    assert.equal(result.skipped[0].reason, 'status_changed', '跳过原因应为 status_changed')
    assert.equal(result.skipped[0].id, 'evt_003', '跳过的应为 evt_003')
    assert.equal(result.skipped[0].expectedStatus, 'pending', '期望状态应为 pending')
    assert.equal(result.skipped[0].actualStatus, 'reviewing', '实际状态应为 reviewing')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 4: 冲突跳过 - 不存在的事件 ----
  console.log('Test 4: 冲突跳过 - 不存在的事件应被跳过')
  try {
    const events = createTestEvents()
    const ids = ['evt_001', 'evt_999', 'evt_002']

    const { updatedEvents, result } = simulateExecuteBatchAction(events, ids, 'ignore', '')

    assert.equal(result.totalRequested, 3, '应请求处理 3 个事件')
    assert.equal(result.successCount, 2, '应成功处理 2 个事件')
    assert.equal(result.skipCount, 1, '应跳过 1 个事件')
    assert.equal(result.skipped[0].reason, 'not_found', '跳过原因应为 not_found')
    assert.equal(result.skipped[0].id, 'evt_999', '跳过的应为 evt_999')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5: 批量操作 - 退回待处理 ----
  console.log('Test 5: 批量操作 - 将复核中事件退回待处理')
  try {
    const events = createTestEvents()
    const reviewingIds = ['evt_003', 'evt_004']

    const expectedStatuses: Record<string, EventStatus> = {
      evt_003: 'reviewing',
      evt_004: 'reviewing',
    }

    const { updatedEvents, result } = simulateExecuteBatchAction(
      events,
      reviewingIds,
      'reopen',
      '需要重新复核',
      expectedStatuses
    )

    assert.equal(result.totalRequested, 2, '应请求处理 2 个事件')
    assert.equal(result.successCount, 2, '应成功处理 2 个事件')
    assert.equal(result.skipCount, 0, '不应有跳过')

    for (const id of reviewingIds) {
      const event = updatedEvents.find((e) => e.id === id)
      assert.equal(event!.status, 'pending', `事件 ${id} 状态应为 pending`)
      assert.equal(event!.review_note, '需要重新复核', `事件 ${id} 备注应更新`)
      assert.equal(event!.closed_at, null, `事件 ${id} closed_at 应为 null`)
    }

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5b: 回归测试 - closed 事件执行 reopen 应被跳过 ----
  console.log('Test 5b: 回归测试 - closed 事件执行 reopen 后仍保持 closed，successCount=0, skipCount=1')
  try {
    const events = createTestEvents()
    const closedEvent = events.find((e) => e.id === 'evt_005')!
    const originalStatus = closedEvent.status
    const originalNote = closedEvent.review_note
    const originalClosedAt = closedEvent.closed_at?.getTime()
    const originalReviewedAt = closedEvent.reviewed_at?.getTime()

    assert.equal(originalStatus, 'closed', '测试前置：事件应为 closed 状态')
    assert.ok(originalNote.length > 0, '测试前置：事件应有原始备注')
    assert.ok(originalClosedAt, '测试前置：事件应有 closed_at')

    const ids = ['evt_005']
    const expectedStatuses: Record<string, EventStatus> = {
      evt_005: 'closed',
    }

    const { updatedEvents, result } = simulateExecuteBatchAction(
      events,
      ids,
      'reopen',
      '尝试退回已关闭事件',
      expectedStatuses
    )

    assert.equal(result.totalRequested, 1, '应请求处理 1 个事件')
    assert.equal(result.successCount, 0, 'successCount 应为 0 - closed 事件不应被成功处理')
    assert.equal(result.skipCount, 1, 'skipCount 应为 1 - closed 事件必须被跳过')
    assert.equal(result.skipped.length, 1, '应有 1 条跳过记录')
    assert.equal(result.skipped[0].id, 'evt_005', '跳过的应为 evt_005')
    assert.equal(result.skipped[0].reason, 'already_closed', '跳过原因应为 already_closed')
    assert.equal(result.skipped[0].actualStatus, 'closed', '实际状态应为 closed')

    const afterEvent = updatedEvents.find((e) => e.id === 'evt_005')!
    assert.equal(afterEvent.status, 'closed', '事件状态应保持 closed 不变')
    assert.equal(afterEvent.review_note, originalNote, '事件备注应保持不变')
    assert.equal(afterEvent.closed_at?.getTime(), originalClosedAt, '事件 closed_at 应保持不变')
    assert.equal(afterEvent.reviewed_at?.getTime(), originalReviewedAt, '事件 reviewed_at 应保持不变')
    assert.equal(afterEvent.evidence_count, closedEvent.evidence_count, '证据数应保持不变')
    assert.equal(afterEvent.total_refund, closedEvent.total_refund, '退款额应保持不变')
    assert.equal(afterEvent.customer_id, closedEvent.customer_id, '客户ID应保持不变')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5c: 回归测试 - 混合 closed+reviewing 执行 reopen，closed 跳过 reviewing 成功 ----
  console.log('Test 5c: 混合场景 - closed+reviewing 混合执行 reopen，closed 跳过，reviewing 成功且 closed_at 清空')
  try {
    const events = createTestEvents()
    const mixedIds = ['evt_003', 'evt_005']

    const origEvt003 = events.find((e) => e.id === 'evt_003')!
    const origEvt005 = events.find((e) => e.id === 'evt_005')!

    const expectedStatuses: Record<string, EventStatus> = {
      evt_003: 'reviewing',
      evt_005: 'closed',
    }

    const { updatedEvents, result } = simulateExecuteBatchAction(
      events,
      mixedIds,
      'reopen',
      '批量退回待处理',
      expectedStatuses
    )

    assert.equal(result.totalRequested, 2, '应请求处理 2 个事件')
    assert.equal(result.successCount, 1, '应成功处理 1 个事件（reviewing）')
    assert.equal(result.skipCount, 1, '应跳过 1 个事件（closed）')
    assert.equal(result.skipped[0].id, 'evt_005', '跳过的应为 closed 的 evt_005')
    assert.equal(result.skipped[0].reason, 'already_closed', '跳过原因应为 already_closed')

    const afterEvt003 = updatedEvents.find((e) => e.id === 'evt_003')!
    assert.equal(afterEvt003.status, 'pending', 'evt_003 应从 reviewing → pending')
    assert.equal(afterEvt003.review_note, '批量退回待处理', 'evt_003 备注应更新')
    assert.equal(afterEvt003.closed_at, null, 'evt_003 closed_at 应被清空（不能残留）')

    const afterEvt005 = updatedEvents.find((e) => e.id === 'evt_005')!
    assert.equal(afterEvt005.status, 'closed', 'evt_005 状态应保持 closed')
    assert.equal(afterEvt005.review_note, origEvt005.review_note, 'evt_005 备注应保持不变')
    assert.equal(afterEvt005.closed_at?.getTime(), origEvt005.closed_at?.getTime(), 'evt_005 closed_at 应保持不变')
    assert.equal(afterEvt005.reviewed_at?.getTime(), origEvt005.reviewed_at?.getTime(), 'evt_005 reviewed_at 应保持不变')

    assert.deepEqual(result.targets.map((t) => t.id), ['evt_003'], '操作目标应仅包含 evt_003')
    assert.equal(result.targets[0].originalStatus, 'reviewing', '撤销记录中原始状态应为 reviewing')
    assert.equal(result.targets[0].originalNote, origEvt003.review_note, '撤销记录中原始备注应保存')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 5d: 三种跳过原因同时存在的综合场景 ----
  console.log('Test 5d: 综合场景 - closed+不存在+状态变化 三种跳过原因同时出现')
  try {
    const events = createTestEvents()
    const ids = ['evt_005', 'evt_999', 'evt_003']

    const expectedStatuses: Record<string, EventStatus> = {
      evt_005: 'closed',
      evt_999: 'pending',
      evt_003: 'pending',
    }

    const { result } = simulateExecuteBatchAction(events, ids, 'confirm', '', expectedStatuses)

    assert.equal(result.totalRequested, 3, '应请求处理 3 个事件')
    assert.equal(result.successCount, 0, '3 个都应跳过，successCount 为 0')
    assert.equal(result.skipCount, 3, 'skipCount 应为 3')

    const reasons = result.skipped.map((s) => s.reason).sort()
    assert.deepEqual(
      reasons,
      ['already_closed', 'not_found', 'status_changed'].sort(),
      '三种跳过原因都应出现：already_closed, not_found, status_changed'
    )

    const byId = Object.fromEntries(result.skipped.map((s) => [s.id, s]))
    assert.equal(byId['evt_005'].reason, 'already_closed')
    assert.equal(byId['evt_999'].reason, 'not_found')
    assert.equal(byId['evt_003'].reason, 'status_changed')
    assert.equal(byId['evt_003'].expectedStatus, 'pending')
    assert.equal(byId['evt_003'].actualStatus, 'reviewing')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 6: 批量操作 - 不覆盖原有证据和来源数据 ----
  console.log('Test 6: 数据完整性 - 批量操作不覆盖证据、来源数据和规则')
  try {
    const events = createTestEvents()
    const evidences = createTestEvidences()
    const importRecords = createTestImportRecords()
    const rules = { ...DEFAULT_RULES }

    const beforeEvents = JSON.stringify(events.map((e) => ({
      ...e,
      reviewed_at: e.reviewed_at?.toISOString(),
      closed_at: e.closed_at?.toISOString(),
      first_seen_at: e.first_seen_at.toISOString(),
      last_seen_at: e.last_seen_at.toISOString(),
    })))
    const beforeEvidences = JSON.stringify(evidences)
    const beforeImportRecords = JSON.stringify(importRecords)
    const beforeRules = JSON.stringify(rules)

    const ids = ['evt_001', 'evt_002']
    const { updatedEvents } = simulateExecuteBatchAction(events, ids, 'confirm', '批量确认')

    for (const e of updatedEvents) {
      if (ids.includes(e.id)) continue
      const original = events.find((orig) => orig.id === e.id)
      assert.deepEqual(e, original, `未选中的事件 ${e.id} 应完全不变`)
    }

    const evt001 = updatedEvents.find((e) => e.id === 'evt_001')!
    const origEvt001 = events.find((e) => e.id === 'evt_001')!
    assert.equal(evt001.evidence_count, origEvt001.evidence_count, '证据数应保持不变')
    assert.equal(evt001.total_refund, origEvt001.total_refund, '退款额应保持不变')
    assert.equal(evt001.types.length, origEvt001.types.length, '类型数应保持不变')
    assert.equal(evt001.first_seen_at.getTime(), origEvt001.first_seen_at.getTime(), '首次发现时间应保持不变')
    assert.equal(evt001.last_seen_at.getTime(), origEvt001.last_seen_at.getTime(), '最后发现时间应保持不变')
    assert.equal(evt001.customer_id, origEvt001.customer_id, '客户ID应保持不变')
    assert.equal(evt001.title, origEvt001.title, '标题应保持不变')

    assert.equal(JSON.stringify(evidences), beforeEvidences, '证据列表应完全不变')
    assert.equal(JSON.stringify(importRecords), beforeImportRecords, '导入记录应完全不变')
    assert.equal(JSON.stringify(rules), beforeRules, '规则配置应完全不变')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 7: 撤销功能 - 恢复原状态和备注 ----
  console.log('Test 7: 撤销功能 - 撤销批量操作恢复原状态和备注')
  try {
    const events = createTestEvents()
    const ids = ['evt_001', 'evt_002', 'evt_003']

    const originalState = JSON.stringify(events.map((e) => ({
      ...e,
      reviewed_at: e.reviewed_at?.toISOString(),
      closed_at: e.closed_at?.toISOString(),
      first_seen_at: e.first_seen_at.toISOString(),
      last_seen_at: e.last_seen_at.toISOString(),
    })))

    const expectedStatuses: Record<string, EventStatus> = {}
    for (const id of ids) {
      const e = events.find((ev) => ev.id === id)!
      expectedStatuses[id] = e.status
    }

    const batchResult = simulateExecuteBatchAction(events, ids, 'ignore', '批量忽略', expectedStatuses)

    assert.equal(batchResult.result.successCount, 3, '应成功处理 3 个事件')

    const undoResult = simulateUndoLastBatchOperation(
      batchResult.updatedEvents,
      batchResult.newLastBatchOperation
    )

    assert.equal(undoResult.success, true, '撤销应成功')
    assert.equal(undoResult.restoredCount, 3, '应恢复 3 条事件')
    assert.equal(undoResult.newLastBatchOperation, null, '撤销后批量操作记录应清空')

    const restoredState = JSON.stringify(undoResult.updatedEvents.map((e) => ({
      ...e,
      reviewed_at: e.reviewed_at?.toISOString(),
      closed_at: e.closed_at?.toISOString(),
      first_seen_at: e.first_seen_at.toISOString(),
      last_seen_at: e.last_seen_at.toISOString(),
    })))

    assert.equal(restoredState, originalState, '撤销后事件状态应完全恢复原值')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 8: 撤销功能 - 无操作时撤销应失败 ----
  console.log('Test 8: 撤销功能 - 无可撤销操作时应返回失败')
  try {
    const events = createTestEvents()

    const result = simulateUndoLastBatchOperation(events, null)

    assert.equal(result.success, false, '撤销应失败')
    assert.equal(result.restoredCount, 0, '恢复数量应为 0')
    assert.ok(result.message.includes('没有可撤销'), '错误信息应正确')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 9: 持久化验证 - 批量操作历史持久化 ----
  console.log('Test 9: 持久化验证 - 批量操作历史应持久化，刷新后可撤销')
  try {
    const events = createTestEvents()
    const ids = ['evt_001', 'evt_002']

    const batchResult = simulateExecuteBatchAction(events, ids, 'confirm', '测试批量确认')

    const stateToPersist = {
      events: batchResult.updatedEvents,
      lastBatchOperation: batchResult.newLastBatchOperation,
    }

    const serialized = JSON.stringify(stateToPersist)
    const restored = reviveDates(JSON.parse(serialized))

    assert.equal(restored.events.length, events.length, '恢复后事件数量应一致')
    assert.ok(restored.lastBatchOperation, '恢复后应有批量操作记录')
    assert.equal(restored.lastBatchOperation.targets.length, 2, '恢复后目标数量应一致')

    const undoResult = simulateUndoLastBatchOperation(
      restored.events,
      restored.lastBatchOperation
    )

    assert.equal(undoResult.success, true, '恢复后仍可撤销')
    assert.equal(undoResult.restoredCount, 2, '应恢复 2 条事件')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 10: 备份恢复 - 全量备份包含批量操作历史 ----
  console.log('Test 10: 备份恢复 - 全量备份导出和恢复导入后批量操作历史保持一致')
  try {
    const events = createTestEvents()
    const evidences = createTestEvidences()
    const importRecords = createTestImportRecords()
    const rules = { ...DEFAULT_RULES }

    const ids = ['evt_001', 'evt_002']
    const batchResult = simulateExecuteBatchAction(events, ids, 'confirm', '批量确认测试')

    const fullState = {
      tickets: [],
      scores: [],
      refunds: [],
      events: batchResult.updatedEvents.map((e) => ({
        ...e,
        reviewed_at: e.reviewed_at?.toISOString(),
        closed_at: e.closed_at?.toISOString(),
        first_seen_at: e.first_seen_at.toISOString(),
        last_seen_at: e.last_seen_at.toISOString(),
      })),
      evidences: evidences.map((ev) => ({ ...ev, occurred_at: ev.occurred_at.toISOString() })),
      importRecords: importRecords.map((r) => ({ ...r, imported_at: r.imported_at.toISOString() })),
      rules,
      lastBatchOperation: {
        ...batchResult.newLastBatchOperation!,
        executedAt: batchResult.newLastBatchOperation!.executedAt.toISOString(),
        targets: batchResult.newLastBatchOperation!.targets.map((t) => ({
          ...t,
          originalReviewedAt: t.originalReviewedAt?.toISOString(),
          originalClosedAt: t.originalClosedAt?.toISOString(),
        })),
      },
    }

    const backup = JSON.stringify({
      version: 1,
      backup_at: new Date().toISOString(),
      state: fullState,
    })

    const parsed = JSON.parse(backup)
    const restoredState = reviveDates(parsed.state)

    assert.ok(restoredState.lastBatchOperation, '恢复后应有批量操作记录')
    assert.equal(restoredState.lastBatchOperation.action, 'confirm', '操作类型应正确')
    assert.equal(restoredState.lastBatchOperation.note, '批量确认测试', '备注应正确')
    assert.equal(restoredState.lastBatchOperation.targets.length, 2, '目标数量应正确')
    assert.equal(restoredState.events.length, events.length, '事件数量应正确')

    const undoResult = simulateUndoLastBatchOperation(
      restoredState.events,
      restoredState.lastBatchOperation
    )

    assert.equal(undoResult.success, true, '恢复后仍可撤销')
    assert.equal(undoResult.restoredCount, 2, '应恢复 2 条事件')

    assert.equal(restoredState.evidences.length, evidences.length, '证据数量应保持不变')
    assert.equal(restoredState.importRecords.length, importRecords.length, '导入记录数量应保持不变')
    assert.deepEqual(restoredState.rules, rules, '规则应保持不变')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 11: 批量备注 - 留空时不覆盖原有备注 ----
  console.log('Test 11: 批量备注 - 留空时不覆盖每条事件原有的备注')
  try {
    const events = createTestEvents()
    const ids = ['evt_003', 'evt_004']

    const beforeNote003 = events.find((e) => e.id === 'evt_003')!.review_note
    const beforeNote004 = events.find((e) => e.id === 'evt_004')!.review_note

    assert.ok(beforeNote003.length > 0, 'evt_003 应有原始备注')
    assert.equal(beforeNote004.length, 0, 'evt_004 应无原始备注')

    const { updatedEvents } = simulateExecuteBatchAction(events, ids, 'confirm', '')

    const evt003 = updatedEvents.find((e) => e.id === 'evt_003')!
    const evt004 = updatedEvents.find((e) => e.id === 'evt_004')!

    assert.equal(evt003.review_note, beforeNote003, '有备注的事件应保留原备注')
    assert.equal(evt004.review_note, beforeNote004, '无备注的事件应保持空')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 12: 选择保留规则 - 筛选后选择保留 ----
  console.log('Test 12: 选择保留规则 - 筛选/搜索变化后已选项应保留')
  try {
    const events = createTestEvents()
    const selectedIds = new Set(['evt_001', 'evt_003', 'evt_005'])

    const pendingOnly = events.filter((e) => e.status === 'pending')
    const pendingIds = new Set(pendingOnly.map((e) => e.id))

    const inFilter: string[] = []
    const outOfFilter: string[] = []

    for (const id of selectedIds) {
      if (pendingIds.has(id)) {
        inFilter.push(id)
      } else {
        outOfFilter.push(id)
      }
    }

    assert.equal(inFilter.length, 1, '筛选后应有 1 个在当前筛选内')
    assert.equal(outOfFilter.length, 2, '筛选后应有 2 个在筛选外')
    assert.deepEqual(inFilter, ['evt_001'], '筛选内的应为 evt_001')
    assert.deepEqual(outOfFilter.sort(), ['evt_003', 'evt_005'].sort(), '筛选外的应为 evt_003 和 evt_005')

    assert.equal(selectedIds.size, 3, '选择集合大小应保持不变')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 13: 撤销后再次操作 ----
  console.log('Test 13: 撤销后再次执行批量操作应正常工作')
  try {
    const events = createTestEvents()
    const ids = ['evt_001', 'evt_002']

    const batch1 = simulateExecuteBatchAction(events, ids, 'confirm', '第一次操作')
    assert.equal(batch1.result.successCount, 2)

    const undo1 = simulateUndoLastBatchOperation(batch1.updatedEvents, batch1.newLastBatchOperation)
    assert.equal(undo1.success, true)

    const batch2 = simulateExecuteBatchAction(undo1.updatedEvents, ids, 'ignore', '第二次操作')
    assert.equal(batch2.result.successCount, 2, '撤销后再次操作应成功')
    assert.equal(batch2.newLastBatchOperation?.action, 'ignore', '操作类型应为 ignore')

    const undo2 = simulateUndoLastBatchOperation(batch2.updatedEvents, batch2.newLastBatchOperation)
    assert.equal(undo2.success, true, '第二次操作也可撤销')

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 14: 每条事件独立更新时间 ----
  console.log('Test 14: 每条事件应写入自己的状态、备注和更新时间')
  try {
    const events = createTestEvents()
    const ids = ['evt_001', 'evt_002', 'evt_006']

    const beforeTimestamps = events.map((e) => ({
      id: e.id,
      reviewed_at: e.reviewed_at?.getTime(),
      closed_at: e.closed_at?.getTime(),
    }))

    const { updatedEvents, result } = simulateExecuteBatchAction(events, ids, 'confirm', '测试更新时间')

    assert.equal(result.successCount, 3)

    const executionTime = result.executedAt.getTime()

    for (const id of ids) {
      const event = updatedEvents.find((e) => e.id === id)!
      const before = beforeTimestamps.find((b) => b.id === id)!

      assert.ok(event.reviewed_at, '应有 reviewed_at')
      assert.ok(event.closed_at, '应有 closed_at')
      assert.equal(event.reviewed_at?.getTime(), executionTime, 'reviewed_at 应等于执行时间')
      assert.equal(event.closed_at?.getTime(), executionTime, 'closed_at 应等于执行时间')
    }

    for (const e of updatedEvents) {
      if (ids.includes(e.id)) continue
      const before = beforeTimestamps.find((b) => b.id === e.id)!
      assert.equal(e.reviewed_at?.getTime(), before.reviewed_at, '未选中事件 reviewed_at 应不变')
      assert.equal(e.closed_at?.getTime(), before.closed_at, '未选中事件 closed_at 应不变')
    }

    console.log('  ✅ 通过')
    passed++
  } catch (e: any) {
    console.log(`  ❌ 失败: ${e.message}`)
    failed++
  }

  // ---- Test 15: 批量忽略 ----
  console.log('Test 15: 批量忽略操作')
  try {
    const events = createTestEvents()
    const ids = ['evt_001', 'evt_002', 'evt_006']

    const { updatedEvents, result } = simulateExecuteBatchAction(
      events,
      ids,
      'ignore',
      '批量忽略：无需处理'
    )

    assert.equal(result.totalRequested, 3)
    assert.equal(result.successCount, 3)
    assert.equal(result.targetStatus, 'closed')

    for (const id of ids) {
      const event = updatedEvents.find((e) => e.id === id)!
      assert.equal(event.status, 'closed', `事件 ${id} 状态应为 closed`)
      assert.equal(event.review_note, '批量忽略：无需处理', `事件 ${id} 备注应正确`)
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
