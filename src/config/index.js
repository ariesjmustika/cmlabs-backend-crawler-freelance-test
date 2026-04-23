const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = Object.freeze({
  // Server
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Crawler
  concurrentLimit: parseInt(process.env.CONCURRENT_LIMIT) || 3,
  crawlTimeout: parseInt(process.env.CRAWL_TIMEOUT) || 30000,
  defaultBrowser: process.env.DEFAULT_BROWSER || 'chromium', // chromium | firefox | webkit

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 10,
  },

  // Cache
  cacheTTL: parseInt(process.env.CACHE_TTL_MS) || 3600000, // 1 hour

  // Paths
  resultsDir: path.join(__dirname, '../../results'),
  logsDir: path.join(__dirname, '../../logs'),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Retry
  retryAttempts: 3,
  retryBaseDelay: 1000, // ms, exponential backoff: 1s, 2s, 4s

  // Screenshot
  defaultViewport: { width: 1920, height: 1080 },

  // Supported browsers
  supportedBrowsers: ['chromium', 'firefox', 'webkit'],
});

module.exports = config;
