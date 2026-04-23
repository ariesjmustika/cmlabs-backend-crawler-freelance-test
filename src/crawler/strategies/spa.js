const BaseStrategy = require('./base');

/**
 * SPA Strategy
 * For Single Page Applications (React, Vue, Angular, etc.)
 * Uses networkidle to wait for all JS to execute and render.
 * Additional wait for SPA containers to populate.
 */
class SPAStrategy extends BaseStrategy {
  constructor() {
    super('SPA');
  }

  getWaitUntil() {
    return 'load'; // Use 'load' instead of 'networkidle' for sites with persistent connections (Supabase, WebSockets, Analytics)
  }

  getExtraWait() {
    return 500; // Extra buffer for late-rendering SPAs
  }

  /**
   * Post-load: wait for SPA container to have content
   */
  async postLoad(page, options) {
    try {
      // Wait for common SPA root containers to have children
      await page.waitForFunction(() => {
        const root = document.querySelector('#root') ||
                     document.querySelector('#app') ||
                     document.querySelector('#__next') ||
                     document.querySelector('[data-reactroot]');

        if (root) {
          // Verify that the root container actually has rendered content
          return root.innerHTML.length > 500;
        }

        // Fallback: body has substantial content
        return document.body.innerHTML.length > 1000;
      }, { timeout: 10000 });
    } catch (error) {
      this.log.debug('SPA container wait timed out or failed', { error: error.message });
    }
  }
}

module.exports = SPAStrategy;