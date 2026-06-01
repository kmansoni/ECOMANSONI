// browser-test.js - Production testing for mansoni.ru
// Run: node browser-test.js

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'pw-screenshots');
const BASE_URL = 'https://mansoni.ru';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function getScreenshotPath(name) {
  return path.join(SCREENSHOTS_DIR, `production-${name}-${timestamp}.png`);
}

async function runTests() {
  const consoleErrors = [];
  let browser;

  console.log('='.repeat(60));
  console.log('MANSONI.RU - PRODUCTION BROWSER TESTING');
  console.log('='.repeat(60));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

  try {
    // Launch browser
    console.log('[1/6] Launching Chromium browser...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    // Capture console errors (Error level only)
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          text: msg.text(),
          location: msg.location()
        });
      }
    });

    page.on('pageerror', error => {
      consoleErrors.push({
        text: `Page Error: ${error.message}`,
        stack: error.stack
      });
    });

    // 1. Main page
    console.log('[2/6] Testing main page: https://mansoni.ru');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const mainTitle = await page.title();
    const mainUrl = page.url();
    console.log(`  - Title: ${mainTitle}`);
    console.log(`  - URL: ${mainUrl}`);

    await page.screenshot({ path: getScreenshotPath('main') });
    console.log(`  ✓ Screenshot: production-main`);

    // Check for visible content
    const bodyText = await page.locator('body').textContent();
    const hasContent = bodyText && bodyText.trim().length > 50;
    console.log(`  - Has visible content: ${hasContent ? 'YES' : 'NO'}`);

    // 2. Check if logged in (look for user menu or login button)
    console.log('');
    console.log('[3/6] Checking authentication state...');
    const loginButton = await page.locator('text=/войти|login|sign in|войти в систему/i').count();
    const userMenu = await page.locator('[data-testid="user-menu"], [class*="user"], [class*="avatar"]').count();

    if (loginButton > 0) {
      console.log('  - Status: Not logged in (login button visible)');
    } else if (userMenu > 0) {
      console.log('  - Status: Logged in (user menu visible)');
    } else {
      console.log('  - Status: Unknown (no clear auth indicators)');
    }

    // 3. Try to navigate to Messenger
    console.log('');
    console.log('[4/6] Testing Messenger section...');
    try {
      // Try clicking on messenger link
      const messengerLink = page.locator('a[href*="messenger"], a[href*="chat"], a[href*="messages"], nav >> text=/мессенджер|чат|сообщения/i').first();
      const hasMessenger = await messengerLink.count() > 0;

      if (hasMessenger) {
        await messengerLink.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: getScreenshotPath('messenger') });
        console.log('  ✓ Screenshot: production-messenger');
      } else {
        // Try direct navigation
        await page.goto(BASE_URL + '/messenger', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: getScreenshotPath('messenger') });
        console.log('  ✓ Screenshot: production-messenger');
      }
    } catch (e) {
      console.log(`  - Could not access messenger: ${e.message}`);
      await page.screenshot({ path: getScreenshotPath('messenger-error') });
    }

    // 4. Try to navigate to Feed/Social
    console.log('');
    console.log('[5/6] Testing Social Feed section...');
    try {
      const feedLink = page.locator('a[href*="feed"], a[href*="posts"], a[href*="social"], nav >> text=/лента|посты|социальное/i').first();
      const hasFeed = await feedLink.count() > 0;

      if (hasFeed) {
        await feedLink.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: getScreenshotPath('feed') });
        console.log('  ✓ Screenshot: production-feed');
      } else {
        await page.goto(BASE_URL + '/feed', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: getScreenshotPath('feed') });
        console.log('  ✓ Screenshot: production-feed');
      }
    } catch (e) {
      console.log(`  - Could not access feed: ${e.message}`);
      await page.screenshot({ path: getScreenshotPath('feed-error') });
    }

    // 5. Try profile page
    console.log('');
    console.log('[6/6] Testing Profile section...');
    try {
      await page.goto(BASE_URL + '/profile', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: getScreenshotPath('profile') });
      console.log('  ✓ Screenshot: production-profile');
    } catch (e) {
      console.log(`  - Could not access profile: ${e.message}`);
      await page.screenshot({ path: getScreenshotPath('profile-error') });
    }

    // Results summary
    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTS SUMMARY');
    console.log('='.repeat(60));

    console.log('');
    console.log('### SCREENSHOTS SAVED:');
    const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.startsWith('production-') && f.includes(timestamp));
    files.forEach(f => console.log(`  - ${f}`));

    console.log('');
    console.log('### CONSOLE ERRORS (Error level only):');
    if (consoleErrors.length === 0) {
      console.log('  ✓ No console errors detected');
    } else {
      console.log(`  ✗ Found ${consoleErrors.length} error(s):`);
      consoleErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.text}`);
        if (err.location) {
          console.log(`     Location: ${err.location.url}:${err.location.lineNumber}`);
        }
        if (err.stack) {
          const stackLines = err.stack.split('\n').slice(0, 3).join('\n     ');
          console.log(`     Stack: ${stackLines}`);
        }
      });
    }

    console.log('');
    console.log('### PAGE LOAD STATUS:');
    console.log(`  - Main page loaded: YES`);
    console.log(`  - Title: "${mainTitle}"`);

    console.log('');
    console.log('### ISSUES FOUND:');
    const issues = [];
    if (consoleErrors.length > 0) issues.push(`Console errors: ${consoleErrors.length}`);
    if (!hasContent) issues.push('Main page may have no visible content');

    if (issues.length === 0) {
      console.log('  ✓ No obvious issues detected');
    } else {
      issues.forEach(issue => console.log(`  ✗ ${issue}`));
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(`Testing completed: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    await browser.close();

    // Return exit code based on errors
    process.exit(consoleErrors.length > 0 ? 1 : 0);

  } catch (error) {
    console.error('');
    console.error('!!! FATAL ERROR !!!');
    console.error(error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

runTests();