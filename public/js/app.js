/* 智析 · AI 数据自由分析台 前端逻辑 */

const state = { charts: [], dataset: null };
const COLORS = ['#22d3ee', '#818cf8', '#c084fc', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#fb7185', '#4ade80'];
const INTENT_LABELS = {
  trend: '📈 趋势分析', forecast: '🔮 预测外推', ranking: '🏆 对比排行',
  distribution: '🥧 占比分布', correlation: '🔗 相关性', anomaly: '⚠️ 异常检测',
  overview: '📊 整体分析',
};

const PROMPTS = [
  '哪个地区的销售额最高？',
  '各品类销售额占比如何？',
  '销售额的月度趋势怎么样？',
  '预测未来三个月的销售额',
  '销售额和利润的相关性如何？',
  '销售额有哪些异常月份？',
  '帮我做一个整体分析',
];

const HINTS = ['趋势', '预测', '占比', '排行', '相关性', '异常'];

const $ = (id) => document.getElementById(id);
const chat = $('chat');

/* ---------- 工具 ---------- */
let API_BASE = '';
let APP_CONFIG = null;

async function resolveApiBase() {
  // 页面由服务端提供时，/api/config 相对路径即可拿到真实地址；
  // 直接双击 HTML（file://）或从其他端口预览时，回退到默认 3000 端口。
  try {
    const res = await fetch('/api/config', { signal: AbortSignal.timeout(3000) });
    APP_CONFIG = await res.json();
    API_BASE = APP_CONFIG.base || 'http://localhost:3000';
  } catch {
    API_BASE = 'http://localhost:3000';
  }
}

function ensureEcharts() {
  return new Promise((resolve) => {
    if (window.echarts) return resolve();
    const s = document.createElement('script');
    s.src = `${API_BASE}/vendor/echarts.min.js`;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch (e) {
    $('netBanner').hidden = false;
    throw new Error('无法连接分析服务，请通过 http://localhost:3000 访问');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 消息渲染 ---------- */
function addMessage(role, html, extraClass = '') {
  const div = document.createElement('div');
  div.className = `msg ${role} ${extraClass}`;
  div.innerHTML = `<div class="avatar">${role === 'user' ? '👤' : '✦'}</div><div class="bubble">${html}</div>`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function addTyping() {
  const div = addMessage('ai', '<span class="typing"><i></i><i></i><i></i></span> 正在计算并解读数据…');
  div._typing = true;
  return div;
}

function replaceTyping(msgDiv, html) {
  msgDiv.querySelector('.bubble').innerHTML = html;
  chat.scrollTop = chat.scrollHeight;
}

function messageHtml(result) {
  let html = '';
  if (result.intentLabel) html += `<span class="intent-tag">${esc(result.intentLabel)}</span>`;
  html += (result.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('');
  if (result.llmComment) {
    html += `<p style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(192,132,252,0.35)">🤖 <b>AI 自由解读</b><br>${esc(result.llmComment)}</p>`;
  }
  if (result.chart) {
    if (result.chart.kind === 'stats') {
      html += renderStats(result.chart);
    } else {
      html += `<div class="chart-box"><div class="chart"></div></div>`;
    }
  }
  return html;
}

function mountChart(msgDiv, chartPayload) {
  const box = msgDiv.querySelector('.chart-box');
  if (!box) return;
  const el = box.querySelector('.chart');
  const chart = echarts.init(el);
  chart.setOption(buildOption(chartPayload));
  state.charts.push(chart);
}

function renderStats(payload) {
  const cards = (payload.stats || []).map(
    (s) => `<div class="stat-cell"><div class="k">${esc(s.label)}</div><div class="v">${esc(s.value)}</div></div>`,
  ).join('');
  const top = payload.top;
  const share = payload.total ? Math.round((top.value / payload.total) * 1000) / 10 : null;
  const topBar = top
    ? `<div class="stat-cell" style="grid-column:1/-1"><div class="k">头部贡献：${esc(top.name)}</div><div class="v">${share}%</div></div>`
    : '';
  return `<div class="stat-grid">${cards}${topBar}</div>`;
}

/* ---------- 图表配置 ---------- */
function buildOption(p) {
  if (p.kind === 'line') {
    const series = p.series.map((s, i) => ({
      name: s.name,
      type: 'line',
      smooth: true,
      symbolSize: 7,
      lineStyle: { width: 3, color: COLORS[i % COLORS.length] },
      itemStyle: { color: COLORS[i % COLORS.length] },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(34,211,238,0.28)' },
          { offset: 1, color: 'rgba(34,211,238,0)' },
        ]),
      },
      data: s.data,
      markPoint: p.anomalyPoints?.length ? {
        symbol: 'pin',
        symbolSize: 44,
        data: p.anomalyPoints.map(([idx, v]) => ({
          coord: [p.x[idx], v],
          value: '异常',
          itemStyle: { color: '#fb7185' },
          label: { color: '#fff', fontSize: 10 },
        })),
      } : undefined,
    }));
    if (p.forecast) {
      const histX = p.x;
      const allX = [...histX, ...p.forecast.x];
      const fStart = histX.length - 1;
      const forecastSeries = {
        name: '预测值',
        type: 'line',
        smooth: true,
        symbolSize: 7,
        lineStyle: { type: 'dashed', width: 3, color: '#c084fc' },
        itemStyle: { color: '#c084fc' },
        data: [...p.series[0].data.slice(0, fStart), null, ...p.forecast.data],
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(192,132,252,0.08)' },
          data: [[{ xAxis: p.forecast.x[0] }, { xAxis: p.forecast.x[p.forecast.x.length - 1] }]],
        },
      };
      series.push(forecastSeries);
      return {
        color: COLORS,
        tooltip: { trigger: 'axis' },
        legend: { textStyle: { color: '#98a2c0' }, top: 4 },
        grid: { left: 48, right: 20, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: allX, axisLabel: { color: '#98a2c0' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } }, axisLabel: { color: '#98a2c0' } },
        series,
      };
    }
    return {
      color: COLORS,
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#98a2c0' }, top: 4 },
      grid: { left: 48, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: p.x, axisLabel: { color: '#98a2c0', interval: Math.max(0, Math.floor(p.x.length / 10) - 1) }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } }, axisLabel: { color: '#98a2c0' } },
      series,
    };
  }

  if (p.kind === 'bar') {
    const horiz = !!p.horizontal;
    return {
      color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
        { offset: 0, color: '#22d3ee' },
        { offset: 1, color: '#818cf8' },
      ]),
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: horiz ? { left: 80, right: 30, top: 18, bottom: 26 } : { left: 60, right: 20, top: 18, bottom: 40 },
      xAxis: horiz
        ? { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } }, axisLabel: { color: '#98a2c0' } }
        : { type: 'category', data: p.x, axisLabel: { color: '#98a2c0', interval: 0, rotate: p.x.length > 6 ? 24 : 0 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } } },
      yAxis: horiz
        ? { type: 'category', data: p.x, axisLabel: { color: '#c4b5fd' }, axisLine: { show: false }, axisTick: { show: false } }
        : { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } }, axisLabel: { color: '#98a2c0' } },
      series: [{
        name: '数值', type: 'bar', barMaxWidth: 34,
        data: p.data,
        itemStyle: { borderRadius: horiz ? [0, 7, 7, 0] : [7, 7, 0, 0] },
        label: { show: true, position: horiz ? 'right' : 'top', color: '#98a2c0', fontSize: 11 },
      }],
    };
  }

  if (p.kind === 'pie') {
    const total = p.data.reduce((a, b) => a + b.value, 0);
    return {
      color: COLORS,
      tooltip: { trigger: 'item', formatter: '{b}: {c}（{d}%）' },
      legend: { orient: 'vertical', right: 8, top: 'middle', textStyle: { color: '#98a2c0' } },
      series: [{
        type: 'pie',
        radius: ['42%', '70%'],
        center: ['42%', '50%'],
        itemStyle: { borderColor: '#0a0f1e', borderWidth: 2 },
        label: { color: '#e8ecf8', formatter: '{b}\n{d}%' },
        data: p.data,
      }],
      graphic: [{
        type: 'text',
        left: '30%',
        top: '44%',
        style: { text: `总量\n${fmtShort(total)}`, textAlign: 'center', fill: '#e8ecf8', fontSize: 14, fontWeight: 600 },
      }],
    };
  }

  if (p.kind === 'scatter') {
    const xs = p.data.map((d) => d[0]);
    const ys = p.data.map((d) => d[1]);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const slope = sxx ? sxy / sxx : 0;
    const intercept = my - slope * mx;
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const lineData = [[xMin, slope * xMin + intercept], [xMax, slope * xMax + intercept]];
    return {
      color: ['#22d3ee', '#fbbf24'],
      tooltip: { trigger: 'item', formatter: (params) => `${esc(p.xLabel)}: ${params.value[0]}<br/>${esc(p.yLabel)}: ${params.value[1]}` },
      grid: { left: 60, right: 24, top: 34, bottom: 40 },
      xAxis: { type: 'value', name: p.xLabel, nameTextStyle: { color: '#98a2c0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } }, axisLabel: { color: '#98a2c0' } },
      yAxis: { type: 'value', name: p.yLabel, nameTextStyle: { color: '#98a2c0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } }, axisLabel: { color: '#98a2c0' } },
      series: [
        {
          name: '样本', type: 'scatter', symbolSize: 6, data: p.data,
          itemStyle: { color: 'rgba(34,211,238,0.75)' },
        },
        {
          name: `拟合线 r=${p.r.toFixed(2)}`, type: 'line', smooth: false, symbol: 'none', data: lineData,
          lineStyle: { width: 2, type: 'dashed', color: '#fbbf24' },
        },
      ],
    };
  }

  return {};
}

function fmtShort(n) {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(Math.round(n));
}

/* ---------- 提问流程 ---------- */
async function ask(question) {
  question = (question || '').trim();
  if (!question) return;
  addMessage('user', esc(question));
  const typing = addTyping();
  try {
    const result = await api('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    replaceTyping(typing, messageHtml(result));
    mountChart(typing, result.chart);
  } catch (e) {
    replaceTyping(typing, `<p>❌ ${esc(e.message)}</p><p style="color:var(--muted)">试试先加载数据，或换一种问法。</p>`);
  }
}

/* ---------- 侧边栏 ---------- */
function renderSidebar(data) {
  state.dataset = data;
  $('datasetName').textContent = data.name;
  $('datasetMeta').innerHTML = `
    <div class="meta-grid">
      <div class="meta-cell"><div class="k">数据行数</div><div class="v">${data.totalRows.toLocaleString()}</div></div>
      <div class="meta-cell"><div class="k">字段数</div><div class="v">${data.columns.length}</div></div>
    </div>
    <div class="muted">自动识别字段类型，可直接用自然语言提问。</div>`;
  $('colChips').innerHTML = data.columns
    .map((c) => `<span class="chip ${c.type === 'number' ? 'num' : 'dim'}">${esc(c.name)} · ${c.type === 'number' ? '数值' : '维度'}</span>`)
    .join('');
  $('prompts').innerHTML = PROMPTS.map((p) => `<button class="prompt">${esc(p)}</button>`).join('');
  $('prompts').querySelectorAll('.prompt').forEach((btn) => {
    btn.addEventListener('click', () => ask(btn.textContent));
  });
  $('insights').innerHTML = data.autoInsights
    .map((it) => `
      <div class="insight-card" data-ask="${esc(it.ask || '')}">
        <div class="t">${it.icon} ${esc(it.title)}</div>
        <div class="d">${esc(it.text)}</div>
        ${it.ask ? '<div class="go">▶ 追问：' + esc(it.ask) + '</div>' : ''}
      </div>`)
    .join('');
  $('insights').querySelectorAll('.insight-card').forEach((card) => {
    const q = card.dataset.ask;
    if (q) card.addEventListener('click', () => ask(q));
  });
}

async function loadDataset(path) {
  try {
    const data = await api(path);
    renderSidebar(data);
    return data;
  } catch (e) {
    toast(e.message);
    return null;
  }
}

/* ---------- 欢迎页 ---------- */
function renderWelcome() {
  chat.innerHTML = `
    <div class="welcome">
      <div class="hero-logo">✦</div>
      <h2>让数据分析自由化</h2>
      <p class="sub">不需要写代码、不需要懂 SQL。上传数据，用一句话提问，AI 自动完成统计、解读并生成可视化图表——分析能力，人人可用。</p>
      <div class="feature-cards">
        <div class="feature-card"><div class="ic">💬</div><div class="t">自由提问</div><div class="d">用日常语言描述你想知道的一切，中英文均可。</div></div>
        <div class="feature-card"><div class="ic">📈</div><div class="t">自动出图</div><div class="d">趋势、排行、占比、散点随问题自动匹配图表。</div></div>
        <div class="feature-card"><div class="ic">🔮</div><div class="t">预测与异常</div><div class="d">统计外推未来走势，自动发现离群月份。</div></div>
      </div>
    </div>`;
}

/* ---------- 事件 ---------- */
function setupEvents() {
  const input = $('questionInput');
  const send = () => {
    const q = input.value;
    if (!q.trim()) return;
    input.value = '';
    autoResize();
    ask(q);
  };
  $('sendBtn').addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener('input', autoResize);

  $('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const data = await api('/api/upload', { method: 'POST', body: fd });
      renderSidebar(data);
      renderWelcome();
      toast(`✅ 已加载 ${file.name}`);
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
  });

  $('sampleBtn').addEventListener('click', async () => {
    const data = await loadDataset('/api/sample');
    if (data) {
      renderWelcome();
      toast('✅ 已加载内置样例数据');
    }
  });

  $('hints').innerHTML = HINTS.map((h) => `<span class="hint">${esc(h)}</span>`).join('');
  $('hints').querySelectorAll('.hint').forEach((h) => {
    h.addEventListener('click', () => {
      $('questionInput').value = h.textContent;
      $('questionInput').focus();
    });
  });

  window.addEventListener('resize', () => state.charts.forEach((c) => c.resize()));
}

function autoResize() {
  const input = $('questionInput');
  input.style.height = 'auto';
  input.style.height = Math.min(130, input.scrollHeight) + 'px';
}

/* ---------- 启动 ---------- */
async function init() {
  setupEvents();
  renderWelcome();
  await resolveApiBase();
  await ensureEcharts();
  if (APP_CONFIG?.llm?.enabled) {
    const badge = $('llmBadge');
    badge.textContent = `🤖 已接入 ${APP_CONFIG.llm.model}`;
    badge.hidden = false;
  }
  await loadDataset('/api/dataset');
  if (!state.dataset) {
    const data = await loadDataset('/api/sample');
    if (data) toast('已加载内置样例数据，可直接开始提问');
  } else {
    setTimeout(() => {
      addMessage('ai', '<p>你好！我是你的数据分析助手。当前已加载 <b>' + esc(state.dataset.name) + '</b>，共 ' + state.dataset.totalRows.toLocaleString() + ' 行数据。</p><p>直接输入问题，或点击左侧的建议问题与自动洞察。</p>');
    }, 200);
  }
}

init();
