import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog } from '../scripts/lib/validate-data.mjs';

const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const vocab = load('data/vocabulary.json');
const fixtures = load('data/fixtures/sample-services.json');
const TODAY = '2026-11-14';

/** One valid fictional service, deep-copied so each test can break it. */
const base = () => structuredClone(fixtures.services.find((s) => s.id === 'sample-alpha'));
const run = (services, opts = {}) =>
  validateCatalog({ schemaVersion: 1, services }, vocab, { allowExampleDomains: true, today: TODAY, ...opts });
const hasError = (result, fragment) => result.errors.some((e) => e.includes(fragment));

test('fixtures are valid when example domains are allowed', () => {
  const r = validateCatalog(fixtures, vocab, { allowExampleDomains: true, today: TODAY });
  assert.deepEqual(r.errors, []);
});

test('published mode rejects example domains', () => {
  const r = run([base()], { allowExampleDomains: false });
  assert.ok(hasError(r, '例示用ドメイン'));
});

test('empty published catalogue is valid', () => {
  assert.deepEqual(validateCatalog({ schemaVersion: 1, services: [] }, vocab, { today: TODAY }).errors, []);
});

test('duplicate service ids are rejected', () => {
  assert.ok(hasError(run([base(), base()]), 'id が重複'));
});

test('supported claims need evidence and checkedAt', () => {
  const s = base();
  s.capabilities[0].evidenceIds = [];
  s.capabilities[0].checkedAt = null;
  const r = run([s]);
  assert.ok(hasError(r, '根拠 (evidenceIds) が必要'));
  assert.ok(hasError(r, '確認日 (checkedAt) が必要'));
});

test('unknown claims may omit evidence', () => {
  const s = base();
  Object.assign(s.capabilities[0], { status: 'unknown', evidenceIds: [], checkedAt: null });
  assert.deepEqual(run([s]).errors, []);
});

test('conditional requires conditions', () => {
  const s = base();
  s.capabilities[1].conditions = null;
  assert.ok(hasError(run([s]), 'conditions.ja が必要'));
});

test('dangling evidence references are rejected', () => {
  const s = base();
  s.capabilities[0].evidenceIds = ['does-not-exist'];
  assert.ok(hasError(run([s]), '"does-not-exist" が evidence にありません'));
});

test('unknown vocabulary values are rejected', () => {
  const s = base();
  s.capabilities[0].id = 'telepathy';
  s.capabilities[0].status = 'maybe';
  s.platforms.values.push('fridge');
  const r = run([s]);
  assert.ok(hasError(r, '機能ID "telepathy"'));
  assert.ok(hasError(r, 'status "maybe"'));
  assert.ok(hasError(r, '"fridge" は無効'));
});

test('prices need currency, period and region', () => {
  const s = base();
  Object.assign(s.pricing.offers[1], { currency: null, billingPeriod: null, regionCode: null });
  const r = run([s]);
  assert.ok(hasError(r, '通貨'));
  assert.ok(hasError(r, 'billingPeriod'));
  assert.ok(hasError(r, '対象地域'));
});

test('future and malformed dates are rejected', () => {
  const s = base();
  s.evidence[0].checkedAt = '2027-01-01';
  s.evidence[1].checkedAt = '2026-02-30';
  const r = run([s]);
  assert.ok(hasError(r, '未来の日付'));
  assert.ok(hasError(r, '実在する日付'));
});

test('origin country claim requires evidence', () => {
  const s = base();
  s.provider.evidenceIds = [];
  assert.ok(hasError(run([s]), 'provider'));
});

test('editorial observations need a stated basis', () => {
  const s = base();
  s.strengthClaims.push({ claim: { ja: '所見' }, claimType: 'editorial_observation', scope: null, evidenceIds: [], checkedAt: '2026-11-01' });
  assert.ok(hasError(run([s]), 'basis.ja'));
});

test('stale claims produce warnings, not errors', () => {
  const s = base();
  const r = run([s], { today: '2027-06-01' });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => w.includes('要再確認')));
});
