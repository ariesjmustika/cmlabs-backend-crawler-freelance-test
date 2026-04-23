const BaseStrategy = require('./base');

/**
 * SSR Strategy
 * For Server-Side Rendered sites (traditional, WordPress, etc.)
 * Content is already in the HTML — uses domcontentloaded for speed.
 */
class SSRStrategy extends BaseStrategy {
  constructor() {
    super('SSR');
  }

  getWaitUntil() {
    return 'domcontentloaded';
  }

  getExtraWait() {
    return 0; // No extra wait needed — content is server-rendered
  }

  /**
   * Post-load: minimal checks since content is pre-rendered
   */
  async postLoad(page, options) {
    // Wait for images to load for better screenshot quality
    try {
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
    } catch (error) {
      this.log.debug('SSR load state wait skipped', { error: error.message });
    }
  }
}

module.exports = SSRStrategy;
