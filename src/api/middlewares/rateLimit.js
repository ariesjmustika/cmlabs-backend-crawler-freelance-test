const rateLimit = require('express-rate-limit');
const config = require('../../config');

/**
 * Rate limiter middleware
 */
const crawlRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'Too many requests',
    message: `Rate limit exceeded. Maximum ${config.rateLimit.max} requests per ${config.rateLimit.windowMs / 1000} seconds.`,
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
});

const apiRateLimiter = rateLimit({
  windowMs: 60000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    error: 'Too many requests',
    message: 'API rate limit exceeded.',
  },
});

module.exports = { crawlRateLimiter, apiRateLimiter };
