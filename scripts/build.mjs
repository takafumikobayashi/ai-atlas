#!/usr/bin/env node
// Builds the deployable static site into dist/.
// Copies site/ plus the published data files. Development fixtures are intentionally excluded.
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));

await rm(path('dist'), { recursive: true, force: true });
await cp(path('site'), path('dist'), { recursive: true });
await mkdir(path('dist/data'), { recursive: true });
for (const file of ['services.json', 'vocabulary.json']) {
  await cp(path(`data/${file}`), path(`dist/data/${file}`));
}
console.log('dist/ を作成しました（data/fixtures は含みません）');
