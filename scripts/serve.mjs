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
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const mount = mounts.find((m) => pathname.startsWith(m.prefix));
    let file = resolve(mount.dir, '.' + sep + normalize(pathname.slice(mount.prefix.length)));
    if (file !== mount.dir && !file.startsWith(mount.dir + sep)) return send(res, 403, 'Forbidden');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (error) {
    send(res, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`AI Atlas (${useDist ? 'dist' : 'dev'}): http://localhost:${port}/`);
  if (!useDist) console.log(`架空のサンプルデータで確認: http://localhost:${port}/?sample`);
});

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
