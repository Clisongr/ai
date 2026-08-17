// 开发辅助：验证 GitHub Pages 静态版（无后端）完整可用
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
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
}

async function waitForAiReply(beforeCount) {
  await page.waitForFunction(
    (n) => {
      const msgs = document.querySelectorAll('.msg.ai');
      if (msgs.length <= n) return false;
      return !msgs[msgs.length - 1].querySelector('.typing');
    },
    beforeCount,
    { timeout: 20000 },
  );
  await page.waitForTimeout(500);
}

await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

check('静态版数据集加载', (await page.locator('#datasetMeta').innerText()).includes('1,075'));
check('纯浏览器版徽标', (await page.locator('.llm-badge').innerText()).includes('纯浏览器版'));
check('字段标签', (await page.locator('.chip').count()) >= 8);
check('建议问题', (await page.locator('.prompt').count()) === 7);
check('自动洞察', (await page.locator('.insight-card').count()) >= 4);
check('本地分析提示', (await page.locator('#datasetMeta').innerText()).includes('本地'));

const aiBefore1 = await page.locator('.msg.ai').count();
await page.locator('.prompt').first().click();
await waitForAiReply(aiBefore1);
check('提问成功', (await page.locator('.msg.user').count()) === 1);
check('图表已绘制', (await page.locator('.chart-box canvas').count()) === 1);

const aiBefore2 = await page.locator('.msg.ai').count();
await page.fill('#questionInput', '预测未来三个月的销售额');
await page.press('#questionInput', 'Enter');
await waitForAiReply(aiBefore2);
check('预测正常', (await page.locator('.msg.ai').last().innerText()).includes('线性回归外推'));

// 模拟上传 CSV
const csv = '日期,地区,品类,销售额\n2024-01,华东,手机,1000\n2024-02,华北,电脑,2000\n2024-03,华东,家电,3000';
await page.setInputFiles('#fileInput', {
  name: 'my-data.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(csv, 'utf-8'),
});
await page.waitForTimeout(800);
check('上传后数据集名称', (await page.locator('#datasetMeta').innerText()).includes('my-data.csv'));
check('上传后行数=3', (await page.locator('#datasetMeta').innerText()).includes('3'));

check('无控制台错误', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
check('无页面异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed ? 1 : 0);
