#!/usr/bin/env node
// Minimal static server for local development (no dependencies).
//   node scripts/serve.mjs          -> serves site/ and data/ (incl. fixtures, ?sample で架空データ)
//   node scripts/serve.mjs --dist   -> serves the built dist/ folder
// Options: --port <n> (default 4173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const useDist = args.includes('--dist');
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;

const mounts = useDist
  ? [{ prefix: '/', dir: resolve(root, 'dist') }]
  : [
      { prefix: '/data/', dir: resolve(root, 'data') },
      { prefix: '/', dir: resolve(root, 'site') },
    ];

// Apply the same response headers as Cloudflare Pages (site/_headers), so CSP problems show up locally.
const headerRules = await loadHeaderRules(resolve(root, useDist ? 'dist' : 'site', '_headers'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webp': 'image/webp',
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Cloudflare Pages never serves _headers / _redirects; neither do we.
    if (/\/_(headers|redirects)$/.test(pathname)) return send(res, 404, 'Not found');
    const mount = mounts.find((m) => pathname.startsWith(m.prefix));
    let file = resolve(mount.dir, '.' + sep + normalize(pathname.slice(mount.prefix.length)));
    if (file !== mount.dir && !file.startsWith(mount.dir + sep)) return send(res, 403, 'Forbidden');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      ...headersFor(pathname),
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (error) {
    send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`AI Atlas (${useDist ? 'dist' : 'dev'}): http://localhost:${port}/`);
  if (!useDist) console.log(`架空のサンプルデータで確認: http://localhost:${port}/?sample`);
});

async function loadHeaderRules(file) {
  const text = await readFile(file, 'utf8').catch(() => '');
  const rules = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const i = line.indexOf(':');
      if (i > 0) current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

function headersFor(pathname) {
  const out = {};
  for (const rule of headerRules) {
    const prefix = rule.pattern.endsWith('*') ? rule.pattern.slice(0, -1) : null;
    if (prefix !== null ? pathname.startsWith(prefix) : pathname === rule.pattern) Object.assign(out, rule.headers);
  }
  return out;
}

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
