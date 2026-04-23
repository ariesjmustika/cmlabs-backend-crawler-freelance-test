const winston = require('winston');
const path = require('path');
const config = require('../config');
const fs = require('fs');

// Ensure logs directory exists
if (!fs.existsSync(config.logsDir)) {
  fs.mkdirSync(config.logsDir, { recursive: true });
}

const customFormat = winston.format.printf(({ level, message, timestamp, module, url, ...rest }) => {
  let log = `${timestamp} [${level.toUpperCase()}]`;
  if (module) log += ` [${module}]`;
  if (url) log += ` [${url}]`;
  log += ` ${message}`;
  const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return log + extra;
});

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true })
  ),
  transports: [
    // Console: colorized, human-readable
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
    }),
    // File: structured JSON
    new winston.transports.File({
      filename: path.join(config.logsDir, 'crawler.log'),
      format: winston.format.combine(
        winston.format.json()
      ),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
    }),
    // Error-only file
    new winston.transports.File({
      filename: path.join(config.logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.json()
      ),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

/**
 * Create a child logger with module context
 * @param {string} moduleName - Name of the module
 * @returns {winston.Logger}
 */
function createModuleLogger(moduleName) {
  return logger.child({ module: moduleName });
}

module.exports = { logger, createModuleLogger };
