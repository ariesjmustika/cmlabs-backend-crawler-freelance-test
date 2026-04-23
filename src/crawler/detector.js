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
    const bodyText = root.querySelector('body')?.textContent.trim() || '';

    // === PWA Detection (Max 100) ===
    const manifestLink = root.querySelector('link[rel="manifest"]');
    if (manifestLink) { pwaScore += 45; signals.push('PWA: manifest link found'); }

    const scripts = root.querySelectorAll('script');
    const inlineScriptContent = scripts.map(s => s.textContent || '').join(' ');
    const hasSw = inlineScriptContent.includes('serviceWorker') || root.querySelector('link[rel="serviceworker"]');
    if (hasSw) { pwaScore += 40; signals.push('PWA: service worker detected'); }

    if (root.querySelector('meta[name="theme-color"]')) { pwaScore += 10; signals.push('PWA: theme-color meta'); }
    if (root.querySelector('link[rel="apple-touch-icon"]')) { pwaScore += 10; signals.push('PWA: apple-touch-icon'); }

    // === SSR Detection (Max 100) ===
    if (rawHtml.length > 2000) {
      ssrScore += 60;
      signals.push(`SSR: rawHtml > 2000 chars (${rawHtml.length})`);
    }
    
    if (root.querySelector('link[rel="canonical"]')) { ssrScore += 10; signals.push('SSR: canonical tag in raw HTML'); }
    if (root.querySelector('meta[property="og:title"]')) { ssrScore += 10; signals.push('SSR: og:title in raw HTML'); }
    if (rawHtml.length > 5000) { ssrScore += 10; signals.push('SSR: massive raw content (>5000)'); }

    // === SPA Detection (Max 100) ===
    if (rawHtml.length < 1000) {
      spaScore += 50;
      signals.push(`SPA: rawHtml < 1000 chars (${rawHtml.length})`);
    }

    const rootDiv = root.querySelector('#root') || root.querySelector('#app') || root.querySelector('#__next');
    if (rootDiv && rootDiv.textContent.trim().length < 50) {
      spaScore += 30;
      signals.push(`SPA: empty container in raw (#${rootDiv.id || 'app'})`);
    }

    const scriptSrcs = scripts.map(s => s.getAttribute('src') || '').filter(Boolean);
    if (scriptSrcs.length > 5) {
      spaScore += 10;
      signals.push(`SPA: many script bundles (${scriptSrcs.length})`);
    }

  } catch (error) {
    log.warn(`Detection parsing error for ${url}`, { error: error.message });
    signals.push(`Error during detection: ${error.message}`);
    spaScore += 50;
  }

  // Determine type using hierarchy: PWA > SSR > SPA (Priority order)
  let type, confidence;

  if (pwaScore >= 40 || (pwaScore > ssrScore && pwaScore > spaScore)) {
    type = 'PWA';
    confidence = Math.min(99, Math.max(75, pwaScore));
  } else if (ssrScore > spaScore) {
    type = 'SSR';
    confidence = Math.min(99, Math.max(85, ssrScore));
  } else if (spaScore > 0) {
    type = 'SPA';
    confidence = Math.min(99, Math.max(85, spaScore));
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      log.warn(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    log.debug(`Fetch raw HTML success: ${text.length} chars`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { detectSiteType, fetchRawHtml };
