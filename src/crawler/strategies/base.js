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

    // Auto-scroll to trigger lazy-loaded content
    await this.autoScroll(page);

    // Convert relative URLs to absolute for offline viewing
    await this.absolutizeUrls(page);

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
   * Auto-scroll the page to trigger lazy-loading
   * @param {import('playwright').Page} page
   */
  async autoScroll(page) {
    this.log.debug('Auto-scrolling to trigger lazy-loaded content');
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

  /**
   * Convert all relative URLs in the DOM to absolute URLs
   * @param {import('playwright').Page} page
   */
  async absolutizeUrls(page) {
    this.log.debug('Converting relative URLs to absolute');
    await page.evaluate(() => {
      const baseUrl = window.location.origin + window.location.pathname;
      
      const makeAbs = (attr) => {
        const elements = document.querySelectorAll(`[${attr}]`);
        elements.forEach(el => {
          const val = el.getAttribute(attr);
          if (!val || val.startsWith('data:') || val.startsWith('blob:') || val.startsWith('#')) return;

          // If it's absolute already, skip
          if (val.match(/^[a-z0-9]+:/i)) return;

          try {
            // Force absolute URL resolution
            const abs = new URL(val, window.location.href).href;
            el.setAttribute(attr, abs);
          } catch (e) {}
        });
      };

      makeAbs('src');
      makeAbs('href');
      makeAbs('poster');
      makeAbs('action');
      makeAbs('data-src');
      makeAbs('data-srcset');
      
      // Handle srcset specifically
      const srcsetElements = document.querySelectorAll('[srcset]');
      srcsetElements.forEach(el => {
        const srcset = el.getAttribute('srcset');
        if (srcset) {
          const absoluteSrcset = srcset.split(',').map(part => {
            const bits = part.trim().split(/\s+/);
            if (bits.length > 0) {
              const url = bits[0];
              const size = bits.slice(1).join(' ');
              if (url && !url.match(/^[a-z0-9]+:/i) && !url.startsWith('data:')) {
                try {
                  const abs = new URL(url, window.location.href).href;
                  return `${abs}${size ? ' ' + size : ''}`;
                } catch (e) { return part; }
              }
            }
            return part;
          }).join(', ');
          el.setAttribute('srcset', absoluteSrcset);
        }
      });

      // Handle inline styles (background-image: url(...))
      const styledElements = document.querySelectorAll('[style*="url("]');
      styledElements.forEach(el => {
        const style = el.getAttribute('style');
        if (style) {
          const newStyle = style.replace(/url\(['"]?([^'"]+)['"]?\)/g, (match, url) => {
            if (url && !url.match(/^[a-z0-9]+:/i) && !url.startsWith('//') && !url.startsWith('data:')) {
              try {
                return `url("${new URL(url, window.location.href).href}")`;
              } catch (e) { return match; }
            }
            return match;
          });
          if (style !== newStyle) el.setAttribute('style', newStyle);
        }
      });

      // Force all images to be eager and visible
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        img.setAttribute('loading', 'eager');
        img.removeAttribute('decoding');
        // Ensure no visibility:hidden or opacity:0 from lazy-load libraries
        img.style.opacity = '1';
        img.style.visibility = 'visible';
        
        // Swap data-src to src if src is empty or placeholder
        const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original');
        if (dataSrc && (!img.src || img.src.includes('data:image'))) {
          try {
            img.src = new URL(dataSrc, window.location.href).href;
          } catch (e) {}
        }
      });

      // Remove all scripts to prevent hydration issues (Next.js re-rendering relative paths)
      const scripts = document.querySelectorAll('script');
      scripts.forEach(s => s.remove());

      // Remove prefetch links
      const prefetches = document.querySelectorAll('link[rel="preload"], link[rel="prefetch"]');
      prefetches.forEach(p => p.remove());
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
