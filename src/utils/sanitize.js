const { URL } = require('url');

/**
 * Convert a URL to a safe directory/file name
 * Strips protocol, replaces special chars, removes trailing slashes
 * 
 * @param {string} urlString - The URL to sanitize
 * @returns {string} Safe folder name
 * 
 * @example
 * sanitizeDomain('https://cmlabs.co') → 'cmlabs.co'
 * sanitizeDomain('https://cmlabs.co/en/seo') → 'cmlabs.co_en_seo'
 * sanitizeDomain('https://www.apple.com/id/') → 'www.apple.com_id'
 */
function sanitizeDomain(urlString) {
  try {
    const url = new URL(urlString);
    let name = url.hostname + url.pathname;

    // Remove trailing slash
    name = name.replace(/\/+$/, '');

    // Replace path separators with underscores
    name = name.replace(/\//g, '_');

    // Remove any unsafe filesystem characters
    name = name.replace(/[<>:"|?*\\]/g, '_');

    // Collapse multiple underscores
    name = name.replace(/_+/g, '_');

    // Remove leading/trailing underscores
    name = name.replace(/^_|_$/g, '');

    return name.toLowerCase();
  } catch (error) {
    // Fallback: hash the string
    return urlString
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toLowerCase();
  }
}

/**
 * Validate and normalize a URL
 * @param {string} urlString 
 * @returns {string} Normalized URL
 */
function normalizeUrl(urlString) {
  // Add protocol if missing
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = 'https://' + urlString;
  }
  const url = new URL(urlString);
  return url.href;
}

module.exports = { sanitizeDomain, normalizeUrl };
