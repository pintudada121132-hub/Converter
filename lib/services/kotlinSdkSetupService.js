/**
 * Kotlin & Android SDK Portable Toolchain Manager (lib/services/kotlinSdkSetupService.js)
 * Resolves and ensures official Android Build-Tools 34, Platform 34, and JetBrains Kotlin compiler.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SDK_ROOT = path.resolve('tools', 'android-kotlin-sdk');
const DOWNLOAD_TMP = path.join(SDK_ROOT, '_tmp');

const ARTIFACTS = [
  {
    name: 'build-tools-34',
    url: 'https://dl.google.com/android/repository/build-tools_r34-windows.zip',
    extractDir: path.join(SDK_ROOT, 'build-tools')
  },
  {
    name: 'platform-34',
    url: 'https://dl.google.com/android/repository/platform-34-ext12_r01.zip',
    extractDir: path.join(SDK_ROOT, 'platforms')
  },
  {
    name: 'kotlin-compiler',
    url: 'https://github.com/JetBrains/kotlin/releases/download/v2.1.10/kotlin-compiler-2.1.10.zip',
    extractDir: path.join(SDK_ROOT, 'kotlin')
  }
];

async function findFileRecursive(dir, targetName) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) {
      return full;
    }
    if (entry.isDirectory()) {
      const found = await findFileRecursive(full, targetName);
      if (found) return found;
    }
  }
  return null;
}

export async function resolveToolchainPaths() {
  const [aapt2, zipalign, d8Jar, apksignerJar, androidJar, kotlinCompilerJar, kotlinStdlibJar] =
    await Promise.all([
      findFileRecursive(path.join(SDK_ROOT, 'build-tools'), 'aapt2.exe'),
      findFileRecursive(path.join(SDK_ROOT, 'build-tools'), 'zipalign.exe'),
      findFileRecursive(path.join(SDK_ROOT, 'build-tools'), 'd8.jar'),
      findFileRecursive(path.join(SDK_ROOT, 'build-tools'), 'apksigner.jar'),
      findFileRecursive(path.join(SDK_ROOT, 'platforms'), 'android.jar'),
      findFileRecursive(path.join(SDK_ROOT, 'kotlin'), 'kotlin-compiler.jar'),
      findFileRecursive(path.join(SDK_ROOT, 'kotlin'), 'kotlin-stdlib.jar')
    ]);

  const missing = [];
  if (!aapt2) missing.push('aapt2.exe');
  if (!zipalign) missing.push('zipalign.exe');
  if (!d8Jar) missing.push('d8.jar');
  if (!apksignerJar) missing.push('apksigner.jar');
  if (!androidJar) missing.push('android.jar');
  if (!kotlinCompilerJar) missing.push('kotlin-compiler.jar');
  if (!kotlinStdlibJar) missing.push('kotlin-stdlib.jar');

  return {
    ready: missing.length === 0,
    missing,
    paths: {
      aapt2,
      zipalign,
      d8Jar,
      apksignerJar,
      androidJar,
      kotlinCompilerJar,
      kotlinStdlibJar
    }
  };
}

async function downloadFile(url, destPath) {
  await execFileAsync(
    'curl.exe',
    ['-f', '-L', '--retry', '3', '--connect-timeout', '20', '-o', destPath, url],
    { maxBuffer: 10 * 1024 * 1024 }
  );
}

async function extractZipWindows(zipPath, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    ],
    { maxBuffer: 10 * 1024 * 1024 }
  );
}

export async function ensureKotlinAndroidSdk(onProgress) {
  const existing = await resolveToolchainPaths();
  if (existing.ready) {
    return existing.paths;
  }

  await fs.mkdir(DOWNLOAD_TMP, { recursive: true });

  for (const item of ARTIFACTS) {
    // Skip download if extractDir already provides required artifact
    const check = await resolveToolchainPaths();
    if (check.ready) break;

    const alreadyHasDir = await fs
      .access(item.extractDir)
      .then(() => true)
      .catch(() => false);

    if (!alreadyHasDir || (item.name === 'build-tools-34' && !check.paths.aapt2) || (item.name === 'platform-34' && !check.paths.androidJar) || (item.name === 'kotlin-compiler' && !check.paths.kotlinCompilerJar)) {
      onProgress?.(`Downloading ${item.name}...`);
      const zipPath = path.join(DOWNLOAD_TMP, `${item.name}.zip`);
      await downloadFile(item.url, zipPath);
      onProgress?.(`Extracting ${item.name}...`);
      await extractZipWindows(zipPath, item.extractDir);
      await fs.unlink(zipPath).catch(() => {});
    }
  }

  await fs.rm(DOWNLOAD_TMP, { recursive: true, force: true }).catch(() => {});

  const verified = await resolveToolchainPaths();
  if (!verified.ready) {
    throw new Error(`Kotlin Android SDK incomplete. Missing: ${verified.missing.join(', ')}`);
  }
  return verified.paths;
}
