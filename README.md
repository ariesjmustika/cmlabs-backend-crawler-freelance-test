# Web Crawler API

A scalable Node.js Web Crawler API built with Playwright and Express. It intelligently detects Single Page Applications (SPA), Server-Side Rendered (SSR) sites, and Progressive Web Apps (PWA) to apply the optimal crawling strategy.

## Features

- **Smart Detection**: Analyzes HTML signals to detect SPA, SSR, or PWA and uses the appropriate waiting strategy (`networkidle`, `domcontentloaded`, or custom SW delays).
- **Multiple Browsers**: Support for Chromium, Firefox, and WebKit via Playwright.
- **Outputs**: Generates rendered HTML, rich JSON metadata (SEO, performance, links, assets), and full-page PNG screenshots.
- **Concurrency & Reliability**: Browser pooling with semaphore limits, 3x exponential backoff retries, and file-based caching.
- **API & CLI**: Dual-mode entry point. Run as a REST API server or use the CLI for single crawls.
- **Dashboard**: Premium glassmorphism UI to trigger crawls and view results.

## Prerequisites

- Node.js >= 18
- `npm install` (will also install Playwright browser binaries)

## Installation

```bash
git clone <repository>
cd web-crawler
npm install
npm run dev # Or npm start
```

## CLI Usage

```bash
node index.js crawl <url> [options]

Options:
  --timeout <ms>        Crawl timeout in ms (default: 30000)
  --no-fullpage         Viewport-only screenshot (no scroll)
  --wait-extra <ms>     Extra wait time after page load
  --browser <name>      Browser: chromium | firefox | webkit
  --force               Skip cache, force re-crawl
```

Example:
```bash
node index.js crawl https://cmlabs.co
node index.js crawl https://www.apple.com/id/ --browser firefox
```

## API Endpoints

Start the server:
```bash
npm start
```
The dashboard will be available at `http://localhost:3000`.

### `POST /api/crawl`
Trigger a crawl.
```json
{
  "url": "https://sequence.day",
  "options": {
    "timeout": 30000,
    "fullPage": true,
    "browser": "chromium"
  }
}
```

### `GET /api/results`
List all crawled domains.

### `GET /api/results/:domain`
Get metadata for a specific domain.

### `GET /api/download/:domain/:file`
Download specific output (`index.html`, `metadata.json`, `screenshot.png`).

## Architecture

- **`src/crawler/detector.js`**: Detects site type using `node-html-parser`.
- **`src/crawler/strategies/`**: Strategy Pattern for SPA, SSR, PWA.
- **`src/crawler/browser.js`**: Browser pool manager.
- **`src/api/`**: Express routes, rate limiting, and Joi validation.
- **`ui/index.html`**: Vanilla HTML/JS frontend dashboard.
