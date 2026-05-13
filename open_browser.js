const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:8083/auth');
  console.log('Browser opened. Waiting for interaction...');
  await page.waitForTimeout(300000); // 5 min wait
  await browser.close();
})();
