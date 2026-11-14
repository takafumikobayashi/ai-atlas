import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  capabilityStatus,
  checkedRange,
  deriveOptions,
  emptyCriteria,
  filterServices,
  hasActiveCriteria,
  isStale,
} from '../site/js/filter.js';

// Fictional records shaped like the catalogue; only the fields the filters read.
const svc = (id, overrides = {}) => ({
  id,
  name: id,
  aliases: [],
  provider: { name: `${id} Inc.`, originCountryCode: null },
  capabilities: [],
  platforms: { values: [] },
  languages: { interface: { values: [] }, conversation: { values: [] } },
  pricing: { offers: [] },
  ...overrides,
});
const cap = (id, status) => ({ id, status });

const A = svc('alpha', {
  aliases: ['Alpha Chat'],
  provider: { name: 'Provider One', originCountryCode: 'JP' },
  capabilities: [cap('image_generation', 'supported'), cap('voice_conversation', 'conditional')],
  platforms: { values: ['web', 'ios'] },
  languages: { interface: { values: ['ja'] }, conversation: { values: ['ja', 'en'] } },
  pricing: { offers: [{ access: 'free' }] },
});
const B = svc('beta', {
  provider: { name: 'Provider Two', originCountryCode: 'US' },
  capabilities: [cap('image_generation', 'supported'), cap('voice_conversation', 'unsupported')],
  platforms: { values: ['android'] },
  languages: { interface: { values: [] }, conversation: { values: ['en-US'] } },
  pricing: { offers: [{ access: 'paid' }] },
});
const C = svc('gamma', {
  provider: { name: 'Provider Three', originCountryCode: 'FR' },
  capabilities: [cap('voice_conversation', 'unknown')],
});
const all = [A, B, C];
const ids = (list) => list.map((s) => s.id);
const criteria = (patch) => ({ ...emptyCriteria(), ...patch });

test('empty criteria returns everything and is inactive', () => {
  assert.deepEqual(ids(filterServices(all, emptyCriteria())), ['alpha', 'beta', 'gamma']);
  assert.equal(hasActiveCriteria(emptyCriteria()), false);
});

test('search matches name, alias and provider, normalising width and case', () => {
  assert.deepEqual(ids(filterServices(all, criteria({ query: 'ａｌｐｈａ ｃｈａｔ' }))), ['alpha']);
  assert.deepEqual(ids(filterServices(all, criteria({ query: 'provider two' }))), ['beta']);
  assert.deepEqual(ids(filterServices(all, criteria({ query: 'nothing' }))), []);
});

test('capabilities: OR by default, conditional counts as available, unknown/unsupported do not', () => {
  const c = criteria({ capabilities: ['voice_conversation'] });
  assert.deepEqual(ids(filterServices(all, c)), ['alpha']);
  const either = criteria({ capabilities: ['image_generation', 'voice_conversation'] });
  assert.deepEqual(ids(filterServices(all, either)), ['alpha', 'beta']);
});

test('capabilities: "all" mode requires every selected capability', () => {
  const both = criteria({ capabilities: ['image_generation', 'voice_conversation'], capabilityMode: 'all' });
  assert.deepEqual(ids(filterServices(all, both)), ['alpha']);
});

test('groups combine with AND', () => {
  const c = criteria({ capabilities: ['image_generation'], origins: ['US'] });
  assert.deepEqual(ids(filterServices(all, c)), ['beta']);
  const none = criteria({ capabilities: ['image_generation'], origins: ['FR'] });
  assert.deepEqual(ids(filterServices(all, none)), []);
});

test('language filter matches base language of regional tags', () => {
  assert.deepEqual(ids(filterServices(all, criteria({ languages: ['en'] }))), ['alpha', 'beta']);
  assert.deepEqual(ids(filterServices(all, criteria({ languages: ['ja'] }))), ['alpha']);
});

test('platform and free filters', () => {
  assert.deepEqual(ids(filterServices(all, criteria({ platforms: ['ios', 'android'] }))), ['alpha', 'beta']);
  assert.deepEqual(ids(filterServices(all, criteria({ freeOnly: true }))), ['alpha']);
});

test('missing capability entries are unknown, never unsupported', () => {
  assert.equal(capabilityStatus(C, 'image_generation'), 'unknown');
  assert.equal(capabilityStatus(B, 'voice_conversation'), 'unsupported');
});

test('capabilityStatus picks the most favourable scoped entry', () => {
  const s = svc('scoped', { capabilities: [cap('image_generation', 'unsupported'), cap('image_generation', 'conditional')] });
  assert.equal(capabilityStatus(s, 'image_generation'), 'conditional');
});

test('deriveOptions lists origins and base languages present in data', () => {
  const o = deriveOptions(all);
  assert.deepEqual(o.origins.sort(), ['FR', 'JP', 'US']);
  assert.deepEqual(o.languages, ['en', 'ja']);
});

test('checkedRange and isStale', () => {
  const s = svc('dated', {
    provider: { name: 'X', originCountryCode: null, checkedAt: '2026-05-01' },
    evidence: [{ checkedAt: '2026-11-01' }],
  });
  assert.deepEqual(checkedRange(s), { oldest: '2026-05-01', latest: '2026-11-01' });
  assert.equal(checkedRange(svc('none')), null);
  assert.equal(isStale('2026-05-01', '2026-11-14', 90), true);
  assert.equal(isStale('2026-11-01', '2026-11-14', 90), false);
  assert.equal(isStale(null, '2026-11-14', 90), false);
});
