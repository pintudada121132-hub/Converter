/**
 * Website Auto-Detect API Service (lib/api/detectWebsiteApi.js)
 * Validates URL, fetches page HTML metadata, checks mobile responsiveness, and provides fallback data.
 */

const RESERVED_JAVA_WORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while'
]);

export function normalizeWebsiteUrl(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Please enter a website URL (e.g. wikipedia.org).' };
  }
  if (/^(javascript|data|file|vbscript):/i.test(trimmed)) {
    return { valid: false, error: 'Only http:// or https:// website URLs are allowed.' };
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
      return { valid: false, error: 'Please enter a valid domain name (e.g. example.com).' };
    }
    return { valid: true, url: parsed.toString(), parsed };
  } catch {
    return { valid: false, error: 'Invalid URL format. Example: https://example.com' };
  }
}

export function buildAndroidPackageName(hostname) {
  const cleanHost = String(hostname || 'app')
    .toLowerCase()
    .replace(/^www\./, '');
  const rawParts = cleanHost.split('.').filter(Boolean);
  const slugPart = (rawParts[0] || 'website')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^_+|_+$/g, '') || 'website';
  let safeSegment = slugPart;
  if (/^[0-9]/.test(safeSegment) || RESERVED_JAVA_WORDS.has(safeSegment)) {
    safeSegment = `app_${safeSegment}`;
  }
  return `com.web2apk.${safeSegment.slice(0, 28)}`;
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveTitleFromHost(hostname) {
  const base = String(hostname || 'WebApp')
    .replace(/^www\./i, '')
    .split('.')[0] || 'WebApp';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function extractTagAttr(tagHtml, attrName) {
  const re = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tagHtml.match(re);
  return m ? (m[1] || m[2] || m[3] || '').trim() : '';
}

function parseMetadataFromHtml(html, finalUrl) {
  const parsedUrl = new URL(finalUrl);
  const fallbackName = deriveTitleFromHost(parsedUrl.hostname);

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';

  let appName = fallbackName;
  let themeColor = '#2563EB';
  let iconUrl = `${parsedUrl.origin}/favicon.ico`;
  let hasViewportMeta = false;
  let isMobileOptimized = false;

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const name = extractTagAttr(tag, 'name').toLowerCase();
    const prop = extractTagAttr(tag, 'property').toLowerCase();
    const content = extractTagAttr(tag, 'content');

    if ((prop === 'og:site_name' || name === 'application-name') && content) {
      appName = decodeHtmlEntities(content).slice(0, 32);
    }
    if (name === 'theme-color' && /^#[0-9a-f]{3,6}$/i.test(content)) {
      themeColor = content;
    }
    if (name === 'viewport') {
      hasViewportMeta = true;
      if (/width\s*=\s*device-width/i.test(content)) {
        isMobileOptimized = true;
      }
    }
  }

  if (appName === fallbackName && rawTitle) {
    const shortTitle = rawTitle.split(/\s*[\-|–—|:]\s*/)[0].trim();
    appName = (shortTitle || rawTitle).slice(0, 32);
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const rel = extractTagAttr(tag, 'rel').toLowerCase();
    const href = extractTagAttr(tag, 'href');
    if (href && (rel.includes('apple-touch-icon') || rel.includes('icon'))) {
      try {
        iconUrl = new URL(href, finalUrl).toString();
        if (rel.includes('apple-touch-icon')) break;
      } catch {
        // ignore invalid icon href
      }
    }
  }

  return {
    appName: appName || fallbackName,
    pageTitle: rawTitle || appName || fallbackName,
    themeColor,
    iconUrl,
    hasViewportMeta,
    isMobileOptimized
  };
}

export async function handleDetectWebsite(rawUrl) {
  const normalized = normalizeWebsiteUrl(rawUrl);
  if (!normalized.valid) {
    return { status: 400, body: { success: false, error: normalized.error } };
  }

  const targetUrl = normalized.url;
  const parsed = normalized.parsed;
  const packageName = buildAndroidPackageName(parsed.hostname);
  const fallbackName = deriveTitleFromHost(parsed.hostname);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      return {
        status: 200,
        body: {
          success: true,
          isFallback: true,
          warning: `The website returned HTTP ${response.status} (bot protection may be enabled). Default settings were filled in and can be edited manually.`,
          url: targetUrl,
          finalUrl: response.url || targetUrl,
          hostname: parsed.hostname,
          appName: fallbackName,
          pageTitle: fallbackName,
          packageName,
          themeColor: '#2563EB',
          iconUrl: `${parsed.origin}/favicon.ico`,
          isMobileOptimized: false,
          recommendedSwitches: {
            responsiveFit: true,
            adBlocker: true,
            redirectBlocker: true
          }
        }
      };
    }

    const html = (await response.text()).slice(0, 200000);
    const finalUrl = response.url || targetUrl;
    const finalParsed = new URL(finalUrl);
    const meta = parseMetadataFromHtml(html, finalUrl);

    return {
      status: 200,
      body: {
        success: true,
        isFallback: false,
        warning: null,
        url: targetUrl,
        finalUrl,
        hostname: finalParsed.hostname,
        appName: meta.appName,
        pageTitle: meta.pageTitle,
        packageName: buildAndroidPackageName(finalParsed.hostname),
        themeColor: meta.themeColor,
        iconUrl: meta.iconUrl,
        hasViewportMeta: meta.hasViewportMeta,
        isMobileOptimized: meta.isMobileOptimized,
        recommendedSwitches: {
          responsiveFit: true,
          adBlocker: true,
          redirectBlocker: true
        }
      }
    };
  } catch (err) {
    return {
      status: 200,
      body: {
        success: true,
        isFallback: true,
        warning:
          'Could not auto-fetch the website right now (network timeout or offline). Default app details have been set so you can still edit and build your APK.',
        errorDetail: err?.message || 'Fetch failed',
        url: targetUrl,
        finalUrl: targetUrl,
        hostname: parsed.hostname,
        appName: fallbackName,
        pageTitle: fallbackName,
        packageName,
        themeColor: '#2563EB',
        iconUrl: '',
        isMobileOptimized: false,
        recommendedSwitches: {
          responsiveFit: true,
          adBlocker: true,
          redirectBlocker: true
        }
      }
    };
  }
}
