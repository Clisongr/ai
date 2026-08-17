// 开发辅助：无头浏览器端到端检查（DOM 状态、控制台错误、图表是否真实绘制）
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/ASUS/.codex/skills/ppt/node_modules/playwright-core');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
const pageErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => pageErrors.push(String(err)));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
}

async function waitForAiReply(beforeCount, label = '') {
  try {
    await page.waitForFunction(
      (n) => {
        const msgs = document.querySelectorAll('.msg.ai');
        if (msgs.length <= n) return false;
        return !msgs[msgs.length - 1].querySelector('.typing');
      },
      beforeCount,
      { timeout: 45000 },
    );
    await page.waitForTimeout(600); // 等图表渲染完成
  } catch (e) {
    console.log(`WAIT_TIMEOUT ${label}`);
  }
}

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

check('标题正确', (await page.title()).includes('智析'));
check('数据集已加载', (await page.locator('#datasetName').innerText()).includes('零售销售数据'));
check('侧边栏字段标签', (await page.locator('.chip').count()) >= 8);
check('建议问题数量', (await page.locator('.prompt').count()) === 7);
check('自动洞察卡片', (await page.locator('.insight-card').count()) >= 4);
check('欢迎页可见', await page.locator('.welcome').isVisible());
check('数据行数显示', (await page.locator('.meta-cell .v').first().innerText()).includes('1,075'));

const aiBefore1 = await page.locator('.msg.ai').count();
await page.locator('.prompt').first().click();
await waitForAiReply(aiBefore1, 'ranking');
check('提问后出现用户消息', (await page.locator('.msg.user').count()) === 1);
check('出现 AI 回复', (await page.locator('.msg.ai').count()) >= 2);
check('意图标签', (await page.locator('.intent-tag').innerText()).includes('对比排行'));
check('条形图已挂载', (await page.locator('.chart-box canvas').count()) === 1);

const barPainted = await page.evaluate(() => {
  const c = document.querySelector('.chart-box canvas');
  if (!c) return false;
  const off = document.createElement('canvas');
  off.width = c.width; off.height = c.height;
  const ctx = off.getContext('2d');
  ctx.drawImage(c, 0, 0);
  const data = ctx.getImageData(0, 0, off.width, off.height).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 10) painted++;
  return painted > 2000;
});
check('条形图真实绘制像素', barPainted);

const aiBefore2 = await page.locator('.msg.ai').count();
await page.fill('#questionInput', '预测未来三个月的销售额');
await page.press('#questionInput', 'Enter');
await waitForAiReply(aiBefore2, 'forecast');
check('预测意图标签', (await page.locator('.intent-tag').last().innerText()).includes('预测'));
const forecastPainted = await page.evaluate(() => {
  const c = document.querySelectorAll('.chart-box canvas');
  const last = c[c.length - 1];
  if (!last) return false;
  const off = document.createElement('canvas');
  off.width = last.width; off.height = last.height;
  const ctx = off.getContext('2d');
  ctx.drawImage(last, 0, 0);
  const data = ctx.getImageData(0, 0, off.width, off.height).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 10) painted++;
  return painted > 2000;
});
check('预测折线图真实绘制', forecastPainted);
check('预测段落包含外推', (await page.locator('.msg.ai').last().innerText()).includes('线性回归外推'));

const aiBefore3 = await page.locator('.msg.ai').count();
await page.fill('#questionInput', '帮我做一个整体分析');
await page.press('#questionInput', 'Enter');
await waitForAiReply(aiBefore3, 'overview');
check('整体分析统计卡片', (await page.locator('.stat-cell').count()) >= 6);

check('无控制台错误', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
check('无页面异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed ? 1 : 0);
