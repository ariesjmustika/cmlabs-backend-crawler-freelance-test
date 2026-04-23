const fs = require('fs');
const path = require('path');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('htmlWriter');

/**
 * Save rendered HTML to file
 * @param {string} htmlContent - Full rendered HTML
 * @param {string} outputDir - Output directory path
 * @returns {Promise<string>} Path to saved file
 */
async function writeHtml(htmlContent, outputDir, baseUrl = null) {
  const filePath = path.join(outputDir, 'index.html');
  let finalHtml = htmlContent;

  // Inject <base> tag if baseUrl is provided
  if (baseUrl) {
    finalHtml = htmlContent.replace(
      '<head>',
      `<head>\n    <base href="${baseUrl}">`
    );
  }

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(filePath, finalHtml, 'utf-8');

  const sizeKB = (Buffer.byteLength(finalHtml, 'utf-8') / 1024).toFixed(2);
  log.info(`HTML saved: ${filePath} (${sizeKB} KB)`);

  return filePath;
}

module.exports = { writeHtml };
