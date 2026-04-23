#!/usr/bin/env node

/**
 * Web Crawler API — Entry Point
 * 
 * Usage:
 *   node index.js serve                    — Start API server
 *   node index.js crawl <url> [options]    — CLI single crawl
 * 
 * CLI Options:
 *   --timeout <ms>       Crawl timeout (default: 30000)
 *   --no-fullpage        Viewport-only screenshot
 *   --wait-extra <ms>    Extra wait time after load
 *   --browser <name>     Browser: chromium|firefox|webkit
 *   --force              Skip cache, force re-crawl
 */

require('dotenv').config();
const { createModuleLogger } = require('./src/utils/logger');

const log = createModuleLogger('main');

const args = process.argv.slice(2);
const command = args[0] || 'serve';

async function main() {
  try {
    switch (command) {
      case 'serve':
      case 'server':
        await startServer();
        break;

      case 'crawl':
        await runCLICrawl();
        break;

      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;

      default:
        // If it looks like a URL, treat it as a crawl command
        if (command.startsWith('http') || command.includes('.')) {
          args.unshift('crawl');
          await runCLICrawl();
        } else {
          console.error(`Unknown command: ${command}`);
          printHelp();
          process.exit(1);
        }
    }
  } catch (error) {
    log.error('Fatal error', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

async function startServer() {
  const { startServer } = require('./src/api/server');
  await startServer();
}

async function runCLICrawl() {
  const url = args[1] || args[0];

  if (!url || url.startsWith('--')) {
    console.error('Error: URL is required');
    console.log('Usage: node index.js crawl <url> [options]');
    process.exit(1);
  }

  // Parse CLI options
  const options = {};
  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case '--timeout':
        options.timeout = parseInt(args[++i]);
        break;
      case '--no-fullpage':
        options.fullPage = false;
        break;
      case '--wait-extra':
        options.waitExtra = parseInt(args[++i]);
        break;
      case '--browser':
        options.browser = args[++i];
        break;
      case '--force':
        options.forceRefresh = true;
        break;
    }
  }

  const { crawl } = require('./src/crawler');
  const browserManager = require('./src/crawler/browser');

  console.log(`\n🕷️  Web Crawler`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`URL:     ${url}`);
  console.log(`Browser: ${options.browser || 'chromium'}`);
  console.log(`Timeout: ${options.timeout || 30000}ms`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\nCrawling...\n`);

  try {
    const result = await crawl(url, options);

    console.log(`\n✅ Crawl Complete`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Site Type:   ${result.siteType}`);
    console.log(`Duration:    ${result.duration}ms`);
    console.log(`Title:       ${result.metadata?.title || 'N/A'}`);
    console.log(`From Cache:  ${result.fromCache ? 'Yes' : 'No'}`);
    console.log(`\nFiles:`);
    console.log(`  HTML:       ${result.files?.html || 'N/A'}`);
    console.log(`  Screenshot: ${result.files?.screenshot || 'N/A'}`);
    console.log(`  Metadata:   ${result.files?.json || 'N/A'}`);

    if (result.detection) {
      console.log(`\nDetection:`);
      console.log(`  Type:       ${result.detection.type}`);
      console.log(`  Confidence: ${result.detection.confidence}%`);
      console.log(`  Signals:`);
      result.detection.signals.forEach(s => console.log(`    • ${s}`));
    }

    if (result.links) {
      console.log(`\nLinks:`);
      console.log(`  Internal:   ${result.links.totalInternal || 0}`);
      console.log(`  External:   ${result.links.totalExternal || 0}`);
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  } catch (error) {
    console.error(`\n❌ Crawl Failed: ${error.message}\n`);
    process.exit(1);
  } finally {
    await browserManager.shutdown();
    process.exit(0);
  }
}

function printHelp() {
  console.log(`
🕷️  Web Crawler API v1.0.0

USAGE:
  node index.js serve                     Start API server (default)
  node index.js crawl <url> [options]     Crawl a single URL

OPTIONS:
  --timeout <ms>        Crawl timeout in ms (default: 30000)
  --no-fullpage         Viewport-only screenshot (no scroll)
  --wait-extra <ms>     Extra wait time after page load
  --browser <name>      Browser: chromium | firefox | webkit
  --force               Skip cache, force re-crawl
  --help                Show this help message

EXAMPLES:
  node index.js serve
  node index.js crawl https://cmlabs.co
  node index.js crawl https://apple.com/id/ --browser firefox --force
  node index.js crawl https://sequence.day --timeout 45000

API ENDPOINTS:
  POST /api/crawl              Trigger a crawl job
  GET  /api/results            List all results
  GET  /api/results/:domain    Get result by domain
  GET  /api/download/:d/:f     Download file
  GET  /api/status             System status
  GET  /health                 Health check
`);
}

main();
