const BaseStrategy = require('./base');

/**
 * SSR Strategy
 * For traditional server-side rendered sites.
 * Uses domcontentloaded for speed.
 */
class SSRStrategy extends BaseStrategy {
  constructor() {
    super('SSR');
  }

  getWaitUntil() {
    return 'domcontentloaded';
  }

  /**
   * Post-load: minimal checks since content is pre-rendered
   */
  async postLoad(page, options) {
    try {
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
      
      // Scroll simulation to trigger lazy-loaded images (e.g. apple.com)
      await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(resolve => setTimeout(resolve, 1000));
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500); // Wait for images to swap from placeholder to src

      // Double check: if it's SSR, the content should be there immediately
      const bodyLen = await page.evaluate(() => document.body.textContent.trim().length);
      if (bodyLen < 1000) {
        this.log.warn(`SSR Strategy warning: Body length is very short (${bodyLen} chars). Misidentified SPA? Waiting extra time...`);
        await page.waitForTimeout(3000); // Wait a bit to let any potential JS run
      }
    } catch (error) {
      this.log.debug('SSR load state wait skipped', { error: error.message });
    }
  }
}

module.exports = SSRStrategy;
