/**
 * Web2APK Builder Local Server (server.js)
 * Zero-dependency Node.js server serving the modular frontend and APK build APIs.
 */

import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { handleBuildApk } from './lib/api/buildApkApi.js';
import { handleDetectWebsite } from './lib/api/detectWebsiteApi.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = path.resolve('.');
const OUTPUT_DIR = path.resolve('build', 'output');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive'
};

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error('Request payload too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function serveStaticFile(reqPath, res) {
  const cleanPath = reqPath === '/' ? '/index.html' : reqPath;
  const resolved = path.resolve(ROOT_DIR, `.${cleanPath}`);
  const allowedPrefixes = [
    path.join(ROOT_DIR, 'index.html'),
    path.join(ROOT_DIR, 'styles') + path.sep,
    path.join(ROOT_DIR, 'lib') + path.sep
  ];

  const isAllowed = allowedPrefixes.some(
    (prefix) => resolved === prefix || resolved.startsWith(prefix)
  );
  if (!isAllowed) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

async function serveApkDownload(fileName, res) {
  const safeName = path.basename(decodeURIComponent(fileName));
  if (!safeName.endsWith('.apk')) {
    sendJson(res, 400, { success: false, error: 'Invalid APK file name' });
    return;
  }
  const filePath = path.join(OUTPUT_DIR, safeName);
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES['.apk'],
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': data.length
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { success: false, error: 'APK file not found. Please build the APK again.' });
  }
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = urlObj.pathname;

    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { ok: true, service: 'web2apk-converter' });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/detect') {
        const body = await readJsonBody(req);
        const result = await handleDetectWebsite(body.url);
        sendJson(res, result.status, result.body);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/build-apk') {
        const body = await readJsonBody(req);
        const result = await handleBuildApk(body);
        sendJson(res, result.status, result.body);
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/api/download/')) {
        const fileName = pathname.slice('/api/download/'.length);
        await serveApkDownload(fileName, res);
        return;
      }

      if (req.method === 'GET') {
        await serveStaticFile(pathname, res);
        return;
      }

      sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
    } catch (err) {
      sendJson(res, 500, {
        success: false,
        error: 'A server error occurred. Please try again.',
        detail: err?.message
      });
    }
  });
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (isDirectRun) {
  const server = createAppServer();
  server.listen(PORT, () => {
    console.log(`Web2APK Builder running at http://localhost:${PORT}`);
  });
}
