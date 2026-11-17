/**
 * Build APK API Handler (lib/api/buildApkApi.js)
 * Validates build request parameters, sanitizes feature switches, and produces signed APK metadata.
 */

import { sanitizeSwitchState } from '../iap/featureConfigService.js';
import { packageAndSignApk } from '../services/apkPackagerService.js';
import { buildAndroidPackageName, normalizeWebsiteUrl } from './detectWebsiteApi.js';

function validatePackageName(pkg, hostname) {
  const cleaned = String(pkg || '').trim().toLowerCase();
  const pkgRegex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,4}$/;
  if (pkgRegex.test(cleaned)) {
    return cleaned;
  }
  return buildAndroidPackageName(hostname);
}

export async function handleBuildApk(payload = {}) {
  const normalized = normalizeWebsiteUrl(payload.url);
  if (!normalized.valid) {
    return {
      status: 400,
      body: { success: false, error: normalized.error }
    };
  }

  const appName = String(payload.appName || '').trim().slice(0, 32);
  if (!appName) {
    return {
      status: 400,
      body: { success: false, error: 'App Name cannot be empty. Please enter a name for your app.' }
    };
  }

  const switches = sanitizeSwitchState(payload.switches);
  const packageName = validatePackageName(payload.packageName, normalized.parsed.hostname);
  const themeColor = /^#[0-9a-f]{6}$/i.test(String(payload.themeColor || ''))
    ? String(payload.themeColor)
    : '#2563EB';

  try {
    const result = await packageAndSignApk({
      url: normalized.url,
      appName,
      packageName,
      themeColor,
      customIconDataUrl: typeof payload.customIconDataUrl === 'string' ? payload.customIconDataUrl : '',
      switches
    });

    return {
      status: 200,
      body: {
        success: true,
        fileName: result.fileName,
        fileSize: result.fileSize,
        downloadUrl: `/api/download/${encodeURIComponent(result.fileName)}`,
        packageName: result.packageName,
        appName: result.appName,
        verified: result.verified,
        switchesApplied: result.switches
      }
    };
  } catch (err) {
    return {
      status: 500,
      body: {
        success: false,
        error: 'A technical error occurred while building the APK. Please click Retry.',
        detail: err?.message || 'Build failure'
      }
    };
  }
}
