#!/usr/bin/env node
// Validates the published catalogue (data/services.json) and the development fixtures.
// Usage: node scripts/validate.mjs [--strict]   (--strict treats warnings as errors)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from './lib/validate-data.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const strict = process.argv.includes('--strict');

const targets = [
  { file: 'data/services.json', allowExampleDomains: false },
  { file: 'data/fixtures/sample-services.json', allowExampleDomains: true },
];

const vocab = await readJson('data/vocabulary.json');
let failed = false;

for (const target of targets) {
  const catalog = await readJson(target.file);
  const { errors, warnings } = validateCatalog(catalog, vocab, target);
  const count = Array.isArray(catalog?.services) ? catalog.services.length : 0;
  console.log(`\n${target.file}  (${count}件)`);
  for (const e of errors) console.log(`  ✕ ${e}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  if (errors.length === 0 && warnings.length === 0) console.log('  ✓ 問題なし');
  if (errors.length > 0 || (strict && warnings.length > 0)) failed = true;
}

process.exitCode = failed ? 1 : 0;

async function readJson(relative) {
  try {
    return JSON.parse(await readFile(new URL(relative, `file://${root}`), 'utf8'));
  } catch (error) {
    console.error(`${relative}: 読み込みに失敗しました (${error.message})`);
    process.exit(1);
  }
}
