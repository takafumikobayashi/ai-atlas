#!/usr/bin/env node
// Builds the deployable static site into dist/.
// Copies site/ plus the published data files. Development fixtures are intentionally excluded.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));

await rm(path('dist'), { recursive: true, force: true });
await cp(path('site'), path('dist'), {
  recursive: true,
  // og-card.html and its script are only the source for og-image.png
  filter: (src) => !/og-card\.(html|js)$/.test(src),
});
await mkdir(path('dist/data'), { recursive: true });
for (const file of ['services.json', 'vocabulary.json']) {
  await cp(path(`data/${file}`), path(`dist/data/${file}`));
}
// Link previews need absolute URLs. site/index.html (and robots.txt / sitemap.xml) carry the
// production origin; SITE_URL rewrites it when publishing somewhere else.
const PROD_ORIGIN = 'https://ai-atlas.tariki-code.tokyo';
const siteUrl = process.env.SITE_URL?.replace(/\/+$/, '');
if (siteUrl && siteUrl !== PROD_ORIGIN) {
  for (const file of ['index.html', 'robots.txt', 'sitemap.xml']) {
    const filePath = path(`dist/${file}`);
    await writeFile(filePath, (await readFile(filePath, 'utf8')).replaceAll(PROD_ORIGIN, siteUrl));
  }
  console.log(`公開先の URL を ${siteUrl} に置き換えました`);
}
// Guard: never ship a page whose preview image URL is relative (X shows no / a small card).
const builtHtml = await readFile(path('dist/index.html'), 'utf8');
for (const key of ['og:image', 'og:url', 'twitter:image']) {
  const m = builtHtml.match(new RegExp(`(?:property|name)="${key}" content="([^"]*)"`));
  if (!m || !/^https:\/\//.test(m[1])) {
    console.error(`エラー: ${key} が https:// で始まる絶対 URL ではありません（${m ? m[1] : '未設定'}）`);
    process.exit(1);
  }
}
console.log('dist/ を作成しました（data/fixtures は含みません）');
