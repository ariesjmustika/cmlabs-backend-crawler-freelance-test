const { chromium, firefox, webkit } = require('playwright');
const { createModuleLogger } = require('../utils/logger');
const config = require('../config');

const log = createModuleLogger('browser');

/**
 * Browser Pool Manager
 * Manages a singleton browser instance with semaphore-based concurrency control.
 * Supports Chromium, Firefox, and WebKit.
 */
class BrowserManager {
  constructor() {
    this.browser = null;
    this.browserType = null;
    this.activePagesCount = 0;
    this.waitQueue = [];
    this.isShuttingDown = false;
  }

  /**
   * Get the Playwright browser type module
   * @param {string} type - 'chromium' | 'firefox' | 'webkit'
   * @returns {BrowserType}
   */
  _getBrowserType(type) {
    const browsers = { chromium, firefox, webkit };
    if (!browsers[type]) {
      throw new Error(`Unsupported browser: ${type}. Supported: ${config.supportedBrowsers.join(', ')}`);
    }
    return browsers[type];
  }

  /**
   * Initialize the browser instance
   * @param {string} [browserName] - Browser to use (default from config)
   */
  async initialize(browserName) {
    const type = browserName || config.defaultBrowser;

    if (this.browser && this.browserType === type) {
      log.debug(`Browser already initialized: ${type}`);
      return;
    }

    // Close existing browser if switching types
    if (this.browser && this.browserType !== type) {
      log.info(`Switching browser from ${this.browserType} to ${type}`);
      await this.shutdown();
    }

    log.info(`Launching ${type} browser (headless)...`);
    const browserModule = this._getBrowserType(type);

    this.browser = await browserModule.launch({
      headless: true,
      args: type === 'chromium' ? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ] : [],
    });

    this.browserType = type;
    log.info(`${type} browser launched successfully`);

    // Handle unexpected browser disconnection
    this.browser.on('disconnected', () => {
      if (!this.isShuttingDown) {
        log.warn('Browser disconnected unexpectedly');
        this.browser = null;
        this.browserType = null;
        this.activePagesCount = 0;
        this._drainQueue(new Error('Browser disconnected'));
      }
    });
  }

  /**
   * Get a new page from the browser (blocks if at concurrency limit)
   * @param {string} [browserName] - Browser to use
   * @returns {Promise<Page>}
   */
  async getPage(browserName) {
    await this.initialize(browserName);

    // Semaphore: wait if at limit
    if (this.activePagesCount >= config.concurrentLimit) {
      log.debug(`Concurrency limit reached (${config.concurrentLimit}). Queuing request...`);
      await new Promise((resolve, reject) => {
        this.waitQueue.push({ resolve, reject });
      });
    }

    const context = await this.browser.newContext({
      viewport: config.defaultViewport,
      userAgent: 'WebCrawlerBot/1.0 (Node.js; Playwright)',
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    this.activePagesCount++;

    log.debug(`Page created. Active pages: ${this.activePagesCount}/${config.concurrentLimit}`);
    return page;
  }

  /**
   * Release a page back to the pool
   * @param {Page} page
   */
  async releasePage(page) {
    try {
      const context = page.context();
      await page.close();
      await context.close();
    } catch (error) {
      log.warn('Error closing page', { error: error.message });
    }

    this.activePagesCount = Math.max(0, this.activePagesCount - 1);
    log.debug(`Page released. Active pages: ${this.activePagesCount}/${config.concurrentLimit}`);

    // Release next in queue
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next.resolve();
    }
  }

  /**
   * Drain the wait queue with an error
   * @param {Error} error
   */
  _drainQueue(error) {
    while (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      next.reject(error);
    }
  }

  /**
   * Gracefully shut down the browser
   */
  async shutdown() {
    if (!this.browser) return;

    this.isShuttingDown = true;
    log.info('Shutting down browser...');

    try {
      await this.browser.close();
    } catch (error) {
      log.warn('Error during browser shutdown', { error: error.message });
    }

    this.browser = null;
    this.browserType = null;
    this.activePagesCount = 0;
    this.isShuttingDown = false;
    this._drainQueue(new Error('Browser shut down'));

    log.info('Browser shut down successfully');
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus() {
    return {
      isRunning: !!this.browser,
      browserType: this.browserType,
      activePages: this.activePagesCount,
      maxPages: config.concurrentLimit,
      queueLength: this.waitQueue.length,
    };
  }
}

// Singleton instance
const browserManager = new BrowserManager();

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await browserManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserManager.shutdown();
  process.exit(0);
});

module.exports = browserManager;
