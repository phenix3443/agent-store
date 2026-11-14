/* 价格与权益：数值与 packages/types/src/pricing.ts 的 PRICING 一致，权益文字取自定价页文案。 */
window.AS_PLANS = {
  trialDays: 14,
  periods: {
    monthly: { amount: 9.99, text: '$9.99' },
    yearly: { amount: 99, text: '$99' },
    lifetime: { amount: 199, text: '$199' }
  },
  /* 权益文字：[中文, English]。中文与定价页现有文案一致。 */
  free: [['浏览、搜索、安装全部资源', 'Browse, search and install everything'], ['本地代理：按 Level 转发、失败自动降级', 'Local relay: Level-based routing with automatic failover'], ['用量仪表盘', 'Usage dashboard']],
  pro: [['Free 的全部功能', 'Everything in Free'], ['预算与超支告警', 'Budget and overspend alerts'], ['用量分析与账单导出', 'Usage analytics and billing export'], ['智能路由（规划中）', 'Smart routing (planned)', 1], ['多 Key 轮换（规划中）', 'Multi-key rotation (planned)', 1]],
  lifetime: [['Pro 的全部本地功能', 'All local Pro features'], ['一次付清，永久使用', 'Pay once, use forever'], ['没有订阅和月费', 'No subscription or monthly fee']],
  /* 渲染成 <li> 列表；规划中的条目图标变灰 */
  list: function (items, icon) { return items.map(function (f) { return '<li' + (f[2] ? ' class="plan-soon"' : '') + '>' + icon + '<span>' + window.pick(f) + '</span></li>'; }).join(''); },
  date: function (ts) { var d = new Date(ts); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); },
  /* 下一次扣款或到期的日期；买断返回 null */
  nextDate: function (plan) {
    if (!plan || plan.period === 'lifetime' || !plan.since) return null;
    var d = new Date(plan.since);
    if (plan.trial) d.setDate(d.getDate() + 14); else if (plan.period === 'yearly') d.setFullYear(d.getFullYear() + 1); else d.setMonth(d.getMonth() + 1);
    return this.date(d.getTime());
  }
};
