const { parse } = require('node-html-parser');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('detector');

/**
 * Site Type Detector
 * Analyzes raw HTML to determine if a site is SPA, SSR, or PWA.
 * Uses lightweight HTML parsing — no browser needed.
 * 
 * Detection hierarchy: PWA > SPA > SSR
 */

/**
 * Detect site type from raw HTML
 * @param {string} url - URL to detect
 * @param {string} rawHtml - Raw HTML content from HTTP fetch
 * @returns {{ type: string, confidence: number, signals: string[] }}
 */
function detectSiteType(url, rawHtml) {
  const signals = [];
  let spaScore = 0;
  let ssrScore = 0;
  let pwaScore = 0;

  try {
    const root = parse(rawHtml);

    // === PWA Detection ===
    // Check for manifest link
    const manifestLink = root.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      pwaScore += 3;
      signals.push('PWA: manifest.json link found');
    }

    // Check for service worker registration in inline scripts
    const scripts = root.querySelectorAll('script');
    const inlineScriptContent = scripts
      .map(s => s.textContent || '')
      .join(' ');

    if (inlineScriptContent.includes('serviceWorker.register') ||
        inlineScriptContent.includes('serviceWorker')) {
      pwaScore += 3;
      signals.push('PWA: service worker registration detected');
    }

    // Check for PWA meta tags
    const themeColor = root.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      pwaScore += 1;
      signals.push('PWA: theme-color meta tag found');
    }

    const appleCapable = root.querySelector('meta[name="apple-mobile-web-app-capable"]');
    if (appleCapable) {
      pwaScore += 1;
      signals.push('PWA: apple-mobile-web-app-capable meta tag found');
    }

    // === SPA Detection ===
    // Check for empty #root or #app containers
    const rootDiv = root.querySelector('#root') || root.querySelector('#app') || root.querySelector('#__next');
    if (rootDiv) {
      const rootContent = rootDiv.textContent.trim();
      if (rootContent.length < 50) {
        spaScore += 4;
        signals.push(`SPA: empty container found (#${rootDiv.id})`);
      } else {
        // Has content but uses SPA container — could be SSR with hydration
        ssrScore += 2;
        signals.push(`SSR: SPA container with pre-rendered content (#${rootDiv.id})`);
      }
    }

    // Check body content length
    const body = root.querySelector('body');
    const bodyText = body ? body.textContent.trim() : '';
    
    if (bodyText.length < 500) {
      spaScore += 2;
      signals.push(`SPA: minimal body content (${bodyText.length} chars)`);
    } else {
      ssrScore += 2;
      signals.push(`SSR: substantial body content (${bodyText.length} chars)`);
    }

    // Check for JS framework bundles
    const scriptSrcs = scripts
      .map(s => s.getAttribute('src') || '')
      .filter(Boolean);

    const frameworkPatterns = [
      { pattern: /react|_next|__next/i, name: 'React/Next.js' },
      { pattern: /vue|nuxt/i, name: 'Vue/Nuxt' },
      { pattern: /angular|ng-/i, name: 'Angular' },
      { pattern: /svelte/i, name: 'Svelte' },
    ];

    for (const { pattern, name } of frameworkPatterns) {
      if (scriptSrcs.some(src => pattern.test(src)) ||
          inlineScriptContent.match(pattern)) {
        spaScore += 2;
        signals.push(`SPA: ${name} framework detected`);
      }
    }

    // Check for large number of script bundles (typical SPA)
    if (scriptSrcs.length > 5) {
      spaScore += 1;
      signals.push(`SPA: many script bundles (${scriptSrcs.length})`);
    }

    // === SSR Detection ===
    // Check for server-rendered content indicators
    const hasMultipleTextNodes = bodyText.length > 1000;
    if (hasMultipleTextNodes) {
      ssrScore += 1;
      signals.push('SSR: rich text content in initial HTML');
    }

    // Noscript tag with content suggests SSR fallback
    const noscript = root.querySelector('noscript');
    if (noscript && noscript.textContent.trim().length > 0) {
      ssrScore += 1;
      signals.push('SSR: noscript fallback content found');
    }

  } catch (error) {
    log.warn(`Detection parsing error for ${url}`, { error: error.message });
    signals.push(`Error during detection: ${error.message}`);
    // Default to SPA as safest strategy (waits for all network)
    spaScore += 5;
    signals.push('Defaulting to SPA strategy (safest)');
  }

  // Determine type using hierarchy: PWA > SPA > SSR
  let type, confidence;
  const totalScore = pwaScore + spaScore + ssrScore;

  if (pwaScore >= 4) {
    type = 'PWA';
    confidence = Math.min(100, Math.round((pwaScore / Math.max(totalScore, 1)) * 100));
  } else if (spaScore > ssrScore) {
    type = 'SPA';
    confidence = Math.min(100, Math.round((spaScore / Math.max(totalScore, 1)) * 100));
  } else if (ssrScore > 0) {
    type = 'SSR';
    confidence = Math.min(100, Math.round((ssrScore / Math.max(totalScore, 1)) * 100));
  } else {
    type = 'SPA'; // Default fallback
    confidence = 50;
    signals.push('No strong signals — defaulting to SPA');
  }

  const result = { type, confidence, signals };
  log.info(`Detected ${url} as ${type} (confidence: ${confidence}%)`, { signals });

  return result;
}

/**
 * Quick-fetch raw HTML for detection (no browser needed)
 * @param {string} url
 * @returns {Promise<string>} Raw HTML
 */
async function fetchRawHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'WebCrawlerBot/1.0 (Node.js; Detection Phase)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { detectSiteType, fetchRawHtml };
