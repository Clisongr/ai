// 轻量 CSV 解析：支持引号包裹、逗号/分号分隔、自动推断列类型

function splitRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function detectDelimiter(headerLine) {
  for (const d of [',', '\t', ';']) {
    if (headerLine.includes(d)) return d;
  }
  return ',';
}

export function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error('CSV 内容过少：至少需要表头和一行数据');

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitRow(lines[0]).map((h) => h.trim()).filter(Boolean);
  if (headers.length < 1) throw new Error('未识别到表头');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const row = {};
    let empty = true;
    headers.forEach((h, idx) => {
      let v = (cells[idx] ?? '').trim();
      if (v !== '') empty = false;
      // 数值推断
      if (v !== '' && !isNaN(Number(v))) v = Number(v);
      row[h] = v;
    });
    if (!empty) rows.push(row);
  }
  return { headers, rows };
}

export function inferTypes(headers, rows) {
  const types = {};
  const numericVotes = {};
  headers.forEach((h) => {
    let numeric = 0;
    let total = 0;
    rows.forEach((r) => {
      const v = r[h];
      if (v === '' || v == null) return;
      total++;
      if (typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)))) numeric++;
    });
    numericVotes[h] = total > 0 ? numeric / total : 0;
    if (total > 0 && numeric / total > 0.8) types[h] = 'number';
    else if (total > 0) types[h] = 'string';
    else types[h] = 'unknown';
  });
  return { types, numericVotes };
}
