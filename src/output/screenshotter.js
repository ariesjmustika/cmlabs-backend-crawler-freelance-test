const fs = require('fs');
const path = require('path');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('screenshotter');

/**
 * Take a screenshot of the page
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {string} outputDir - Output directory path
 * @param {Object} options
 * @param {boolean} options.fullPage - Full page screenshot (default: true)
 * @returns {Promise<string>} Path to saved screenshot
 */
async function takeScreenshot(page, outputDir, options = {}) {
  const filePath = path.join(outputDir, 'screenshot.png');
  const fullPage = options.fullPage !== false;

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Scroll to trigger lazy-loaded images before screenshot
  if (fullPage) {
    await autoScroll(page);
  }

  await page.screenshot({
    path: filePath,
    fullPage,
    type: 'png',
  });

  const stats = fs.statSync(filePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  log.info(`Screenshot saved: ${filePath} (${sizeMB} MB, fullPage: ${fullPage})`);

  return filePath;
}

/**
 * Auto-scroll the page to trigger lazy-loading
 * @param {import('playwright').Page} page
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          // Scroll back to top
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);

      // Safety timeout
      setTimeout(() => {
        clearInterval(timer);
        window.scrollTo(0, 0);
        resolve();
      }, 5000);
    });
  });

  // Wait for any lazy images to load
  await page.waitForTimeout(500);
}

module.exports = { takeScreenshot };
