const { sanitizeDomain, normalizeUrl } = require('../src/utils/sanitize');

describe('sanitizeDomain', () => {
  test('strips protocol and returns domain', () => {
    expect(sanitizeDomain('https://cmlabs.co')).toBe('cmlabs.co');
  });

  test('handles paths with slashes', () => {
    expect(sanitizeDomain('https://cmlabs.co/en/seo')).toBe('cmlabs.co_en_seo');
  });

  test('handles trailing slashes', () => {
    expect(sanitizeDomain('https://www.apple.com/id/')).toBe('www.apple.com_id');
  });

  test('handles subdomains', () => {
    expect(sanitizeDomain('https://blog.example.com')).toBe('blog.example.com');
  });

  test('lowercases output', () => {
    expect(sanitizeDomain('https://Example.COM/Path')).toBe('example.com_path');
  });
});

describe('normalizeUrl', () => {
  test('adds https if missing', () => {
    expect(normalizeUrl('cmlabs.co')).toBe('https://cmlabs.co/');
  });

  test('keeps existing protocol', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/');
  });

  test('normalizes URL', () => {
    const result = normalizeUrl('https://cmlabs.co');
    expect(result).toBe('https://cmlabs.co/');
  });
});

describe('detector', () => {
  const { detectSiteType } = require('../src/crawler/detector');

  test('detects SPA with empty root div', () => {
    const html = '<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
    const result = detectSiteType('https://test.com', html);
    expect(result.type).toBe('SPA');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('detects SSR with content', () => {
    const html = `<html><body><h1>Hello World</h1><p>${'Lorem ipsum '.repeat(100)}</p></body></html>`;
    const result = detectSiteType('https://test.com', html);
    expect(result.type).toBe('SSR');
  });

  test('detects PWA with manifest and SW', () => {
    const html = '<html><head><link rel="manifest" href="/manifest.json"></head><body><div id="root"></div><script>navigator.serviceWorker.register("/sw.js")</script></body></html>';
    const result = detectSiteType('https://test.com', html);
    expect(result.type).toBe('PWA');
  });

  test('returns signals array', () => {
    const html = '<html><body>test</body></html>';
    const result = detectSiteType('https://test.com', html);
    expect(Array.isArray(result.signals)).toBe(true);
  });
});
