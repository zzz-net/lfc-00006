import dayjs from 'dayjs';

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

function formatDate(d: dayjs.Dayjs): string {
  return d.format('YYYY-MM-DD HH:mm:ss');
}

export function generateSampleFiles(): {
  ticketsCSV: string;
  scoresCSV: string;
  refundsJSON: string;
  ticketsName: string;
  scoresName: string;
  refundsName: string;
} {
  const ticketsName = `sample_tickets_${Date.now()}.csv`;
  const scoresName = `sample_scores_${Date.now()}.csv`;
  const refundsName = `sample_refunds_${Date.now()}.json`;

  const baseTime = dayjs().subtract(30, 'day');

  const ticketRows: string[] = [
    'ticket_no,customer_id,title,content,category,created_at,resolved_at,status,agent_id',
  ];

  const categories = ['物流', '售后', '产品质量', '服务态度', '价格咨询'];
  const statuses = ['resolved', 'resolved', 'resolved', 'processing', 'pending'];
  const titles = ['快递一直未送达', '商品有破损', '收到假货要求赔偿', '客服态度恶劣', '申请退货退款', '承诺赠品未发', '下单后无法取消', '维修后再次损坏'];
  const contents = ['多次联系物流无回复', '外包装严重破损，内部零件外露', '扫码验证非正品，要求三倍赔偿', '态度敷衍不解决问题', '七天无理由退货被拒', '已补发但仍未收到', '系统显示已发货实际未发', '同一个问题反复出现'];



  const ticketConfigs = [
    { customer: 'C001', offsetHours: 0, resolveHours: 30, timeout: true, repeat: true },
    { customer: 'C001', offsetHours: 12, resolveHours: 2, timeout: false, repeat: true },
    { customer: 'C001', offsetHours: 20, resolveHours: 26, timeout: true, repeat: true },
    { customer: 'C001', offsetHours: 30, resolveHours: 3, timeout: false, repeat: true },
    { customer: 'C002', offsetHours: 5, resolveHours: 28, timeout: true, repeat: true },
    { customer: 'C002', offsetHours: 18, resolveHours: 4, timeout: false, repeat: true },
    { customer: 'C002', offsetHours: 25, resolveHours: 2, timeout: false, repeat: true },
    { customer: 'C003', offsetHours: 8, resolveHours: 32, timeout: true, repeat: true },
    { customer: 'C003', offsetHours: 40, resolveHours: 25, timeout: true, repeat: true },
    { customer: 'C004', offsetHours: 10, resolveHours: 5, timeout: false, repeat: false },
    { customer: 'C005', offsetHours: 15, resolveHours: 3, timeout: false, repeat: false },
    { customer: 'C006', offsetHours: 22, resolveHours: 0, timeout: false, repeat: false, unresolved: true },
    { customer: 'C007', offsetHours: 35, resolveHours: 4, timeout: false, repeat: false },
    { customer: 'C008', offsetHours: 45, resolveHours: 6, timeout: false, repeat: false },
    { customer: 'C004', offsetHours: 50, resolveHours: 2, timeout: false, repeat: false },
    { customer: 'C005', offsetHours: 55, resolveHours: 8, timeout: false, repeat: false },
    { customer: null, offsetHours: 60, resolveHours: 2, timeout: false, repeat: false, invalid: true },
    { customer: 'C006', offsetHours: 65, resolveHours: 0, timeout: false, repeat: false, missingTime: true },
    { customer: 'C007', offsetHours: 70, resolveHours: 10, timeout: false, repeat: false },
    { customer: 'C008', offsetHours: 75, resolveHours: 4, timeout: false, repeat: false },
  ];

  ticketConfigs.forEach((cfg, i) => {
    const ticketNo = 'T' + pad(i + 1, 5);
    const customer = cfg.customer || '';
    const catIdx = i % categories.length;
    const titleIdx = i % titles.length;
    const contentIdx = i % contents.length;
    const status = cfg.unresolved ? (i % 2 === 0 ? 'processing' : 'pending') : statuses[i % statuses.length];
    const created = baseTime.add(cfg.offsetHours, 'hour');
    const resolved = cfg.unresolved || cfg.missingTime ? '' : formatDate(created.add(cfg.resolveHours, 'hour'));
    const createdAt = cfg.missingTime ? '' : formatDate(created);
    const agentId = 'A' + pad(100 + (i % 10));
    ticketRows.push([ticketNo, customer, titles[titleIdx], contents[contentIdx], categories[catIdx], createdAt, resolved, status, agentId].join(','));
  });

  const ticketsCSV = ticketRows.join('\n');

  const scoreRows: string[] = ['customer_id,ticket_no,score,comment,visited_at'];
  const goodComments = ['服务很满意', '解决速度很快', '客服很耐心', '问题处理妥当', '非常感谢帮助'];
  const badComments = ['不满意处理结果', '等太久了', '问题未解决', '客服态度差', '浪费时间'];

  const scoreConfigs = [
    { customer: 'C001', ticket: 'T00001', score: 1, bad: true },
    { customer: 'C001', ticket: 'T00002', score: 2, bad: true },
    { customer: 'C001', ticket: 'T00003', score: 1, bad: true },
    { customer: 'C002', ticket: 'T00005', score: 2, bad: true },
    { customer: 'C002', ticket: 'T00006', score: 5, bad: false },
    { customer: 'C003', ticket: 'T00008', score: 1, bad: true },
    { customer: 'C003', ticket: 'T00009', score: 2, bad: true },
    { customer: 'C004', ticket: 'T00010', score: 5, bad: false },
    { customer: 'C005', ticket: 'T00011', score: 4, bad: false },
    { customer: 'C007', ticket: 'T00013', score: 4, bad: false },
    { customer: 'C008', ticket: 'T00014', score: 5, bad: false },
    { customer: '', ticket: 'T00015', score: 3, bad: false, invalid: true },
    { customer: 'C006', ticket: 'T00012', score: 99, bad: false, invalidScore: true },
    { customer: 'C004', ticket: 'T00015', score: 5, bad: false },
    { customer: 'C005', ticket: 'T00016', score: 2, bad: true },
  ];

  scoreConfigs.forEach((cfg, i) => {
    const comment = cfg.bad ? badComments[i % badComments.length] : goodComments[i % goodComments.length];
    const visitedAt = formatDate(baseTime.add(100 + i * 2, 'hour'));
    const score = cfg.score;
    scoreRows.push([cfg.customer, cfg.ticket, score, comment, visitedAt].join(','));
  });

  const scoresCSV = scoreRows.join('\n');

  const refunds: { refund_no: string; customer_id: string; order_no: string; amount: number; reason: string; refunded_at: string }[] = [];
  const reasons = ['商品质量问题', '七天无理由', '发错货', '漏发商品', '虚假宣传', '物流丢失'];

  const refundConfigs = [
    { customer: 'C001', amount: 899, high: true, order: 'O20240101' },
    { customer: 'C001', amount: 1200, high: true, order: 'O20240102' },
    { customer: 'C002', amount: 650, high: true, order: 'O20240103' },
    { customer: 'C003', amount: 720, high: true, order: 'O20240104' },
    { customer: 'C003', amount: -100, negative: true, order: 'O20240105' },
    { customer: 'C004', amount: 150, high: false, order: 'O20240106' },
    { customer: 'C005', amount: 88, high: false, order: 'O20240107' },
    { customer: 'C006', amount: 260, high: false, order: 'O20240108' },
    { customer: 'C007', amount: 45, high: false, order: 'O20240109' },
    { customer: 'C008', amount: 580, high: true, order: 'O20240110' },
  ];

  refundConfigs.forEach((cfg, i) => {
    refunds.push({
      refund_no: 'R' + pad(i + 1, 6),
      customer_id: cfg.customer,
      order_no: cfg.order,
      amount: cfg.amount,
      reason: reasons[i % reasons.length],
      refunded_at: formatDate(baseTime.add(200 + i * 5, 'hour')),
    });
  });

  const refundsJSON = JSON.stringify(refunds, null, 2);

  return {
    ticketsCSV,
    scoresCSV,
    refundsJSON,
    ticketsName,
    scoresName,
    refundsName,
  };
}
