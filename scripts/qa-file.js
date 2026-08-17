// 开发辅助：验证直接双击 HTML（file:// 协议）打开时，应用仍能通过绝对地址连接分析服务
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/ASUS/.codex/skills/ppt/node_modules/playwright-core');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
}

await page.goto('file:///D:/ai/ai-data-freedom-demo/public/index.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);

check('file:// 下数据集加载成功', (await page.locator('#datasetName').innerText()).includes('零售销售数据'));
check('file:// 下字段标签渲染', (await page.locator('.chip').count()) >= 8);
check('file:// 下无连接警告', await page.locator('#netBanner').isHidden());

await page.locator('.prompt').nth(2).click();
await page.waitForTimeout(2400);
check('file:// 下提问成功', (await page.locator('.msg.user').count()) === 1);
check('file:// 下图表绘制', (await page.locator('.chart-box canvas').count()) === 1);

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed ? 1 : 0);
