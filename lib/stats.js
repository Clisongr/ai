// 纯统计计算库：描述统计、聚合、相关、回归、异常检测

export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
export const mean = (arr) => (arr.length ? sum(arr) / arr.length : 0);

export function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(sum(arr.map((v) => (v - m) ** 2)) / (arr.length - 1));
}

export function min(arr) { return arr.length ? Math.min(...arr) : 0; }
export function max(arr) { return arr.length ? Math.max(...arr) : 0; }

export function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

export function describe(arr) {
  const a = arr.filter((v) => typeof v === 'number' && isFinite(v));
  if (!a.length) return null;
  return {
    count: a.length,
    sum: sum(a),
    mean: mean(a),
    median: median(a),
    std: stddev(a),
    min: min(a),
    max: max(a),
    q1: quantile(a, 0.25),
    q3: quantile(a, 0.75),
  };
}

export function fmt(n, digits = 2) {
  if (n == null || !isFinite(n)) return '—';
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(digits) + ' 亿';
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(digits) + ' 万';
  return Number(n.toFixed(digits)).toLocaleString('zh-CN');
}

export function groupBy(rows, keyFn) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return map;
}

export function aggregate(rows, key, value, agg = 'sum') {
  const groups = groupBy(rows, (r) => String(r[key]));
  const out = [];
  groups.forEach((arr, name) => {
    const nums = arr.map((r) => Number(r[value]) || 0);
    let v;
    if (agg === 'sum') v = sum(nums);
    else if (agg === 'mean') v = mean(nums);
    else if (agg === 'count') v = nums.length;
    else if (agg === 'median') v = median(nums);
    else v = sum(nums);
    out.push({ name, value: v, count: arr.length });
  });
  return out.sort((a, b) => b.value - a.value);
}

export function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return 0;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

export function linearRegression(xs, ys) {
  if (xs.length < 2) return null;
  const n = xs.length;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  return { slope, intercept };
}

export function zscoreAnomalies(arr, threshold = 2.5) {
  const a = arr.filter((v) => typeof v === 'number' && isFinite(v));
  if (a.length < 5) return [];
  const m = mean(a), s = stddev(a);
  if (s === 0) return [];
  return a.map((v, i) => ({ index: i, value: v, z: (v - m) / s }))
    .filter((o) => Math.abs(o.z) > threshold)
    .sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
}

export function pctChange(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}
