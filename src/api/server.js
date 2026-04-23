const express = require('express');
const path = require('path');
const config = require('../config');
const crawlRoutes = require('./routes/crawl');
const { createModuleLogger } = require('../utils/logger');

const log = createModuleLogger('server');

/**
 * Create and configure Express application
 * @returns {express.Application}
 */
function createApp() {
  const app = express();

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      log.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    });
    next();
  });

  // API routes
  app.use('/api', crawlRoutes);

  // Serve static UI dashboard
  app.use(express.static(path.join(__dirname, '../../ui')));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not found',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    log.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: config.nodeEnv === 'development' ? err.message : 'Something went wrong',
    });
  });

  return app;
}

/**
 * Start the Express server
 * @returns {Promise<http.Server>}
 */
function startServer() {
  const app = createApp();

  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      log.info(`🚀 Web Crawler API running on http://localhost:${config.port}`);
      log.info(`📊 Dashboard: http://localhost:${config.port}`);
      log.info(`📡 API Base: http://localhost:${config.port}/api`);
      log.info(`Environment: ${config.nodeEnv}`);
      resolve(server);
    });
  });
}

module.exports = { createApp, startServer };
