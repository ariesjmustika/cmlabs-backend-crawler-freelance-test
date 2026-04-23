const { createModuleLogger } = require('../../utils/logger');

const log = createModuleLogger('strategy:base');

/**
 * Base Crawl Strategy
 * Shared logic for extracting metadata, links, assets, and performance metrics.
 * All strategy subclasses should extend or use these methods.
 */
class BaseStrategy {
  constructor(name) {
    this.name = name;
    this.log = createModuleLogger(`strategy:${name}`);
  }

  /**
   * Get the wait-until option for page.goto()
   * Override in subclasses
   */
  getWaitUntil() {
    return 'networkidle';
  }

  /**
   * Extra wait time after page load (ms)
   * Override in subclasses
   */
  getExtraWait() {
    return 0;
  }

  /**
   * Execute the crawl strategy on a page
   * @param {import('playwright').Page} page
   * @param {string} url
   * @param {Object} options
   * @returns {Promise<Object>} Crawl data
   */
  async execute(page, url, options = {}) {
    const startTime = Date.now();
    this.log.info(`Crawling ${url} with ${this.name} strategy`);

    // Navigate to page
    const timeout = options.timeout || 30000;
    await page.goto(url, {
      waitUntil: this.getWaitUntil(),
      timeout,
    });

    // Extra wait (strategy-specific + user-specified)
    const extraWait = this.getExtraWait() + (options.waitExtra || 0);
    if (extraWait > 0) {
      this.log.debug(`Waiting extra ${extraWait}ms`);
      await page.waitForTimeout(extraWait);
    }

    // Perform post-load hooks (override in subclasses)
    await this.postLoad(page, options);

    // Extract all data in parallel
    const [metadata, links, assets, performance] = await Promise.all([
      this.extractMetadata(page),
      this.extractLinks(page, url),
      this.extractAssets(page),
      this.extractPerformance(page),
    ]);

    const duration = Date.now() - startTime;
    this.log.info(`Crawl complete in ${duration}ms`, { url, siteType: this.name });

    return {
      url,
      crawledAt: new Date().toISOString(),
      duration,
      siteType: this.name.toUpperCase(),
      metadata,
      performance,
      links,
      assets,
    };
  }

  /**
   * Post-load hook for subclasses to override
   * @param {import('playwright').Page} page
   * @param {Object} options
   */
  async postLoad(page, options) {
    // Override in subclasses
  }

  /**
   * Extract page metadata
   * @param {import('playwright').Page} page
   * @returns {Promise<Object>}
   */
  async extractMetadata(page) {
    return page.evaluate(() => {
      const getMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return el ? el.getAttribute('content') : null;
      };

      const getFavicon = () => {
        const link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
        if (link) return link.href;
        return new URL('/favicon.ico', window.location.origin).href;
      };

      return {
        title: document.title || null,
        description: getMeta('description') || getMeta('og:description') || null,
        keywords: getMeta('keywords') || null,
        author: getMeta('author') || null,
        favicon: getFavicon(),
        lang: document.documentElement.lang || null,
        ogTitle: getMeta('og:title') || null,
        ogImage: getMeta('og:image') || null,
        ogType: getMeta('og:type') || null,
        canonical: (() => {
          const link = document.querySelector('link[rel="canonical"]');
          return link ? link.href : null;
        })(),
        viewport: getMeta('viewport') || null,
        charset: (() => {
          const meta = document.querySelector('meta[charset]');
          return meta ? meta.getAttribute('charset') : null;
        })(),
      };
    });
  }

  /**
   * Extract all links, categorized as internal/external
   * @param {import('playwright').Page} page
   * @param {string} baseUrl
   * @returns {Promise<Object>}
   */
  async extractLinks(page, baseUrl) {
    return page.evaluate((base) => {
      const origin = new URL(base).origin;
      const links = Array.from(document.querySelectorAll('a[href]'));
      const internal = new Set();
      const external = new Set();

      for (const link of links) {
        try {
          const href = new URL(link.href, base).href;
          if (href.startsWith(origin)) {
            internal.add(href);
          } else if (href.startsWith('http')) {
            external.add(href);
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }

      return {
        internal: [...internal],
        external: [...external],
        totalInternal: internal.size,
        totalExternal: external.size,
      };
    }, baseUrl);
  }

  /**
   * Extract page assets (images, scripts, stylesheets)
   * @param {import('playwright').Page} page
   * @returns {Promise<Object>}
   */
  async extractAssets(page) {
    return page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img[src]'))
        .map(img => ({
          src: img.src,
          alt: img.alt || null,
          width: img.naturalWidth || null,
          height: img.naturalHeight || null,
        }));

      const scripts = Array.from(document.querySelectorAll('script[src]'))
        .map(s => s.src);

      const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map(l => l.href);

      return {
        images,
        scripts,
        stylesheets,
        totalImages: images.length,
        totalScripts: scripts.length,
        totalStylesheets: stylesheets.length,
      };
    });
  }

  /**
   * Extract performance timing metrics
   * @param {import('playwright').Page} page
   * @returns {Promise<Object>}
   */
  async extractPerformance(page) {
    return page.evaluate(() => {
      const timing = performance.timing;
      const nav = performance.getEntriesByType('navigation')[0] || {};

      return {
        loadTime: timing.loadEventEnd - timing.navigationStart || null,
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart || null,
        firstPaint: (() => {
          const fp = performance.getEntriesByName('first-paint')[0];
          return fp ? Math.round(fp.startTime) : null;
        })(),
        firstContentfulPaint: (() => {
          const fcp = performance.getEntriesByName('first-contentful-paint')[0];
          return fcp ? Math.round(fcp.startTime) : null;
        })(),
        domInteractive: timing.domInteractive - timing.navigationStart || null,
        transferSize: nav.transferSize || null,
        encodedBodySize: nav.encodedBodySize || null,
        decodedBodySize: nav.decodedBodySize || null,
      };
    });
  }
}

module.exports = BaseStrategy;
