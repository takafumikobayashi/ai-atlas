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
  // og-card.html is only the source for og-image.png
  filter: (src) => !src.endsWith('og-card.html'),
});
await mkdir(path('dist/data'), { recursive: true });
for (const file of ['services.json', 'vocabulary.json']) {
  await cp(path(`data/${file}`), path(`dist/data/${file}`));
}
// Link previews need absolute URLs. Set SITE_URL (e.g. https://example.org) when building for release.
const siteUrl = process.env.SITE_URL?.replace(/\/+$/, '');
if (siteUrl) {
  const indexPath = path('dist/index.html');
  const html = (await readFile(indexPath, 'utf8'))
    .replace('<meta property="og:image" content="og-image.png" />', `<meta property="og:image" content="${siteUrl}/og-image.png" />\n    <meta property="og:url" content="${siteUrl}/" />`);
  await writeFile(indexPath, html);
  console.log(`OGP の URL を ${siteUrl} で設定しました`);
} else {
  console.log('注意: SITE_URL が未設定のため、og:image は相対パスのままです（公開前に設定してください）');
}
console.log('dist/ を作成しました（data/fixtures は含みません）');
