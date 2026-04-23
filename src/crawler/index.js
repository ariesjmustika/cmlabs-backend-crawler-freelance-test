const path = require('path');
const fs = require('fs');
const config = require('../config');
const browserManager = require('./browser');
const { detectSiteType, fetchRawHtml } = require('./detector');
const SPAStrategy = require('./strategies/spa');
const SSRStrategy = require('./strategies/ssr');
const PWAStrategy = require('./strategies/pwa');
const { writeHtml } = require('../output/htmlWriter');
const { writeJson } = require('../output/jsonWriter');
const { takeScreenshot } = require('../output/screenshotter');
const { retry } = require('../utils/retry');
const { sanitizeDomain, normalizeUrl } = require('../utils/sanitize');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('crawler');

// Strategy map
const strategies = {
  SPA: new SPAStrategy(),
  SSR: new SSRStrategy(),
  PWA: new PWAStrategy(),
};

/**
 * Main Crawler Orchestrator
 * Coordinates: detect → select strategy → crawl → output
 */

/**
 * Crawl a URL
 * @param {string} url - URL to crawl
 * @param {Object} options
 * @param {number} options.timeout - Crawl timeout (ms)
 * @param {boolean} options.fullPage - Full page screenshot
 * @param {number} options.waitExtra - Extra wait time (ms)
 * @param {string} options.browser - Browser to use (chromium|firefox|webkit)
 * @param {boolean} options.forceRefresh - Skip cache
 * @returns {Promise<Object>} Crawl result
 */
async function crawl(url, options = {}) {
  const normalizedUrl = normalizeUrl(url);
  const domainDir = sanitizeDomain(normalizedUrl);
  const outputDir = path.join(config.resultsDir, domainDir);

  log.info(`Starting crawl for ${normalizedUrl}`, { options });

  // Check cache (unless force refresh)
  if (!options.forceRefresh) {
    const cached = checkCache(outputDir, normalizedUrl);
    if (cached) {
      log.info(`Cache hit for ${normalizedUrl} — returning cached result`);
      return { ...cached, fromCache: true };
    }
  }

  // Execute crawl with retry
  const result = await retry(
    async (attempt) => {
      return await executeCrawl(normalizedUrl, outputDir, domainDir, options);
    },
    {
      attempts: config.retryAttempts,
      label: `crawl:${normalizedUrl}`,
    }
  );

  return result;
}

/**
 * Execute a single crawl attempt
 */
async function executeCrawl(url, outputDir, domainDir, options) {
  let page = null;

  try {
    // Phase 1: Detect site type (lightweight, no browser)
    log.info('Phase 1: Detecting site type...');
    let rawHtml;
    try {
      rawHtml = await fetchRawHtml(url);
    } catch (fetchErr) {
      log.warn('Raw HTML fetch failed, defaulting to SPA strategy', { error: fetchErr.message });
      rawHtml = '';
    }
    const detection = detectSiteType(url, rawHtml);

    // Phase 2: Select strategy
    const strategy = strategies[detection.type] || strategies.SPA;
    log.info(`Phase 2: Using ${detection.type} strategy (confidence: ${detection.confidence}%)`);

    // Phase 3: Crawl with browser
    log.info('Phase 3: Launching browser crawl...');
    page = await browserManager.getPage(options.browser);

    const crawlData = await strategy.execute(page, url, {
      timeout: options.timeout || config.crawlTimeout,
      waitExtra: options.waitExtra || 0,
    });

    // Phase 4: Save output files
    log.info('Phase 4: Writing output files...');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get full page HTML
    const htmlContent = await page.content();

    // Write all outputs in parallel
    const [htmlPath, screenshotPath] = await Promise.all([
      writeHtml(htmlContent, outputDir),
      takeScreenshot(page, outputDir, { fullPage: options.fullPage !== false }),
    ]);

    // Build result with file paths
    const result = {
      ...crawlData,
      detection: {
        type: detection.type,
        confidence: detection.confidence,
        signals: detection.signals,
      },
      files: {
        html: path.relative(process.cwd(), htmlPath),
        screenshot: path.relative(process.cwd(), screenshotPath),
        json: path.relative(process.cwd(), path.join(outputDir, 'metadata.json')),
      },
      fromCache: false,
    };

    // Write JSON metadata (includes all result data)
    await writeJson(result, outputDir);

    log.info(`Crawl complete: ${url}`, {
      siteType: crawlData.siteType,
      duration: crawlData.duration,
      files: result.files,
    });

    return result;

  } finally {
    // Always release page back to pool
    if (page) {
      await browserManager.releasePage(page);
    }
  }
}

/**
 * Check file-based cache
 * @param {string} outputDir
 * @param {string} url
 * @returns {Object|null} Cached result or null
 */
function checkCache(outputDir, url) {
  const jsonPath = path.join(outputDir, 'metadata.json');

  if (!fs.existsSync(jsonPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const crawledAt = new Date(data.crawledAt);
    const age = Date.now() - crawledAt.getTime();

    if (age < config.cacheTTL) {
      log.debug(`Cache valid for ${url} (age: ${Math.round(age / 1000)}s)`);
      return data;
    }

    log.debug(`Cache expired for ${url} (age: ${Math.round(age / 1000)}s, TTL: ${config.cacheTTL / 1000}s)`);
    return null;
  } catch (error) {
    log.debug('Cache read error', { error: error.message });
    return null;
  }
}

/**
 * Get all cached results
 * @returns {Array<Object>}
 */
function getAllResults() {
  if (!fs.existsSync(config.resultsDir)) return [];

  const domains = fs.readdirSync(config.resultsDir);
  const results = [];

  for (const domain of domains) {
    const jsonPath = path.join(config.resultsDir, domain, 'metadata.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        results.push({
          domain,
          url: data.url,
          siteType: data.siteType,
          crawledAt: data.crawledAt,
          duration: data.duration,
          title: data.metadata?.title || null,
        });
      } catch (error) {
        log.warn(`Error reading metadata for ${domain}`, { error: error.message });
      }
    }
  }

  return results.sort((a, b) => new Date(b.crawledAt) - new Date(a.crawledAt));
}

/**
 * Get result for a specific domain
 * @param {string} domain
 * @returns {Object|null}
 */
function getResult(domain) {
  const jsonPath = path.join(config.resultsDir, domain, 'metadata.json');
  if (!fs.existsSync(jsonPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (error) {
    return null;
  }
}

/**
 * Get file path for download
 * @param {string} domain
 * @param {string} filename
 * @returns {string|null}
 */
function getFilePath(domain, filename) {
  const allowed = ['index.html', 'metadata.json', 'screenshot.png'];
  if (!allowed.includes(filename)) return null;

  const filePath = path.join(config.resultsDir, domain, filename);
  if (!fs.existsSync(filePath)) return null;

  return filePath;
}

module.exports = { crawl, getAllResults, getResult, getFilePath };
