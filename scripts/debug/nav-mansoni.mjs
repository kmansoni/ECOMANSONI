import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto('https://mansoni.ru', { waitUntil: 'domcontentloaded', timeout: 30000 });
console.log('navigated to', page.url());
await browser.close().catch(() => {});
