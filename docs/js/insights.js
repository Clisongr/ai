// 自动洞察：对数据集做一轮全自动扫描，输出"数据体检报告"
import {
  aggregate, describe, fmt, pearson, pctChange, sum,
} from './stats.js';
import { groupBy } from './stats.js';

export function buildAutoInsights(dataset) {
  const { headers, rows, types } = dataset;
  const nums = headers.filter((h) => types[h] === 'number');
  const dims = headers.filter((h) => types[h] === 'string');
  const timeCol = headers.find((h) => /日期|时间|月份|month|date/i.test(h));
  const metric = nums[0];
  const insights = [];

  insights.push({
    icon: '📊',
    title: '数据规模',
    text: `共 ${rows.length} 行 × ${headers.length} 列，数值列 ${nums.length} 个、维度列 ${dims.length} 个，适合做汇总、对比与趋势分析。`,
  });

  if (metric) {
    const d = describe(rows.map((r) => Number(r[metric]) || 0));
    insights.push({
      icon: '🎯',
      title: '核心指标',
      text: `「${metric}」合计 ${fmt(d.sum)}，均值 ${fmt(d.mean)}，中位数 ${fmt(d.median)}，单笔最大值 ${fmt(d.max)}、最小值 ${fmt(d.min)}。`,
    });
  }

  if (dims.length && metric) {
    const dim = dims[0];
    const list = aggregate(rows, dim, metric, 'sum');
    const total = sum(list.map((l) => l.value));
    insights.push({
      icon: '🏆',
      title: `${dim} TOP`,
      text: `${list[0].name} 领先（${fmt(list[0].value)}，占比 ${fmt((list[0].value / total) * 100, 1)}%），其次是 ${list[1]?.name ?? '—'}（${fmt(list[1]?.value ?? 0)}）。`,
      ask: `哪个${dim}的${metric}最高？`,
    });
  }

  if (dims.length > 1 && metric) {
    const dim = dims[1];
    const list = aggregate(rows, dim, metric, 'sum');
    insights.push({
      icon: '🧩',
      title: `${dim}结构`,
      text: list.slice(0, 4).map((l) => `${l.name} ${fmt(l.value)}`).join('、') + `${list.length > 4 ? ` 等 ${list.length} 个` : ''}，头部板块 ${list[0].name} 占 ${fmt((list[0].value / sum(list.map((l) => l.value))) * 100, 1)}%。`,
      ask: `${dim}的${metric}占比如何？`,
    });
  }

  if (timeCol && metric) {
    const groups = groupBy(rows, (r) => {
      const v = String(r[timeCol] ?? '');
      const m = v.match(/(\d{4})[-/年](\d{1,2})/);
      return m ? `${m[1]}-${m[2].padStart(2, '0')}` : v;
    });
    const pts = [];
    groups.forEach((arr, name) => pts.push({ name, value: sum(arr.map((r) => Number(r[metric]) || 0)) }));
    pts.sort((a, b) => (a.name < b.name ? -1 : 1));
    const growth = pts.length > 1 ? pctChange(pts[pts.length - 1].value, pts[0].value) : null;
    const peak = pts.reduce((a, b) => (b.value > a.value ? b : a), pts[0]);
    insights.push({
      icon: '📈',
      title: '时间趋势',
      text: growth == null
        ? `按 ${timeCol} 观察，峰值在 ${peak.name}（${fmt(peak.value)}）。`
        : `首末周期${metric}${growth >= 0 ? '上升' : '下降'} ${fmt(Math.abs(growth), 1)}%，峰值出现在 ${peak.name}（${fmt(peak.value)}）。`,
      ask: `${metric}的月度趋势如何？`,
    });
  }

  if (nums.length >= 2) {
    let best = null;
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const pairs = rows.map((r) => [Number(r[nums[i]]), Number(r[nums[j]])]).filter(([a, b]) => isFinite(a) && isFinite(b));
        const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
        if (!best || Math.abs(r) > Math.abs(best.r)) best = { a: nums[i], b: nums[j], r };
      }
    }
    if (best) {
      insights.push({
        icon: '🔗',
        title: '最强关联',
        text: `「${best.a}」与「${best.b}」相关系数 r = ${best.r.toFixed(3)}，${Math.abs(best.r) > 0.6 ? '存在明显联动' : '线性联动不强'}，可下钻验证业务逻辑。`,
        ask: `${best.a}和${best.b}的相关性如何？`,
      });
    }
  }

  return insights;
}
