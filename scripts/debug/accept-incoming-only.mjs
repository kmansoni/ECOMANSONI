import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = (ctx?.pages() || []).find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx?.pages?.()[0];
if (!page) {
  console.log('no page');
  process.exit(1);
}

console.log('page', page.url());
const endBtn = page.locator('[aria-label="Отбой"]').first();
if (await endBtn.isVisible().catch(() => false)) {
  console.log('hangup stale call');
  await endBtn.click();
  await page.waitForTimeout(1200);
}

const selectors = [
  '[aria-label="Ответить"]',
  'button:has-text("Ответить")',
  'button:has-text("Принять")',
  '[data-testid*="accept" i]',
].join(', ');

console.log('waiting incoming');
const btn = page.locator(selectors).first();
await btn.waitFor({ state: 'visible', timeout: 300_000 });
console.log('incoming visible -> accept');
await btn.click();
console.log('accepted');

setInterval(() => {}, 1 << 30);
