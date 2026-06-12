import type { CustomerTicket, VisitScore, Refund, ImportRecord, ImportError, ImportResult } from '@/types';
import { uid, parseCSV, hashFile, validateTicket, validateScore, validateRefund, parseDate } from '@/utils';

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function importTicketsFile(
  file: File,
  existingTickets: CustomerTicket[]
): Promise<ImportResult & { newTickets: CustomerTicket[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const importErrors: ImportError[] = [];
  let fileHash = '';

  try {
    fileHash = await hashFile(file);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('文件哈希计算失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'ticket',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: '',
      imported_at: new Date(),
      errors: [],
    };
    return { newTickets: [], record, success: false, warnings, errors };
  }

  const existingTicketNos = new Set(existingTickets.map(t => t.ticket_no));
  let csvText = '';
  try {
    csvText = await readFileAsText(file);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('文件读取失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'ticket',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: fileHash,
      imported_at: new Date(),
      errors: [],
    };
    return { newTickets: [], record, success: false, warnings, errors };
  }

  let rows: { [key: string]: unknown }[] = [];
  try {
    rows = parseCSV(csvText) as { [key: string]: unknown }[];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('CSV解析失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'ticket',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: fileHash,
      imported_at: new Date(),
      errors: [],
    };
    return { newTickets: [], record, success: false, warnings, errors };
  }

  const newTickets: CustomerTicket[] = [];
  let validCount = 0;
  let invalidCount = 0;

  rows.forEach((row, idx) => {
    (row as { __line?: number }).__line = idx + 2;
    const r = row as Record<string, unknown>;
    const check = validateTicket(r);
    if (!check.valid) {
      invalidCount++;
      check.errors.forEach(e => importErrors.push(e));
      check.errors.forEach(e => errors.push(`第${idx + 2}行[${e.field}]: ${e.message}`));
      return;
    }
    if (existingTicketNos.has(String(r.ticket_no))) {
      warnings.push(`第${idx + 2}行: ticket_no ${r.ticket_no} 已存在，跳过`);
      invalidCount++;
      return;
    }
    const created = parseDate(String(r.created_at))!;
    const resolved = r.resolved_at ? parseDate(String(r.resolved_at)) : null;
    const ticket: CustomerTicket = {
      id: uid(),
      source_file: file.name,
      ticket_no: String(r.ticket_no).trim(),
      customer_id: String(r.customer_id).trim(),
      title: String(r.title || '').trim(),
      content: String(r.content || '').trim(),
      category: String(r.category || '').trim(),
      created_at: created,
      resolved_at: resolved,
      status: String(r.status || '').trim(),
      agent_id: String(r.agent_id || '').trim(),
    };
    existingTicketNos.add(ticket.ticket_no);
    newTickets.push(ticket);
    validCount++;
  });

  const record: ImportRecord = {
    id: uid(),
    file_name: file.name,
    file_type: 'ticket',
    total_count: rows.length,
    valid_count: validCount,
    invalid_count: invalidCount,
    file_hash: fileHash,
    imported_at: new Date(),
    errors: importErrors,
  };
  return { newTickets, record, success: errors.length === 0, warnings, errors };
}

export async function importScoresFile(
  file: File,
  existingScores: VisitScore[]
): Promise<{ newScores: VisitScore[]; record: ImportRecord; success: boolean; warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const importErrors: ImportError[] = [];
  let fileHash = '';

  try {
    fileHash = await hashFile(file);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('文件哈希计算失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'score',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: '',
      imported_at: new Date(),
      errors: [],
    };
    return { newScores: [], record, success: false, warnings, errors };
  }

  const existingKeys = new Set(existingScores.map(s => `${s.customer_id}_${s.ticket_no}_${s.visited_at.getTime()}`));
  let csvText = '';
  try {
    csvText = await readFileAsText(file);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('文件读取失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'score',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: fileHash,
      imported_at: new Date(),
      errors: [],
    };
    return { newScores: [], record, success: false, warnings, errors };
  }

  let rows: { [key: string]: unknown }[] = [];
  try {
    rows = parseCSV(csvText) as { [key: string]: unknown }[];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('CSV解析失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'score',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: fileHash,
      imported_at: new Date(),
      errors: [],
    };
    return { newScores: [], record, success: false, warnings, errors };
  }

  const newScores: VisitScore[] = [];
  let validCount = 0;
  let invalidCount = 0;

  rows.forEach((row, idx) => {
    (row as { __line?: number }).__line = idx + 2;
    const r = row as Record<string, unknown>;
    const check = validateScore(r);
    if (!check.valid) {
      invalidCount++;
      check.errors.forEach(e => importErrors.push(e));
      check.errors.forEach(e => errors.push(`第${idx + 2}行[${e.field}]: ${e.message}`));
      return;
    }
    const visited = parseDate(String(r.visited_at))!;
    const key = `${String(r.customer_id).trim()}_${String(r.ticket_no || '').trim()}_${visited.getTime()}`;
    if (existingKeys.has(key)) {
      warnings.push(`第${idx + 2}行: 评分记录重复，跳过`);
      invalidCount++;
      return;
    }
    const score: VisitScore = {
      id: uid(),
      source_file: file.name,
      customer_id: String(r.customer_id).trim(),
      ticket_no: String(r.ticket_no || '').trim(),
      score: Number(r.score),
      comment: String(r.comment || '').trim(),
      visited_at: visited,
    };
    existingKeys.add(key);
    newScores.push(score);
    validCount++;
  });

  const record: ImportRecord = {
    id: uid(),
    file_name: file.name,
    file_type: 'score',
    total_count: rows.length,
    valid_count: validCount,
    invalid_count: invalidCount,
    file_hash: fileHash,
    imported_at: new Date(),
    errors: importErrors,
  };
  return { newScores, record, success: errors.length === 0, warnings, errors };
}

export async function importRefundsFile(
  file: File,
  existingRefunds: Refund[],
  existingImportRecords: ImportRecord[]
): Promise<{ newRefunds: Refund[]; record?: ImportRecord; success: boolean; warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const importErrors: ImportError[] = [];
  let fileHash = '';

  try {
    fileHash = await hashFile(file);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('文件哈希计算失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'refund',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: '',
      imported_at: new Date(),
      errors: [],
    };
    return { newRefunds: [], record, success: false, warnings, errors };
  }

  const duplicate = existingImportRecords.find(r => r.file_type === 'refund' && r.file_hash === fileHash);
  if (duplicate) {
    errors.push(`该退款文件已导入过(记录ID: ${duplicate.id})，拒绝重复导入`);
    return { newRefunds: [], success: false, warnings, errors };
  }

  const existingRefundNos = new Set(existingRefunds.map(r => r.refund_no));
  let jsonText = '';
  try {
    jsonText = await readFileAsText(file);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('文件读取失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'refund',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: fileHash,
      imported_at: new Date(),
      errors: [],
    };
    return { newRefunds: [], record, success: false, warnings, errors };
  }

  let rows: { [key: string]: unknown }[] = [];
  try {
    rows = JSON.parse(jsonText);
    if (!Array.isArray(rows)) {
      throw new Error('退款JSON应为对象数组');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push('JSON解析失败: ' + msg);
    const record: ImportRecord = {
      id: uid(),
      file_name: file.name,
      file_type: 'refund',
      total_count: 0,
      valid_count: 0,
      invalid_count: 0,
      file_hash: fileHash,
      imported_at: new Date(),
      errors: [],
    };
    return { newRefunds: [], record, success: false, warnings, errors };
  }

  const newRefunds: Refund[] = [];
  let validCount = 0;
  let invalidCount = 0;

  rows.forEach((row, idx) => {
    (row as { __line?: number }).__line = idx + 1;
    const r = row as Record<string, unknown>;
    const check = validateRefund(r);
    if (!check.valid) {
      invalidCount++;
      check.errors.forEach(e => importErrors.push(e));
      check.errors.forEach(e => errors.push(`第${idx + 1}条[${e.field}]: ${e.message}`));
      return;
    }
    if (existingRefundNos.has(String(r.refund_no))) {
      warnings.push(`第${idx + 1}条: refund_no ${r.refund_no} 已存在，跳过`);
      invalidCount++;
      return;
    }
    const refundedAt = parseDate(String(r.refunded_at))!;
    const refund: Refund = {
      id: uid(),
      source_file: file.name,
      file_hash: fileHash,
      refund_no: String(r.refund_no).trim(),
      customer_id: String(r.customer_id).trim(),
      order_no: String(r.order_no || '').trim(),
      amount: Number(r.amount),
      reason: String(r.reason || '').trim(),
      refunded_at: refundedAt,
    };
    existingRefundNos.add(refund.refund_no);
    newRefunds.push(refund);
    validCount++;
  });

  const record: ImportRecord = {
    id: uid(),
    file_name: file.name,
    file_type: 'refund',
    total_count: rows.length,
    valid_count: validCount,
    invalid_count: invalidCount,
    file_hash: fileHash,
    imported_at: new Date(),
    errors: importErrors,
  };
  return { newRefunds, record, success: errors.length === 0, warnings, errors };
}
