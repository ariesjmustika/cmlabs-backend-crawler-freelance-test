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
      // Check SW registration status
      const swStatus = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) {
          return { supported: false };
        }

        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            return {
              supported: true,
              registered: true,
              scope: registration.scope,
              active: !!registration.active,
              waiting: !!registration.waiting,
              installing: !!registration.installing,
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

      // Also wait for any SPA-like container content (PWAs are often SPAs too)
      await page.waitForFunction(() => {
        return document.body.textContent.trim().length > 200;
      }, { timeout: 5000 }).catch(() => {
        this.log.debug('PWA content wait timed out, proceeding');
      });

    } catch (error) {
      this.log.debug('PWA post-load check skipped', { error: error.message });
    }
  }
}

module.exports = PWAStrategy;