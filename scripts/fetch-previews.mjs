#!/usr/bin/env node
// Looks up each service's Open Graph image (og:image, falling back to twitter:image) on its official URL
// and records it as `officialPreview` in data/services.json.
//
//   node scripts/fetch-previews.mjs           -> dry run: prints what it found
//   node scripts/fetch-previews.mjs --write   -> also updates data/services.json
//   node scripts/fetch-previews.mjs --only chatgpt,claude
//
// Images that forbid cross-origin embedding (Cross-Origin-Resource-Policy: same-origin/same-site)
// are rejected, because they would not display on this site.
//
// Some sites refuse automated requests. Those are reported and left unchanged; record them by hand
// after checking the page in a browser (see docs/data-workflow.md).
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../data/services.json', import.meta.url);
const args = process.argv.slice(2);
const write = args.includes('--write');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? new Set(args[onlyIndex + 1].split(',')) : null;
const today = new Date().toLocaleDateString('sv-SE');
const UA = 'Mozilla/5.0 (compatible; AI-Atlas-preview-check/0.1)';

const catalog = JSON.parse(await readFile(file, 'utf8'));
let changed = 0;

for (const service of catalog.services) {
  if (only && !only.has(service.id)) continue;
  try {
    const res = await fetch(service.officialUrl, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const raw = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image');
    if (!raw) throw new Error('og:image が見つかりません');
    const imageUrl = new URL(decodeEntities(raw), res.url).href;
    const img = await fetch(imageUrl, { method: 'HEAD', headers: { 'User-Agent': UA } });
    const type = img.headers.get('content-type') ?? '';
    if (!img.ok || !type.startsWith('image/')) throw new Error(`画像を確認できません（HTTP ${img.status} ${type}）`);
    const corp = (img.headers.get('cross-origin-resource-policy') ?? '').toLowerCase();
    if (corp === 'same-origin' || corp === 'same-site') {
      throw new Error(`画像に外部サイトからの表示を禁止する設定があります（Cross-Origin-Resource-Policy: ${corp}）: ${imageUrl}`);
    }
    const alt = metaContent(html, 'og:image:alt');
    console.log(`✓ ${service.id}: ${imageUrl}`);
    if (write) {
      service.officialPreview = { imageUrl, sourceUrl: res.url, alt: alt ? decodeEntities(alt) : null, checkedAt: today };
      changed++;
    }
  } catch (error) {
    console.log(`✕ ${service.id}: ${error.message}（${service.officialUrl}）`);
  }
}

if (write && changed) {
  await writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`\n${changed}件を data/services.json に書き込みました。npm run validate で確認してください。`);
}

function metaContent(html, key) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
    const prop = attr('property') ?? attr('name');
    const value = prop && (prop[2] ?? prop[3]);
    if (value && value.toLowerCase() === key) {
      const content = attr('content');
      if (content) return content[2] ?? content[3];
    }
  }
  return null;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
