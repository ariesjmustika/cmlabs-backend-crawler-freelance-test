const { createModuleLogger } = require('./logger');
const config = require('../config');

const log = createModuleLogger('retry');

/**
 * Generic async retry wrapper with exponential backoff
 * 
 * @param {Function} fn - Async function to retry
 * @param {Object} options
 * @param {number} options.attempts - Number of attempts (default: config.retryAttempts)
 * @param {number} options.baseDelay - Base delay in ms (default: config.retryBaseDelay)
 * @param {string} options.label - Label for logging
 * @returns {Promise<*>} Result of the function
 */
async function retry(fn, options = {}) {
  const {
    attempts = config.retryAttempts,
    baseDelay = config.retryBaseDelay,
    label = 'operation',
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await fn(attempt);
      if (attempt > 1) {
        log.info(`${label} succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt < attempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        log.warn(`${label} failed on attempt ${attempt}/${attempts}. Retrying in ${delay}ms...`, {
          error: error.message,
        });
        await sleep(delay);
      } else {
        log.error(`${label} failed after ${attempts} attempts`, {
          error: error.message,
        });
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { retry, sleep };
