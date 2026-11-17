/**
 * APK Signer Service (lib/services/apkSignerService.js)
 * Creates/reuses debug keystore via keytool.exe and signs/verifies APKs using official Google apksigner (v1 + v2 + v3).
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const JDK_BIN = 'C:\\Program Files\\Java\\jdk-25.0.5.0.2\\bin';
const JAVA_EXE = path.join(JDK_BIN, 'java.exe');
const KEYTOOL_EXE = path.join(JDK_BIN, 'keytool.exe');

const KEYSTORE_DIR = path.resolve('build', 'keystore');
const KEYSTORE_PATH = path.join(KEYSTORE_DIR, 'debug.keystore');
const KEY_ALIAS = 'androiddebugkey';
const STORE_PASS = 'android';
const KEY_PASS = 'android';

async function ensureDebugKeystore() {
  await fs.mkdir(KEYSTORE_DIR, { recursive: true });
  try {
    await fs.access(KEYSTORE_PATH);
    return KEYSTORE_PATH;
  } catch {
    await execFileAsync(KEYTOOL_EXE, [
      '-genkeypair',
      '-noprompt',
      '-keystore',
      KEYSTORE_PATH,
      '-storepass',
      STORE_PASS,
      '-alias',
      KEY_ALIAS,
      '-keypass',
      KEY_PASS,
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-dname',
      'CN=Web2APK Builder, OU=Mobile, O=Converter, L=Local, S=Local, C=IN'
    ]);
    return KEYSTORE_PATH;
  }
}

export async function signAndVerifyApk(alignedApkPath, finalApkPath, apksignerJarPath) {
  const keystorePath = await ensureDebugKeystore();

  await execFileAsync(JAVA_EXE, [
    '--enable-native-access=ALL-UNNAMED',
    '-jar',
    apksignerJarPath,
    'sign',
    '--ks',
    keystorePath,
    '--ks-pass',
    `pass:${STORE_PASS}`,
    '--key-pass',
    `pass:${KEY_PASS}`,
    '--ks-key-alias',
    KEY_ALIAS,
    '--v1-signing-enabled',
    'true',
    '--v2-signing-enabled',
    'true',
    '--v3-signing-enabled',
    'true',
    '--out',
    finalApkPath,
    alignedApkPath
  ]);

  const { stdout, stderr } = await execFileAsync(JAVA_EXE, [
    '--enable-native-access=ALL-UNNAMED',
    '-jar',
    apksignerJarPath,
    'verify',
    '--verbose',
    finalApkPath
  ]);

  const output = `${stdout || ''}\n${stderr || ''}`.trim();
  const v2Ok = /Verified using v2 scheme.*true/i.test(output);
  const v3Ok = /Verified using v3 scheme.*true/i.test(output);

  if (!v2Ok && !v3Ok) {
    throw new Error(`APK v2/v3 signature verification failed:\n${output}`);
  }

  return {
    verified: true,
    schemes: ['v1', ...(v2Ok ? ['v2'] : []), ...(v3Ok ? ['v3'] : [])],
    output
  };
}
