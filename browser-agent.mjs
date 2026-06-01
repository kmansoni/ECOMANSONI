import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log('🚀 Browser launched - watch the window!');

// Listen for errors
page.on('console', msg => {
  if (msg.type() === 'error') {
    console.log('❌ ERROR:', msg.text());
  }
});

page.on('pageerror', err => {
  console.log('❌ PAGE ERROR:', err.message);
});

// Navigate to mansoni.ru
console.log('📍 Loading https://mansoni.ru...');
await page.goto('https://mansoni.ru', { waitUntil: 'networkidle' });
console.log('✅ Page loaded');
await page.waitForTimeout(2000);

// Take screenshot
await page.screenshot({ path: 'C:/Users/manso/Desktop/разработка/mansoni/pw-screenshots/prod-1-loaded.png' });
console.log('📸 Screenshot saved');

// Check for auth
const url = page.url();
console.log('Current URL:', url);

if (url.includes('/auth') || url.includes('/login')) {
  console.log('🔐 On auth page - waiting for interaction...');
}

// Keep browser open for manual testing
console.log('\n⏳ Browser is open. Interact manually or type in terminal.');
console.log('Press Ctrl+C to close.');

// Wait forever (or until user closes)
await new Promise(() => {});