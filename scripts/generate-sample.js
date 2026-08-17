// 生成内置样例数据：24 个月零售订单（含季节性、增长趋势与少量异常）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 简单可复现随机数
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20240817);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const REGIONS = {
  华东: ['上海', '杭州', '南京', '苏州'],
  华北: ['北京', '天津', '石家庄', '太原'],
  华南: ['广州', '深圳', '厦门', '海口'],
  西南: ['成都', '重庆', '昆明', '贵阳'],
  华中: ['武汉', '长沙', '郑州', '南昌'],
  西北: ['西安', '兰州', '乌鲁木齐'],
  东北: ['沈阳', '大连', '哈尔滨'],
};

const CATEGORIES = [
  { name: '手机数码', base: 2600, margin: 0.16 },
  { name: '电脑办公', base: 3200, margin: 0.22 },
  { name: '家用电器', base: 2200, margin: 0.2 },
  { name: '服饰鞋包', base: 650, margin: 0.3 },
  { name: '食品生鲜', base: 180, margin: 0.14 },
  { name: '美妆个护', base: 420, margin: 0.34 },
];

const CHANNELS = ['线上', '线下'];

function seasonal(month) {
  // 双 11 / 618 / 春节 / 夏季
  let f = 1;
  if (month === 11) f *= 1.9;   // 双 11
  if (month === 6) f *= 1.45;   // 618
  if (month === 2) f *= 1.2;    // 春节备货
  if (month === 7 || month === 8) f *= 1.1;
  if (month === 12) f *= 1.3;   // 年末
  return f;
}

const rows = [];
const header = '日期,地区,城市,品类,渠道,销售额,销量,利润';

for (let y = 2023; y <= 2024; y++) {
  for (let m = 1; m <= 12; m++) {
    const monthIdx = (y - 2023) * 12 + m - 1; // 0..23
    const growth = 1 + monthIdx * 0.008;       // 缓慢增长
    const season = seasonal(m);
    const orders = 34 + Math.floor(rand() * 18) + (m === 11 ? 22 : 0);
    for (let i = 0; i < orders; i++) {
      const region = pick(Object.keys(REGIONS));
      const city = pick(REGIONS[region]);
      const cat = pick(CATEGORIES);
      const channel = pick(CHANNELS);
      const qty = 1 + Math.floor(rand() * 9);
      let sales = cat.base * (0.55 + rand() * 1.1) * season * growth * (channel === '线上' ? 0.95 : 1.05);
      // 注入一个明显异常：2024-03 华南家用电器 出现峰值
      if (y === 2024 && m === 3 && region === '华南' && cat.name === '家用电器' && i === 3) sales *= 7.5;
      sales = Math.round(sales / 10) * 10;
      const profit = Math.round(sales * cat.margin * (0.7 + rand() * 0.6));
      const day = 1 + Math.floor(rand() * 27);
      rows.push(`${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')},${region},${city},${cat.name},${channel},${sales},${qty},${profit}`);
    }
  }
}

const outPath = path.join(__dirname, '..', 'data', 'sample.csv');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, [header, ...rows].join('\n') + '\n', 'utf-8');
console.log(`已生成 ${rows.length} 行样例数据 -> ${outPath}`);
