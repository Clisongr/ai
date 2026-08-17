// 自然语言分析引擎：识别提问意图 -> 解析字段 -> 真实统计计算 -> 生成结论与图表
import {
  aggregate, describe, fmt, groupBy, pearson,
  pctChange, sum, zscoreAnomalies, linearRegression,
} from './stats.js';

const METRIC_SYNONYMS = {
  '销售额': ['销售额', '销售', '收入', '营收', '金额', 'sales', 'revenue', 'amount', 'gmv', '营业额'],
  '销量': ['销量', '销售数量', '数量', '件数', '份数', 'quantity', 'units', 'qty', 'count'],
  '利润': ['利润', '盈利', '毛利', '净利润', 'profit', 'margin', 'earnings'],
  '成本': ['成本', '费用', 'cost', 'expense'],
  '单价': ['单价', '价格', '均价', 'price', 'unitprice'],
};

const DIM_SYNONYMS = {
  '地区': ['地区', '区域', '大区', '地域', 'region', 'area'],
  '城市': ['城市', '市', '城市名', 'city'],
  '品类': ['品类', '类别', '分类', '商品', '产品', '类目', 'category', 'product', 'type', '种类'],
  '渠道': ['渠道', '平台', '销售渠道', 'channel', 'platform', '途径'],
  '日期': ['日期', '时间', '月份', '月份日期', '月', 'date', 'time', 'month', 'day'],
  '客户': ['客户', '顾客', '会员', 'user', 'customer', 'client'],
  '员工': ['员工', '销售员', '人员', 'salesperson', 'staff', 'employee'],
};

const INTENT_RULES = [
  {
    intent: 'forecast',
    keywords: ['预测', '未来', '下个', '下月', '下季度', '下一季', '预估', '前瞻', 'forecast', 'predict', 'future', 'next month', 'next quarter', 'projection'],
    label: '预测',
  },
  {
    intent: 'trend',
    keywords: ['趋势', '走势', '变化', '增长', '下降', '上升', '波动', '月度', '按月', '随时间', 'trend', 'growth', 'over time', 'monthly', 'increase', 'decrease', '涨跌', '环比', '同比'],
    label: '趋势',
  },
  {
    intent: 'correlation',
    keywords: ['相关', '关系', '关联', '影响', 'correlation', 'relat', 'affect', '正比', '反比', '联动'],
    label: '相关性',
  },
  {
    intent: 'distribution',
    keywords: ['占比', '比例', '构成', '分布', '份额', 'share', 'proportion', 'percentage', 'pie', '结构'],
    label: '占比',
  },
  {
    intent: 'anomaly',
    keywords: ['异常', '离群', '异常值', 'outlier', 'anomal', '突增', '暴跌', '大起大落', '异动'],
    label: '异常检测',
  },
  {
    intent: 'ranking',
    keywords: ['最高', '最低', '排行', '排名', '排名前', '前几', 'top', '最大', '最小', '领先', '第一', '首位', '谁', '哪个', '对比', '比较', '冠军', '榜首', '垫底', '最后'],
    label: '对比排行',
  },
  {
    intent: 'overview',
    keywords: ['概况', '总结', '概述', '总览', '总体', '整体', '概览', 'summary', 'overview', '分析一下', '介绍一下', '怎么样', '如何'],
    label: '整体分析',
  },
];

function normalize(s) {
  return s.toLowerCase().replace(/[，。！？、,.!?;；:：'"“”‘’()（）\s]+/g, ' ').trim();
}

function matchColumn(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h === cand.toLowerCase() || h.includes(cand.toLowerCase()) || cand.toLowerCase().includes(h));
    if (idx >= 0) return headers[idx];
  }
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h.includes(cand.toLowerCase()));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function resolveMetric(headers, q, types) {
  for (const [canon, syns] of Object.entries(METRIC_SYNONYMS)) {
    if (q.some((token) => syns.some((s) => token.includes(s)) || syns.some((s) => s.includes(token) && token.length >= 2))) {
      const col = matchColumn(headers, [canon, ...syns]);
      if (col && types[col] === 'number') return col;
    }
  }
  return headers.find((h) => types[h] === 'number') || null;
}

function resolveDimension(headers, q, types, opts = {}) {
  const { timeOnly = false, skipTime = null } = opts;
  for (const [canon, syns] of Object.entries(DIM_SYNONYMS)) {
    if (timeOnly && canon !== '日期') continue;
    if (q.some((token) => syns.some((s) => token.includes(s)))) {
      const col = matchColumn(headers, [canon, ...syns]);
      if (col && (!timeOnly || types[col] === 'string')) return col;
    }
  }
  if (!timeOnly) {
    const dims = headers.filter((h) => types[h] === 'string' && h !== skipTime);
    return dims.length ? dims[0] : null;
  }
  return null;
}

function resolveMetricPair(headers, q, types) {
  const found = [];
  for (const [canon, syns] of Object.entries(METRIC_SYNONYMS)) {
    if (q.some((token) => syns.some((s) => token.includes(s)))) {
      const col = matchColumn(headers, [canon, ...syns]);
      if (col && types[col] === 'number' && !found.includes(col)) found.push(col);
      if (found.length >= 2) break;
    }
  }
  const nums = headers.filter((h) => types[h] === 'number');
  for (const h of nums) {
    if (!found.includes(h)) { found.push(h); if (found.length >= 2) break; }
  }
  return found;
}

function findTimeColumn(headers, rows) {
  const timeHints = ['日期', '时间', '月份', 'month', 'date', 'time', 'day'];
  const hit = headers.find((h) => timeHints.some((t) => h.toLowerCase().includes(t)));
  if (hit) return hit;
  for (const h of headers) {
    const sample = rows.slice(0, 30).map((r) => String(r[h])).filter(Boolean);
    const dateish = sample.filter((v) => /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?$/.test(v) || /^\d{4}年\d{1,2}月/.test(v));
    if (sample.length > 0 && dateish.length / sample.length > 0.7) return h;
  }
  return null;
}

function detectIntent(q) {
  for (const rule of INTENT_RULES) {
    if (rule.keywords.some((k) => q.includes(k.toLowerCase()))) return rule.intent;
  }
  return 'overview';
}

function bucketTime(row, timeCol, granularity) {
  const v = String(row[timeCol] ?? '');
  const m = v.match(/(\d{4})[-/年](\d{1,2})/);
  if (m) {
    const y = m[1], mo = m[2].padStart(2, '0');
    if (granularity === 'quarter') return `${y}-Q${Math.ceil(Number(mo) / 3)}`;
    return `${y}-${mo}`;
  }
  return v;
}

function trendAnalysis(rows, timeCol, metric, granularity = 'month') {
  const groups = groupBy(rows, (r) => bucketTime(r, timeCol, granularity));
  const pts = [];
  groups.forEach((arr, name) => {
    pts.push({ name, value: sum(arr.map((r) => Number(r[metric]) || 0)) });
  });
  pts.sort((a, b) => (a.name < b.name ? -1 : 1));
  return pts;
}

function forecastSeries(pts, periods = 3) {
  if (pts.length < 3) return null;
  const xs = pts.map((_, i) => i);
  const ys = pts.map((p) => p.value);
  const reg = linearRegression(xs, ys);
  if (!reg) return null;
  const out = [];
  for (let i = 1; i <= periods; i++) {
    const x = pts.length - 1 + i;
    out.push({ name: `预测+${i}期`, value: Math.max(0, reg.intercept + reg.slope * x) });
  }
  return out;
}

function rankingAnalysis(rows, dim, metric, topN = 8) {
  return aggregate(rows, dim, metric, 'sum').slice(0, topN);
}

function distributionAnalysis(rows, dim, metric) {
  return aggregate(rows, dim, metric, 'sum');
}

function correlationAnalysis(rows, m1, m2) {
  const pairs = rows
    .map((r) => [Number(r[m1]), Number(r[m2])])
    .filter(([a, b]) => isFinite(a) && isFinite(b));
  const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  return { points: pairs, r };
}

function pickGranularity(q) {
  if (/季度|季|quarter/i.test(q)) return 'quarter';
  return 'month';
}

function describeStrength(r) {
  const abs = Math.abs(r);
  if (abs >= 0.8) return r > 0 ? '强正相关' : '强负相关';
  if (abs >= 0.5) return r > 0 ? '中等正相关' : '中等负相关';
  if (abs >= 0.3) return r > 0 ? '弱正相关' : '弱负相关';
  return '相关性很弱';
}

function buildAnswer(intent, meta) {
  const P = [];
  switch (intent) {
    case 'trend': {
      const { metric, pts, growth } = meta;
      const peak = pts.reduce((a, b) => (b.value > a.value ? b : a), pts[0]);
      const trough = pts.reduce((a, b) => (b.value < a.value ? b : a), pts[0]);
      P.push(`「${metric}」按时间聚合后共 ${pts.length} 个周期，整体呈${growth >= 0 ? '上升' : '下降'}态势（累计变化 ${growth >= 0 ? '+' : ''}${fmt(growth, 1)}%）。`);
      P.push(`峰值出现在 ${peak.name}，达 ${fmt(peak.value)}；低谷在 ${trough.name}，为 ${fmt(trough.value)}，峰谷差 ${fmt(peak.value - trough.value)}（${fmt(((peak.value - trough.value) / (trough.value || 1)) * 100, 1)}%）。`);
      break;
    }
    case 'forecast': {
      const { metric, pts, forecast, slopePct } = meta;
      P.push(`基于历史 ${pts.length} 期的线性回归外推，未来 3 期「${metric}」预计分别为 ${forecast.map((f) => `${f.name} ${fmt(f.value)}`).join('、')}。`);
      P.push(slopePct >= 0
        ? `趋势斜率表明每个周期平均增长约 ${fmt(Math.abs(slopePct), 1)}%，业务处于上行通道。`
        : `趋势斜率表明每个周期平均下降约 ${fmt(Math.abs(slopePct), 1)}%，建议关注下滑原因。`);
      P.push('⚠️ 说明：此为基础统计外推，仅作趋势参考，未纳入季节性与外部因素。');
      break;
    }
    case 'ranking': {
      const { metric, dim, list, top, bottom } = meta;
      P.push(`按「${dim}」汇总「${metric}」，${top.name} 最高（${fmt(top.value)}，占比 ${fmt((top.value / list[0].total) * 100, 1)}%），${bottom.name} 最低（${fmt(bottom.value)}）。`);
      P.push(`前 3 名合计 ${fmt(list.slice(0, 3).reduce((a, b) => a + b.value, 0))}，占总量 ${fmt((list.slice(0, 3).reduce((a, b) => a + b.value, 0) / (list[0].total || 1)) * 100, 1)}%。`);
      break;
    }
    case 'distribution': {
      const { metric, dim, list, total } = meta;
      P.push(`「${metric}」在「${dim}」上的分布：${list.slice(0, 4).map((d) => `${d.name} ${fmt(d.value)}（${fmt((d.value / total) * 100, 1)}%）`).join('、')}${list.length > 4 ? ' 等' : ''}。`);
      P.push(`最大板块 ${list[0].name} 占 ${fmt((list[0].value / total) * 100, 1)}%，${list[0].value / total > 0.5 ? '结构相对集中，注意单一依赖风险' : '结构相对均衡'}。`);
      break;
    }
    case 'correlation': {
      const { m1, m2, r } = meta;
      P.push(`「${m1}」与「${m2}」的 Pearson 相关系数 r = ${r.toFixed(3)}，呈${describeStrength(r)}。`);
      P.push(r > 0.6
        ? '两者联动明显：一个指标走强时另一个通常同步走强，可考虑统一经营策略。'
        : r < -0.6
          ? '两者呈明显反向关系：一个上升往往伴随另一个下降，需注意此消彼长的权衡。'
          : '两者没有稳定的线性联动，不能简单用其中一个预测另一个。');
      break;
    }
    case 'anomaly': {
      const { metric, anomalies } = meta;
      if (!anomalies.length) {
        P.push(`按月检测「${metric}」，未发现显著离群点（|z| > 2.5），数据波动在正常统计范围内。`);
      } else {
        P.push(`按月检测「${metric}」，发现 ${anomalies.length} 个显著异常点（|z| > 2.5）：${anomalies.map((a) => `${a.name}（${fmt(a.value)}，z=${a.z.toFixed(1)}）`).join('、')}。`);
        P.push('建议优先复盘这些异常周期的业务动作或数据口径，判断是真实波动还是录入问题。');
      }
      break;
    }
    case 'overview':
    default: {
      const { rows, headers, stats, topDim, topName, total, growth } = meta;
      P.push(`数据集共 ${rows.length} 行 × ${headers.length} 列。核心指标：「${stats.metric}」合计 ${fmt(total)}，均值 ${fmt(stats.mean)}，中位数 ${fmt(stats.median)}。`);
      P.push(`按「${topDim}」看，${topName} 贡献最大（${fmt(stats.topValue)}，占比 ${fmt((stats.topValue / total) * 100, 1)}%）。`);
      if (growth != null) P.push(`整体${growth >= 0 ? '呈上升趋势' : '呈下降趋势'}（${growth >= 0 ? '+' : ''}${fmt(growth, 1)}%），建议结合下方图表进一步下钻。`);
      break;
    }
  }
  return P;
}

function buildChart(intent, meta) {
  switch (intent) {
    case 'trend':
    case 'forecast':
      return {
        kind: 'line',
        x: meta.pts.map((p) => p.name),
        series: [{ name: meta.metric, data: meta.pts.map((p) => Math.round(p.value * 100) / 100) }],
        forecast: meta.forecast
          ? { x: meta.forecast.map((f) => f.name), data: meta.forecast.map((f) => Math.round(f.value * 100) / 100) }
          : null,
      };
    case 'ranking':
      return {
        kind: 'bar',
        x: meta.list.map((d) => d.name),
        data: meta.list.map((d) => Math.round(d.value * 100) / 100),
        horizontal: true,
      };
    case 'distribution':
      return {
        kind: 'pie',
        data: meta.list.map((d) => ({ name: d.name, value: Math.round(d.value * 100) / 100 })),
      };
    case 'correlation':
      return {
        kind: 'scatter',
        xLabel: meta.m1,
        yLabel: meta.m2,
        r: meta.r,
        data: meta.points.slice(0, 800).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]),
      };
    case 'anomaly':
      return {
        kind: 'line',
        x: meta.pts.map((p) => p.name),
        series: [{ name: meta.metric, data: meta.pts.map((p) => Math.round(p.value * 100) / 100) }],
        anomalyPoints: meta.anomalies.map((a) => [meta.pts.findIndex((p) => p.name === a.name), Math.round(a.value * 100) / 100]),
      };
    case 'overview':
    default:
      return {
        kind: 'stats',
        stats: meta.stats.cards,
        top: meta.stats.top,
        total: meta.total,
      };
  }
}

export function analyzeQuestion(question, dataset) {
  const { headers, rows, types } = dataset;
  const q = normalize(question);
  const qTokens = q.split(' ').filter(Boolean);
  const intent = detectIntent(q);

  const timeCol = findTimeColumn(headers, rows);
  const metric = resolveMetric(headers, qTokens, types);
  const granularity = pickGranularity(q);

  let meta = {};
  let usedCols = [];

  if (intent === 'correlation') {
    const [m1, m2] = resolveMetricPair(headers, qTokens, types);
    const corr = correlationAnalysis(rows, m1, m2);
    meta = { m1, m2, ...corr };
    usedCols = [m1, m2];
  } else if (intent === 'anomaly') {
    const pts = trendAnalysis(rows, timeCol, metric, granularity);
    const anomalies = zscoreAnomalies(pts.map((p) => p.value)).map((a) => ({ ...pts[a.index], z: a.z }));
    meta = { metric, pts, anomalies };
    usedCols = [timeCol, metric];
  } else if (intent === 'trend' || intent === 'forecast') {
    const pts = trendAnalysis(rows, timeCol, metric, granularity);
    const growth = pts.length > 1 ? pctChange(pts[pts.length - 1].value, pts[0].value) : null;
    const forecast = intent === 'forecast' ? forecastSeries(pts, 3) : null;
    const xs = pts.map((_, i) => i);
    const reg = linearRegression(xs, pts.map((p) => p.value));
    const slopePct = reg && pts[0].value ? (reg.slope / pts[0].value) * 100 : null;
    meta = { metric, pts, growth, forecast, slopePct };
    usedCols = [timeCol, metric];
  } else if (intent === 'ranking') {
    const dim = resolveDimension(headers, qTokens, types, { skipTime: timeCol });
    const list = rankingAnalysis(rows, dim, metric);
    const total = sum(list.map((d) => d.value));
    meta = { metric, dim, list: list.map((d) => ({ ...d, total })), top: list[0], bottom: list[list.length - 1] };
    usedCols = [dim, metric];
  } else if (intent === 'distribution') {
    const dim = resolveDimension(headers, qTokens, types, { skipTime: timeCol });
    const list = distributionAnalysis(rows, dim, metric);
    const total = sum(list.map((d) => d.value));
    meta = { metric, dim, list, total };
    usedCols = [dim, metric];
  } else {
    const d = describe(rows.map((r) => Number(r[metric]) || 0));
    const dim = resolveDimension(headers, qTokens, types, { skipTime: timeCol });
    const top = rankingAnalysis(rows, dim, metric)[0];
    const total = d.sum;
    const cards = [
      { label: '总' + metric, value: fmt(total) },
      { label: '平均', value: fmt(d.mean) },
      { label: '中位数', value: fmt(d.median) },
      { label: '标准差', value: fmt(d.std) },
      { label: '最小值', value: fmt(d.min) },
      { label: '最大值', value: fmt(d.max) },
    ];
    let growth = null;
    if (timeCol) {
      const pts = trendAnalysis(rows, timeCol, metric, granularity);
      if (pts.length > 1) growth = pctChange(pts[pts.length - 1].value, pts[0].value);
    }
    meta = {
      rows, headers, metric, dim,
      stats: {
        metric,
        mean: d.mean,
        median: d.median,
        topValue: top?.value ?? 0,
        top,
        cards,
      },
      topDim: dim,
      topName: top?.name ?? '—',
      total,
      growth,
    };
    usedCols = [dim, metric];
  }

  const paragraphs = buildAnswer(intent, meta);
  const chart = buildChart(intent, meta);

  return {
    intent,
    intentLabel: INTENT_RULES.find((r) => r.intent === intent)?.label || '分析',
    question,
    columns: usedCols.filter(Boolean),
    paragraphs,
    chart,
    ts: Date.now(),
  };
}
