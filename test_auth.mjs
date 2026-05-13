import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:8083/auth');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'auth_test.png', fullPage: true });
const title = await page.title();
const content = await page.content();
console.log('Title:', title);
console.log('Has mansoni logo:', content.includes('mansoni'));
console.log('Has phone input:', content.includes('phone') || content.includes('+7'));
console.log('Screenshot saved: auth_test.png');
await browser.close();
