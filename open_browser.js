const { chromium } = require('playwright');

/**
 * Opens a browser for development purposes
 * @param {string} targetUrl - The URL to navigate to
 */
async function openBrowserForDev(targetUrl) {
  let browser;
  try {
    console.log(`Launching browser for URL: ${targetUrl}`);
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(targetUrl);
    console.log('Browser opened. Waiting for interaction...');
    // Wait for user interaction (can be interrupted with Ctrl+C)
    await new Promise(() => {});
  } catch (error) {
    console.error('Failed to open browser:', error.message);
    throw new Error(`Browser operation failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Get target URL from environment or use default
const targetUrl = process.env.BROWSER_TARGET_URL || 'http://localhost:8083';

// If this script is run directly, execute the function
if (require.main === module) {
  openBrowserForDev(targetUrl).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { openBrowserForDev };