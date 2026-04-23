const Joi = require('joi');
const config = require('../../config');

/**
 * Joi validation schema for crawl request body
 */
const crawlSchema = Joi.object({
  url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .messages({
      'string.uri': 'URL must be a valid HTTP or HTTPS URL',
      'any.required': 'URL is required',
    }),
  options: Joi.object({
    timeout: Joi.number()
      .integer()
      .min(5000)
      .max(60000)
      .default(config.crawlTimeout)
      .messages({
        'number.min': 'Timeout must be at least 5000ms',
        'number.max': 'Timeout cannot exceed 60000ms',
      }),
    fullPage: Joi.boolean()
      .default(true),
    waitExtra: Joi.number()
      .integer()
      .min(0)
      .max(10000)
      .default(0)
      .messages({
        'number.max': 'Extra wait time cannot exceed 10000ms',
      }),
    browser: Joi.string()
      .valid(...config.supportedBrowsers)
      .default(config.defaultBrowser)
      .messages({
        'any.only': `Browser must be one of: ${config.supportedBrowsers.join(', ')}`,
      }),
    forceRefresh: Joi.boolean()
      .default(false),
  }).default({}),
}).options({ stripUnknown: true });

/**
 * Express middleware for validating crawl request body
 */
function validateCrawl(req, res, next) {
  const { error, value } = crawlSchema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map(d => ({
      field: d.path.join('.'),
      message: d.message,
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors,
    });
  }

  // Replace body with validated + defaults-applied values
  req.body = value;
  next();
}

module.exports = { validateCrawl, crawlSchema };
