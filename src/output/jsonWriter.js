const fs = require('fs');
const path = require('path');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('jsonWriter');

/**
 * Save crawl metadata to JSON file
 * @param {Object} data - Crawl result data
 * @param {string} outputDir - Output directory path
 * @returns {Promise<string>} Path to saved file
 */
async function writeJson(data, outputDir) {
  const filePath = path.join(outputDir, 'metadata.json');

  // Ensure directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonContent = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, jsonContent, 'utf-8');

  const sizeKB = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(2);
  log.info(`JSON saved: ${filePath} (${sizeKB} KB)`);

  return filePath;
}

module.exports = { writeJson };
