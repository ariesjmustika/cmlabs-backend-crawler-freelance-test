const BaseStrategy = require('./base');

/**
 * PWA Strategy
 * For Progressive Web Apps.
 * Uses networkidle + extra delay for service worker boot.
 * Checks SW registration status.
 */
class PWAStrategy extends BaseStrategy {
  constructor() {
    super('PWA');
  }

  getWaitUntil() {
    return 'load'; // Use 'load' instead of 'networkidle' for sites with persistent connections
  }

  getExtraWait() {
    return 1500; // Extra delay for service worker registration + activation
  }

  /**
   * Post-load: wait for service worker to register and activate
   */
  async postLoad(page, options) {
    try {
      // Wait for links to appear (especially important for SPA-based PWAs)
      await page.waitForSelector('a[href]', { timeout: 5000 }).catch(() => {
        this.log.debug('No <a> links found within timeout');
      });
      await page.waitForTimeout(2000); // Give it more time to stabilize rendering for Next.js

      // Check SW registration status
      const swStatus = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) {
          return { supported: false };
        }

        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          if (registrations && registrations.length > 0) {
            const reg = registrations[0];
            return {
              supported: true,
              registered: true,
              count: registrations.length,
              scope: reg.scope,
              active: !!reg.active,
            };
          }
          return { supported: true, registered: false };
        } catch (e) {
          return { supported: true, error: e.message };
        }
      });

      this.log.debug('Service Worker status', swStatus);

      // Wait for SW to become active if it's installing
      if (swStatus.installing) {
        this.log.debug('Waiting for service worker to activate...');
        await page.waitForTimeout(2000);
      }

      // Explicitly wait 1000ms after load to give SW time to register
      await page.waitForTimeout(1000);

      // Check navigator.serviceWorker.ready with a strict timeout (avoid infinite hang)
      await page.evaluate(async () => {
        if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise(resolve => setTimeout(resolve, 2000))
          ]);
        }
      }).catch(() => {});

      // Also wait for any SPA-like container content (PWAs are often SPAs too)
      await page.waitForFunction(() => {
        return document.body.innerHTML.length > 500;
      }, { timeout: 10000 }).catch(() => {
        this.log.debug('PWA content wait timed out, proceeding');
      });

      // Refine confidence: if we have an active SW controller, it's definitely a PWA
      const hasActiveController = await page.evaluate(() => !!navigator.serviceWorker.controller);
      if (hasActiveController) {
        return {
          detectionUpdate: {
            confidence: 95,
            signal: 'PWA: active service worker controller confirmed in rendered page'
          }
        };
      }

    } catch (error) {
      this.log.debug('PWA post-load check skipped', { error: error.message });
    }
  }
}

module.exports = PWAStrategy;