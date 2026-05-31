import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = (ctx?.pages() || []).find((p) => /mansoni\.ru/i.test(p.url())) ?? ctx?.pages?.()[0];
if (!page) {
  console.log('no page');
  process.exit(1);
}

const endBtn = page.locator('[aria-label="Отбой"]').first();
if (await endBtn.isVisible().catch(() => false)) {
  await endBtn.click();
  await page.waitForTimeout(1200);
  console.log('hung up');
} else {
  console.log('no active call');
}
