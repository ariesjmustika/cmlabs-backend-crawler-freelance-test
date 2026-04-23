const express = require('express');
const { validateCrawl } = require('../middlewares/validate');
const { crawlRateLimiter, apiRateLimiter } = require('../middlewares/rateLimit');
const { crawl, getAllResults, getResult, getFilePath } = require('../../crawler');
const browserManager = require('../../crawler/browser');
const { createModuleLogger } = require('../../utils/logger');

const router = express.Router();
const log = createModuleLogger('routes');

/**
 * POST /api/crawl
 * Trigger a crawl job
 */
router.post('/crawl', crawlRateLimiter, validateCrawl, async (req, res) => {
  const { url, options } = req.body;

  log.info(`Crawl request received: ${url}`, { options, ip: req.ip });

  try {
    const result = await crawl(url, options);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    log.error(`Crawl failed: ${url}`, { error: error.message, stack: error.stack });

    res.status(500).json({
      success: false,
      error: 'Crawl failed',
      message: error.message,
      url,
    });
  }
});

/**
 * GET /api/results
 * List all crawled results
 */
router.get('/results', apiRateLimiter, (req, res) => {
  try {
    const results = getAllResults();

    res.status(200).json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error) {
    log.error('Failed to list results', { error: error.message });

    res.status(500).json({
      success: false,
      error: 'Failed to list results',
      message: error.message,
    });
  }
});

/**
 * GET /api/results/:domain
 * Get result for specific domain
 */
router.get('/results/:domain', apiRateLimiter, (req, res) => {
  const { domain } = req.params;

  try {
    const result = getResult(domain);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: `No results found for domain: ${domain}`,
      });
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    log.error(`Failed to get result for ${domain}`, { error: error.message });

    res.status(500).json({
      success: false,
      error: 'Failed to get result',
      message: error.message,
    });
  }
});

/**
 * GET /api/download/:domain/:file
 * Download a specific file (index.html, metadata.json, screenshot.png)
 */
router.get('/download/:domain/:file', apiRateLimiter, (req, res) => {
  const { domain, file } = req.params;

  try {
    const filePath = getFilePath(domain, file);

    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: `File not found: ${domain}/${file}`,
      });
    }

    res.download(filePath, file);
  } catch (error) {
    log.error(`Download failed: ${domain}/${file}`, { error: error.message });

    res.status(500).json({
      success: false,
      error: 'Download failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/status
 * Get browser and system status
 */
router.get('/status', apiRateLimiter, (req, res) => {
  const browserStatus = browserManager.getStatus();

  res.status(200).json({
    success: true,
    data: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      browser: browserStatus,
    },
  });
});

module.exports = router;
