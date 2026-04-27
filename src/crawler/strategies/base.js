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
    const postLoadResult = await this.postLoad(page, options);

    // Auto-hide overlays (cookie banners, popups) that block content
    await this.autoHideOverlays(page);

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
      postLoadResult,
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
   * Auto-hide intrusive overlays like cookie banners and newsletter popups
   * This makes the saved HTML snapshot much cleaner.
   */
  async autoHideOverlays(page) {
    this.log.debug('Hiding intrusive overlays');
    await page.evaluate(() => {
      // Selectors for common annoying overlays
      const overlaySelectors = [
        '.modal', '.modal-backdrop', '.fade.show',
        '[class*="modal"]', '[id*="modal"]',
        '[class*="popup"]', '[id*="popup"]',
        '[class*="overlay"]', '[id*="overlay"]',
        '[class*="cookie"]', '[id*="cookie"]',
        '[class*="consent"]', '[id*="consent"]',
        '[class*="newsletter"]', '[id*="newsletter"]',
        '[class*="popup-banner"]', '[id*="popup-banner"]',
        '.sp-fancybox-wrap', '.fancybox-overlay',
        '#onesignal-slidedown-container', '.onesignal-slidedown-dialog'
      ];

      overlaySelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const style = window.getComputedStyle(el);
            // Hide if it looks like an overlay or has high z-index
            if (
              style.position === 'fixed' || 
              style.position === 'absolute' || 
              parseInt(style.zIndex) > 1000 ||
              el.classList.contains('modal') ||
              el.classList.contains('show')
            ) {
              el.style.setProperty('display', 'none', 'important');
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('opacity', '0', 'important');
            }
          });
        } catch (e) {}
      });

      // Unlock scroll and remove modal-related body classes
      document.body.classList.remove('modal-open');
      document.body.style.setProperty('overflow', 'auto', 'important');
      document.body.style.setProperty('padding-right', '0px', 'important');
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
    });
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

      const getIcons = () => {
        const icons = [];
        const links = document.querySelectorAll('link[rel*="icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]');
        links.forEach(link => {
          icons.push({
            rel: link.rel,
            href: link.href,
            sizes: link.getAttribute('sizes') || null,
            type: link.getAttribute('type') || null
          });
        });
        
        // Also look for manifest
        const manifest = document.querySelector('link[rel="manifest"]');
        if (manifest) {
          icons.push({ rel: 'manifest', href: manifest.href });
        }
        
        return icons;
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
        icons: getIcons(),
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
      const normalizeHostname = (hostname) => hostname.replace(/^www\./, '').toLowerCase();
      
      const baseUrlObj = new URL(base);
      const baseHostNorm = normalizeHostname(baseUrlObj.hostname);
      
      const links = Array.from(document.querySelectorAll('a[href]'));
      const internal = new Set();
      const external = new Set();

      for (const link of links) {
        try {
          const urlObj = new URL(link.href, base);
          const href = urlObj.href;
          
          if (normalizeHostname(urlObj.hostname) === baseHostNorm) {
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
      const getAbsUrl = (url) => {
        if (!url) return null;
        try { return new URL(url, window.location.href).href; } catch (e) { return url; }
      };

      // 1. Regular images
      const imgElements = Array.from(document.querySelectorAll('img'));
      const images = imgElements.map(img => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
        if (!src) return null;
        return {
          src: getAbsUrl(src),
          alt: img.alt || null,
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
        };
      }).filter(Boolean);

      // 2. Background images from elements
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none' && bg.includes('url(')) {
          const match = bg.match(/url\(["']?([^"']+)["']?\)/);
          if (match && match[1]) {
            images.push({
              src: getAbsUrl(match[1]),
              alt: 'Background Image',
              width: el.offsetWidth || 0,
              height: el.offsetHeight || 0,
            });
          }
        }
      }

      // Remove duplicates
      const uniqueImages = Array.from(new Map(images.map(img => [img.src, img])).values());

      const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => getAbsUrl(s.src));
      const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => getAbsUrl(l.href));

      return {
        images: uniqueImages,
        scripts,
        stylesheets: styles,
        totalImages: uniqueImages.length,
        totalScripts: scripts.length,
        totalStylesheets: styles.length,
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
