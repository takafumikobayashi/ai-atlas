import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, parseCommand, tokenize } from '../site/js/command.js';

const regionNames = new Intl.DisplayNames(['ja'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['ja'], { type: 'language' });
const ctx = {
  capabilities: [
    { id: 'web_search', label: 'Web検索・調査' },
    { id: 'image_generation', label: '画像生成' },
    { id: 'voice_conversation', label: '音声会話' },
  ],
  platforms: [
    { id: 'web', label: 'Web' },
    { id: 'ios', label: 'iOS' },
  ],
  origins: ['US', 'JP', 'FR'],
  languages: ['ja', 'en'],
  services: [
    { id: 'claude', name: 'Claude' },
    { id: 'gemini-notebook', name: 'Gemini Notebook', aliases: ['NotebookLM'] },
  ],
  regionName: (c) => regionNames.of(c),
  languageName: (c) => languageNames.of(c),
};

test('menu numbers, help, clear', () => {
  assert.deepEqual(parseCommand('2', ctx), { type: 'menu', item: 2 });
  assert.deepEqual(parseCommand('２', ctx), { type: 'menu', item: 2 }); // full-width digit
  assert.equal(parseCommand('help', ctx).type, 'help');
  assert.equal(parseCommand('atlas help', ctx).type, 'help');
  assert.equal(parseCommand('clear', ctx).type, 'clear');
  assert.equal(parseCommand('   ', ctx).type, 'empty');
});

test('plain words are a name search (backwards compatible)', () => {
  const r = parseCommand('claude', ctx);
  assert.equal(r.type, 'search');
  assert.equal(r.criteria.query, 'claude');
  assert.deepEqual(r.criteria.capabilities, []);
});

test('flags accept labels or ids, commas or spaces', () => {
  const r = parseCommand('atlas search --can 画像生成,voice_conversation --on iOS web --free', ctx);
  assert.equal(r.type, 'search');
  assert.deepEqual(r.criteria.capabilities, ['image_generation', 'voice_conversation']);
  assert.equal(r.criteria.capabilityMode, 'any');
  assert.deepEqual(r.criteria.platforms, ['ios', 'web']);
  assert.equal(r.criteria.freeOnly, true);
});

test('--can-all switches to all-of mode', () => {
  const r = parseCommand('--can-all 画像生成、音声会話', ctx);
  assert.equal(r.criteria.capabilityMode, 'all');
  assert.deepEqual(r.criteria.capabilities, ['image_generation', 'voice_conversation']);
});

test('origin and language by code or Japanese name', () => {
  const r = parseCommand('--origin 日本,us --lang 日本語', ctx);
  assert.deepEqual(r.criteria.origins, ['JP', 'US']);
  assert.deepEqual(r.criteria.languages, ['ja']);
});

test('the decorative line can be typed back in', () => {
  const r = parseCommand('atlas search "AI 検索" --can Web検索・調査 --origin FR', ctx);
  assert.equal(r.criteria.query, 'AI 検索');
  assert.deepEqual(r.criteria.capabilities, ['web_search']);
  assert.deepEqual(r.criteria.origins, ['FR']);
});

test('IME dashes are accepted', () => {
  assert.equal(normalize('ーーcan 画像生成'), '--can 画像生成');
  assert.equal(normalize('－－free'), '--free');
  assert.deepEqual(parseCommand('ーーcan 画像生成', ctx).criteria.capabilities, ['image_generation']);
});

test('unknown flags and values are reported, nothing is applied', () => {
  const a = parseCommand('--can 翻訳', ctx);
  assert.equal(a.type, 'error');
  assert.match(a.errors[0], /翻訳/);
  assert.match(a.errors[0], /画像生成/); // lists allowed values
  assert.equal(parseCommand('--color red', ctx).type, 'error');
  assert.equal(parseCommand('--origin KR', ctx).type, 'error'); // not in the catalogue
  assert.equal(parseCommand('--can', ctx).type, 'error'); // missing value
});

test('show opens a service by id, name or alias', () => {
  assert.deepEqual(parseCommand('show claude', ctx), { type: 'show', id: 'claude' });
  assert.deepEqual(parseCommand('atlas show NotebookLM', ctx), { type: 'show', id: 'gemini-notebook' });
  assert.equal(parseCommand('show nothing', ctx).type, 'error');
});

test('tokenize keeps quoted phrases', () => {
  assert.deepEqual(tokenize('a "b c" d'), ['a', 'b c', 'd']);
});
