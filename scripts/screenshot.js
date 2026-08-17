// 开发辅助：用本机 Chrome + playwright-core 对页面做视觉验证
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/ASUS/.codex/skills/ppt/node_modules/playwright-core');

const outDir = process.argv[2];
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${outDir}/01-welcome.png` });
console.log('01-welcome.png done');

await page.locator('.prompt').first().click();
await page.waitForTimeout(2200);
await page.screenshot({ path: `${outDir}/02-ranking.png` });
console.log('02-ranking.png done');

await page.fill('#questionInput', '预测未来三个月的销售额');
await page.press('#questionInput', 'Enter');
await page.waitForTimeout(2600);
await page.screenshot({ path: `${outDir}/03-forecast.png` });
console.log('03-forecast.png done');

await page.evaluate(() => document.querySelector('.sidebar').scrollTo(0, 99999));
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}/04-sidebar.png` });
console.log('04-sidebar.png done');

await browser.close();
console.log('all done');
