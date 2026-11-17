/**
 * APK Signer Service (lib/services/apkSignerService.js)
 * Manages debug keystore creation via JDK keytool.exe and APK signing/verification via jarsigner.exe.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const JDK_BIN = 'C:\\Program Files\\Java\\jdk-25.0.5.0.2\\bin';
const KEYTOOL_EXE = path.join(JDK_BIN, 'keytool.exe');
const JARSIGNER_EXE = path.join(JDK_BIN, 'jarsigner.exe');

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

export async function signAndVerifyApk(apkFilePath) {
  const keystorePath = await ensureDebugKeystore();

  await execFileAsync(JARSIGNER_EXE, [
    '-keystore',
    keystorePath,
    '-storepass',
    STORE_PASS,
    '-keypass',
    KEY_PASS,
    '-sigalg',
    'SHA256withRSA',
    '-digestalg',
    'SHA-256',
    apkFilePath,
    KEY_ALIAS
  ]);

  const { stdout, stderr } = await execFileAsync(JARSIGNER_EXE, ['-verify', apkFilePath]);
  const output = `${stdout || ''}\n${stderr || ''}`.trim();
  const verified = /jar verified\./i.test(output);

  if (!verified) {
    throw new Error(`APK signature verification failed: ${output}`);
  }

  return { verified: true, output };
}
