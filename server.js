// 智析 · AI 数据自由分析台 —— 服务端入口
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv, inferTypes } from './lib/csv.js';
import { buildAutoInsights } from './lib/insights.js';
import { analyzeQuestion } from './lib/nlp.js';
import { enrichWithLLM, llmConfigured } from './lib/llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// 启动时加载本机 .env（仅本地读取，不会进入仓库）
function loadEnvFile() {
  try {
    const text = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* 没有 .env 时静默忽略 */
  }
}
loadEnvFile();

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// 允许从任意本地来源访问（如 file:// 直接打开页面或本地预览端口）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
// ECharts 直接从依赖中提供，避免额外拷贝
app.get('/vendor/echarts.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'echarts', 'dist', 'echarts.min.js'));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---- 数据装配 ---------------------------------------------------------
let currentDataset = null;
let datasetName = '内置样例：零售销售数据';

function prepareDataset(rows, headers, name) {
  const types = inferTypes(headers, rows).types;
  const dataset = { headers, rows, types };
  return {
    name,
    totalRows: rows.length,
    columns: headers.map((h) => ({ name: h, type: types[h] })),
    preview: rows.slice(0, 10),
    autoInsights: buildAutoInsights(dataset),
  };
}

function decodeCsvBuffer(buf) {
  // 优先 UTF-8，失败则尝试 GBK（中文 Windows 常见编码）
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (text.split(/\r?\n/).filter((l) => l.trim()).length < 3) {
    try {
      const gbk = new TextDecoder('gbk');
      text = gbk.decode(buf);
    } catch {
      /* keep utf-8 result */
    }
  }
  return text;
}

function loadSample() {
  const samplePath = path.join(__dirname, 'data', 'sample.csv');
  const text = fs.readFileSync(samplePath, 'utf-8');
  const { headers, rows } = parseCsv(text);
  currentDataset = { headers, rows, types: inferTypes(headers, rows).types };
  datasetName = '内置样例：零售销售数据';
}

try {
  loadSample();
} catch (e) {
  console.warn('未找到样例数据，请先运行 npm run generate-sample');
}

// ---- API --------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/api/config', (req, res) => {
  res.json({
    base: `http://localhost:${PORT}`,
    port: PORT,
    llm: { enabled: llmConfigured(), model: process.env.LLM_MODEL || null },
  });
});

app.get('/api/dataset', (req, res) => {
  if (!currentDataset) return res.status(404).json({ error: '尚无数据，请先加载样例或上传 CSV' });
  res.json(prepareDataset(currentDataset.rows, currentDataset.headers, datasetName));
});

app.get('/api/sample', (req, res) => {
  loadSample();
  res.json(prepareDataset(currentDataset.rows, currentDataset.headers, datasetName));
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未收到文件，请选择 CSV 文件' });
    const text = decodeCsvBuffer(req.file.buffer);
    const { headers, rows } = parseCsv(text);
    if (rows.length < 1) return res.status(400).json({ error: 'CSV 中没有有效数据行' });
    currentDataset = { headers, rows, types: inferTypes(headers, rows).types };
    datasetName = req.file.originalname;
    res.json(prepareDataset(rows, headers, datasetName));
  } catch (e) {
    res.status(400).json({ error: `解析失败：${e.message}` });
  }
});

app.post('/api/analyze', async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: '请输入问题' });
  if (!currentDataset) return res.status(400).json({ error: '尚无数据，请先加载样例或上传 CSV' });
  try {
    const result = analyzeQuestion(question, currentDataset);
    if (llmConfigured()) {
      const comment = await enrichWithLLM(result, {
        totalRows: currentDataset.rows.length,
        columns: currentDataset.headers,
      });
      if (comment) result.llmComment = comment;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: `分析失败：${e.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`智析 · AI 数据自由分析台已启动：http://localhost:${PORT}`);
});
