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

module.exports = { takeScreenshot };
