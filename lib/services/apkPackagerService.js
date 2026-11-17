/**
 * APK ZIP Packager Service (lib/services/apkPackagerService.js)
 * Packages manifest, DEX bytecode, resources, icon, and runtime assets into a signed APK file.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildInjectedWebViewScript } from '../ads/adBlockRulesService.js';
import { signAndVerifyApk } from './apkSignerService.js';
import { buildResourcesArsc, crc32Buffer, generateAppIconPng } from './arscBuilderService.js';
import { buildBinaryManifest } from './axmlBuilderService.js';
import { buildClassesDex } from './dexBuilderService.js';

const OUTPUT_DIR = path.resolve('build', 'output');

function buildOfflineAssetHtml(appName, targetUrl, themeColor) {
  const safeName = String(appName || 'App').replace(/[<>&"]/g, '');
  const safeUrl = String(targetUrl || '').replace(/[<>&"]/g, '');
  const safeColor = /^#[0-9a-f]{6}$/i.test(themeColor || '') ? themeColor : '#2563EB';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>No Internet - ${safeName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #F8FAFC; color: #0F172A; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 28px 24px; max-width: 360px; width: 100%; text-align: center; }
    .badge { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 14px; background: #EFF6FF; color: ${safeColor}; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 20px; }
    button { width: 100%; background: ${safeColor}; color: #FFFFFF; border: none; border-radius: 12px; padding: 12px 18px; font-size: 15px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">!</div>
    <h1>No Internet Connection</h1>
    <p>Please check your Wi-Fi or Mobile Data connection to load ${safeName}, then tap Retry.</p>
    <button onclick="window.location.href='${safeUrl}'">Retry Connection</button>
  </div>
</body>
</html>`;
}

function buildZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0xf) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = crc32Buffer(rawBuf);

    const method = entry.store ? 0 : 8;
    const payload = entry.store ? rawBuf : zlib.deflateRawSync(rawBuf, { level: 6 });

    // Local file header (30 bytes + name)
    const localHdr = Buffer.alloc(30);
    localHdr.writeUInt32LE(0x04034b50, 0);
    localHdr.writeUInt16LE(20, 4); // version needed
    localHdr.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHdr.writeUInt16LE(method, 8);
    localHdr.writeUInt16LE(dosTime, 10);
    localHdr.writeUInt16LE(dosDate, 12);
    localHdr.writeUInt32LE(crc, 14);
    localHdr.writeUInt32LE(payload.length, 18);
    localHdr.writeUInt32LE(rawBuf.length, 22);
    localHdr.writeUInt16LE(nameBuf.length, 26);
    localHdr.writeUInt16LE(0, 28); // extra len

    localParts.push(localHdr, nameBuf, payload);

    // Central directory header (46 bytes + name)
    const cdHdr = Buffer.alloc(46);
    cdHdr.writeUInt32LE(0x02014b50, 0);
    cdHdr.writeUInt16LE(20, 4);
    cdHdr.writeUInt16LE(20, 6);
    cdHdr.writeUInt16LE(0x0800, 8);
    cdHdr.writeUInt16LE(method, 10);
    cdHdr.writeUInt16LE(dosTime, 12);
    cdHdr.writeUInt16LE(dosDate, 14);
    cdHdr.writeUInt32LE(crc, 16);
    cdHdr.writeUInt32LE(payload.length, 20);
    cdHdr.writeUInt32LE(rawBuf.length, 24);
    cdHdr.writeUInt16LE(nameBuf.length, 28);
    cdHdr.writeUInt16LE(0, 30);
    cdHdr.writeUInt16LE(0, 32);
    cdHdr.writeUInt16LE(0, 34);
    cdHdr.writeUInt16LE(0, 36);
    cdHdr.writeUInt32LE(0, 38);
    cdHdr.writeUInt32LE(offset, 42);

    centralParts.push(cdHdr, nameBuf);
    offset += localHdr.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function makeApkFileName(appName) {
  const slug = String(appName || 'webapp')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'webapp';
  const stamp = Date.now().toString(36).slice(-4);
  return `${slug.slice(0, 24)}-${stamp}.apk`;
}

export async function packageAndSignApk(config) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const parsedUrl = new URL(config.url);
  const targetHost = parsedUrl.hostname;

  const injectedJs = buildInjectedWebViewScript({
    targetHost,
    responsiveFit: config.switches.responsiveFit,
    adBlocker: config.switches.adBlocker,
    redirectBlocker: config.switches.redirectBlocker,
    desktopMode: config.switches.desktopMode,
    swipeRefresh: config.switches.swipeRefresh
  });

  const manifestBuf = buildBinaryManifest({
    packageName: config.packageName,
    appName: config.appName,
    fullScreen: config.switches.fullScreen
  });

  const arscBuf = buildResourcesArsc(config.packageName);
  const iconPngBuf = generateAppIconPng(config.themeColor, config.customIconDataUrl);

  const dexBuf = buildClassesDex({
    packageName: config.packageName,
    targetUrl: config.url,
    targetHost,
    injectedJs,
    switches: config.switches
  });

  const appConfigJson = JSON.stringify(
    {
      appName: config.appName,
      packageName: config.packageName,
      targetUrl: config.url,
      themeColor: config.themeColor,
      switches: config.switches,
      generatedAt: new Date().toISOString()
    },
    null,
    2
  );

  const offlineHtml = buildOfflineAssetHtml(config.appName, config.url, config.themeColor);

  const zipBuf = buildZipBuffer([
    { name: 'AndroidManifest.xml', data: manifestBuf, store: false },
    { name: 'classes.dex', data: dexBuf, store: false },
    { name: 'resources.arsc', data: arscBuf, store: true },
    { name: 'res/drawable/icon.png', data: iconPngBuf, store: true },
    { name: 'assets/app_config.json', data: appConfigJson, store: false },
    { name: 'assets/offline.html', data: offlineHtml, store: false }
  ]);

  const fileName = makeApkFileName(config.appName);
  const outputPath = path.join(OUTPUT_DIR, fileName);
  await fs.writeFile(outputPath, zipBuf);

  const signResult = await signAndVerifyApk(outputPath);
  const stat = await fs.stat(outputPath);

  return {
    fileName,
    filePath: outputPath,
    fileSize: stat.size,
    verified: signResult.verified,
    packageName: config.packageName,
    appName: config.appName,
    switches: config.switches
  };
}
