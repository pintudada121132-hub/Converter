/**
 * Kotlin Android APK Packager Service (lib/services/apkPackagerService.js)
 * Compiles Kotlin sources & Android resources with aapt2 + kotlinc + javac + d8 + zipalign + apksigner (v1/v2/v3).
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildInjectedWebViewScript } from '../ads/adBlockRulesService.js';
import { signAndVerifyApk } from './apkSignerService.js';
import { generateAppIconPng } from './arscBuilderService.js';
import { ensureKotlinAndroidSdk } from './kotlinSdkSetupService.js';
import { generateKotlinAndroidProject } from './kotlinSourceGeneratorService.js';

const execFileAsync = promisify(execFile);

const JDK_BIN = 'C:\\Program Files\\Java\\jdk-25.0.5.0.2\\bin';
const JAVA_EXE = path.join(JDK_BIN, 'java.exe');
const JAVAC_EXE = path.join(JDK_BIN, 'javac.exe');
const JAR_EXE = path.join(JDK_BIN, 'jar.exe');

const OUTPUT_DIR = path.resolve('build', 'output');
const WORK_ROOT = path.resolve('build', 'kotlin-work');
const LATEST_KOTLIN_DIR = path.resolve('kotlin-android-project');

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

function makeApkFileName(appName) {
  const slug =
    String(appName || 'webapp')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'webapp';
  const stamp = Date.now().toString(36).slice(-4);
  return `${slug.slice(0, 24)}-${stamp}.apk`;
}

async function collectFilesByExt(dir, ext) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFilesByExt(full, ext)));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

export async function packageAndSignApk(config) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const sdk = await ensureKotlinAndroidSdk();

  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const workDir = path.join(WORK_ROOT, jobId);
  const projectDir = path.join(workDir, 'project');
  const compiledResDir = path.join(workDir, 'compiled-res');
  const genJavaDir = path.join(workDir, 'gen');
  const classesDir = path.join(workDir, 'classes');
  const dexOutDir = path.join(workDir, 'dex');

  await Promise.all([
    fs.mkdir(compiledResDir, { recursive: true }),
    fs.mkdir(genJavaDir, { recursive: true }),
    fs.mkdir(classesDir, { recursive: true }),
    fs.mkdir(dexOutDir, { recursive: true })
  ]);

  try {
    const parsedUrl = new URL(config.url);
    const targetHost = parsedUrl.hostname;

    const runtimeJs = buildInjectedWebViewScript({
      targetHost,
      responsiveFit: config.switches.responsiveFit,
      adBlocker: config.switches.adBlocker,
      redirectBlocker: config.switches.redirectBlocker,
      desktopMode: config.switches.desktopMode,
      swipeRefresh: config.switches.swipeRefresh
    });

    const iconPngBuf = generateAppIconPng(config.themeColor, config.customIconDataUrl);
    const offlineHtml = buildOfflineAssetHtml(config.appName, config.url, config.themeColor);
    const appConfigJson = JSON.stringify(
      {
        appName: config.appName,
        packageName: config.packageName,
        targetUrl: config.url,
        themeColor: config.themeColor,
        switches: config.switches,
        buildSystem: 'kotlin-android-aapt2-d8-apksigner',
        generatedAt: new Date().toISOString()
      },
      null,
      2
    );

    // 1. Generate Kotlin Android project files & sync latest snapshot for inspection
    await generateKotlinAndroidProject({
      projectDir,
      packageName: config.packageName,
      appName: config.appName,
      targetUrl: config.url,
      targetHost,
      themeColor: config.themeColor,
      iconPngBuf,
      offlineHtml,
      runtimeJs,
      appConfigJson,
      switches: config.switches
    });
    await fs.rm(LATEST_KOTLIN_DIR, { recursive: true, force: true }).catch(() => {});
    await fs.cp(projectDir, LATEST_KOTLIN_DIR, { recursive: true });

    // 2. Compile Android resources with aapt2
    await execFileAsync(sdk.aapt2, [
      'compile',
      '--dir',
      path.join(projectDir, 'res'),
      '-o',
      compiledResDir
    ]);

    const flatFiles = await collectFilesByExt(compiledResDir, '.flat');
    const unalignedApk = path.join(workDir, 'unaligned.apk');
    const alignedApk = path.join(workDir, 'aligned.apk');

    // 3. Link manifest, resources, and assets into base APK + generate R.java
    await execFileAsync(sdk.aapt2, [
      'link',
      '-o',
      unalignedApk,
      '-I',
      sdk.androidJar,
      '--manifest',
      path.join(projectDir, 'AndroidManifest.xml'),
      '-A',
      path.join(projectDir, 'assets'),
      '--java',
      genJavaDir,
      '--min-sdk-version',
      '21',
      '--target-sdk-version',
      '34',
      ...flatFiles
    ]);

    // 4. Compile generated R.java with javac (target 1.8 for Android DEX compatibility)
    const rJavaFiles = await collectFilesByExt(genJavaDir, '.java');
    if (rJavaFiles.length > 0) {
      await execFileAsync(JAVAC_EXE, [
        '-source',
        '1.8',
        '-target',
        '1.8',
        '-Xlint:-options',
        '-classpath',
        sdk.androidJar,
        '-d',
        classesDir,
        ...rJavaFiles
      ]);
    }

    // 5. Compile Kotlin Activity & WebViewClient with official JetBrains kotlinc
    const ktFiles = await collectFilesByExt(path.join(projectDir, 'src'), '.kt');
    await execFileAsync(
      JAVA_EXE,
      [
        '-Xmx1024m',
        '-jar',
        sdk.kotlinCompilerJar,
        '-no-jdk',
        '-jvm-target',
        '1.8',
        '-classpath',
        `${sdk.androidJar};${sdk.kotlinStdlibJar};${classesDir}`,
        '-d',
        classesDir,
        ...ktFiles
      ],
      { maxBuffer: 10 * 1024 * 1024 }
    );

    // 6. Convert JVM .class files + kotlin-stdlib into Android classes.dex using Google d8
    const classFiles = await collectFilesByExt(classesDir, '.class');
    await execFileAsync(
      JAVA_EXE,
      [
        '-Xmx1024m',
        '-cp',
        sdk.d8Jar,
        'com.android.tools.r8.D8',
        '--release',
        '--min-api',
        '21',
        '--lib',
        sdk.androidJar,
        '--output',
        dexOutDir,
        ...classFiles,
        sdk.kotlinStdlibJar
      ],
      { maxBuffer: 10 * 1024 * 1024 }
    );

    // 7. Insert classes.dex into unaligned APK archive
    await execFileAsync(JAR_EXE, ['uf', unalignedApk, '-C', dexOutDir, 'classes.dex']);

    // 8. 4-byte page align APK for Android 11+ compatibility
    await execFileAsync(sdk.zipalign, ['-p', '-f', '4', unalignedApk, alignedApk]);

    // 9. Sign and verify with official Google apksigner (v1 + v2 + v3)
    const fileName = makeApkFileName(config.appName);
    const finalApkPath = path.join(OUTPUT_DIR, fileName);
    const signResult = await signAndVerifyApk(alignedApk, finalApkPath, sdk.apksignerJar);
    const stat = await fs.stat(finalApkPath);

    return {
      fileName,
      filePath: finalApkPath,
      fileSize: stat.size,
      verified: signResult.verified,
      signatureSchemes: signResult.schemes,
      packageName: config.packageName,
      appName: config.appName,
      switches: config.switches
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
