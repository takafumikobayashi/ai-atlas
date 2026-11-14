import {
  AVAILABLE_STATUSES,
  capabilityEntries,
  capabilityStatus,
  checkedRange,
  deriveOptions,
  emptyCriteria,
  filterServices,
  hasActiveCriteria,
  hasFreeOffer,
  isStale,
  sortServices,
} from './filter.js';
import { mountGlobe } from './globe.js';

const params = new URLSearchParams(location.search);
const USE_SAMPLE = params.has('sample');
const DATA_URL = USE_SAMPLE ? 'data/fixtures/sample-services.json' : 'data/services.json';
const VOCAB_URL = 'data/vocabulary.json';
const TODAY = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
const DEFAULT_TITLE = 'AI Atlas | 世界のAIを、見つける・知る・比べる';

const regionNames = safeDisplayNames('region');
const languageNames = safeDisplayNames('language');

const state = {
  vocab: null,
  services: [],
  criteria: emptyCriteria(),
  lastListFocusId: null,
  globe: null,
};

const el = {
  status: document.getElementById('load-status'),
  listView: document.getElementById('list-view'),
  detailView: document.getElementById('detail-view'),
  search: document.getElementById('search'),
  filters: document.getElementById('filters'),
  clear: document.getElementById('clear-filters'),
  count: document.getElementById('result-count'),
  results: document.getElementById('results'),
  command: document.getElementById('command'),
  legend: document.getElementById('legend-table'),
  globe: document.getElementById('globe'),
  screenId: document.getElementById('screen-id'),
  screenDate: document.getElementById('screen-date'),
  cmdline: document.getElementById('cmdline'),
  cmdInput: document.getElementById('cmd-input'),
  listEnd: document.getElementById('list-end'),
  menu: document.querySelector('.menu'),
};

init();

async function init() {
  try {
    const [vocab, catalog] = await Promise.all([fetchJson(VOCAB_URL), fetchJson(DATA_URL)]);
    state.vocab = indexVocab(vocab);
    state.services = sortServices((catalog.services ?? []).filter((s) => s.lifecycle?.status !== 'discontinued'));
  } catch (error) {
    el.status.hidden = false;
    el.status.textContent = USE_SAMPLE
      ? 'エラー: サンプルデータを読み込めませんでした。サンプルは開発用サーバー（npm run dev）でだけ使えます。'
      : `エラー: データを読み込めませんでした（${error.message}）。ページを再読み込みしてください。`;
    return;
  }

  el.screenDate.textContent = TODAY.replaceAll('-', '/');
  if (USE_SAMPLE) {
    // Built only in sample mode so the published page never contains this notice.
    document.getElementById('main').prepend(
      h('p', { class: 'sample-banner', role: 'note' }, h('span', { class: 'green' }, '--sample'), ' 画面確認用の架空データを表示しています。実在するサービスの情報ではありません。'),
    );
  }
  state.globe = mountGlobe(el.globe, { origins: deriveOptions(state.services).origins });
  renderIntroStats();
  renderLegend();
  renderFilters();
  bindEvents();
  bindCommandLine();
  bindShortcuts();
  updateResults();
  route();
}

// ---------------------------------------------------------------------------
// Data helpers

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function indexVocab(vocab) {
  const out = { raw: vocab, staleAfterDays: vocab.staleAfterDays ?? 90 };
  for (const [key, value] of Object.entries(vocab)) {
    if (Array.isArray(value)) out[key] = new Map(value.map((item) => [item.id, item]));
  }
  return out;
}

function label(group, id) {
  return state.vocab[group]?.get(id)?.label ?? id;
}

function safeDisplayNames(type) {
  try {
    return new Intl.DisplayNames(['ja'], { type });
  } catch {
    return null;
  }
}

/** Flag emoji from an ISO 3166-1 alpha-2 code (regional indicator symbols). */
function flagEmoji(code) {
  if (!/^[A-Z]{2}$/.test(code ?? '')) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Country name with its flag. The flag is decorative, so screen readers hear only the name. */
function regionLabel(code) {
  const flag = flagEmoji(code);
  return [flag ? h('span', { class: 'flag-emoji', 'aria-hidden': 'true' }, flag) : null, regionName(code)];
}

function regionName(code) {
  return (code && regionNames?.of(code)) || code;
}

function languageName(code) {
  return (code && languageNames?.of(code)) || code;
}

// ---------------------------------------------------------------------------
// DOM helpers: elements are created without innerHTML so data is never parsed as HTML.

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function statusBadge(status, { text = null } = {}) {
  const meta = state.vocab.statuses.get(status) ?? state.vocab.statuses.get('unknown');
  return h(
    'span',
    { class: `status status--${meta.id}`, title: meta.description },
    h('span', { class: 'status__symbol', 'aria-hidden': 'true' }, meta.symbol),
    text
      ? [
          h('span', {}, text),
          meta.id === 'supported'
            ? h('span', { class: 'visually-hidden' }, `（${meta.label}）`)
            : h('span', { class: 'status__note' }, `（${meta.label}）`),
        ]
      : h('span', {}, meta.label),
  );
}

function externalLink(href, text) {
  return h(
    'a',
    { href, target: '_blank', rel: 'noopener noreferrer' },
    text,
    h('span', { class: 'visually-hidden' }, '（外部サイト・新しいタブで開きます）'),
    h('span', { 'aria-hidden': 'true' }, ' ↗'),
  );
}

/** Display width in monospace cells (CJK and full-width forms take two). */
function cellWidth(text) {
  let w = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x20000;
    w += wide ? 2 : 1;
  }
  return w;
}

function wrapCell(text, max) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (cellWidth(line + ch) > max) {
      lines.push(line);
      line = '';
    }
    line += ch;
  }
  lines.push(line);
  return lines;
}

/**
 * A code.storage-style text table (+---+ / | a | b |) for sighted readers,
 * paired with a real <table> for assistive technology.
 */
function asciiTable(headers, rows, { caption, maxCell = 30 } = {}) {
  const wrapped = rows.map((row) => row.map((cell) => wrapCell(cell ?? '', maxCell)));
  const widths = headers.map((head, i) =>
    Math.max(cellWidth(head), ...wrapped.map((row) => Math.max(...row[i].map(cellWidth)))),
  );
  const pad = (text, w) => text + ' '.repeat(Math.max(0, w - cellWidth(text)));
  const border = `+${widths.map((w) => '-'.repeat(w + 2)).join('+')}+\n`;
  const rule = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|\n`;

  const pre = h('pre', { class: 'ascii', 'aria-hidden': 'true' });
  const text = (s) => pre.append(document.createTextNode(s));
  text(border);
  text('|');
  headers.forEach((head, i) => {
    text(' ');
    pre.append(h('b', {}, head));
    text(`${' '.repeat(widths[i] - cellWidth(head))} |`);
  });
  text('\n');
  text(rule);
  for (const row of wrapped) {
    const height = Math.max(...row.map((lines) => lines.length));
    for (let l = 0; l < height; l++) {
      text(`|${row.map((lines, i) => ` ${pad(lines[l] ?? '', widths[i])} `).join('|')}|\n`);
    }
  }
  text(border.trimEnd());

  const table = h(
    'table',
    { class: 'visually-hidden' },
    caption ? h('caption', {}, caption) : null,
    h('thead', {}, h('tr', {}, headers.map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, rows.map((row) => h('tr', {}, row.map((cell, i) => (i === 0 ? h('th', { scope: 'row' }, cell) : h('td', {}, cell)))))),
  );
  return [pre, table];
}

// ---------------------------------------------------------------------------
// Intro statistics and legend

function renderIntroStats() {
  const intro = document.getElementById('intro-title').parentElement;
  const services = state.services;
  const origins = deriveOptions(services).origins;
  const ranges = services.map(checkedRange).filter(Boolean);
  const latest = ranges.map((r) => r.latest).sort().at(-1);
  const staleCount = ranges.filter((r) => isStale(r.oldest, TODAY, state.vocab.staleAfterDays)).length;

  intro.append(
    h('p', {}, '収録状況：'),
    ...asciiTable(
      ['項目', '値'],
      [
        ['掲載サービス', `${services.length}件`],
        ['提供元の拠点', `${origins.length}か国・地域`],
        ['データの最終確認日', latest ?? 'なし'],
        [`確認から${state.vocab.staleAfterDays}日超の情報あり`, `${staleCount}件`],
      ],
      { caption: '収録状況' },
    ),
  );
}

function renderLegend() {
  el.legend.replaceChildren(
    h(
      'ul',
      { class: 'bullets' },
      state.vocab.raw.statuses.map((s) => h('li', {}, statusBadge(s.id), ' ', s.description)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Filters

function renderFilters() {
  const options = deriveOptions(state.services);
  const v = state.vocab.raw;

  const basic = [
    flagGroup({
      legend: 'できること',
      flag: '--can',
      name: 'capabilities',
      items: v.capabilities.map((c) => ({ value: c.id, text: c.label, hint: c.description })),
      extra: h(
        'div',
        { class: 'mode', role: 'radiogroup', 'aria-label': '複数選んだときの条件' },
        h('span', { 'aria-hidden': 'true' }, '複数選んだとき:'),
        radio('capabilityMode', 'any', 'いずれか', true),
        radio('capabilityMode', 'all', 'すべて', false),
      ),
      note: '「条件付き」で使える機能も含みます。',
    }),
  ];
  const advanced = [
    options.origins.length
      ? flagGroup({
          legend: '提供元の拠点',
          flag: '--origin',
          name: 'origins',
          items: options.origins.map((code) => ({ value: code, text: regionLabel(code) })),
          note: '企業の拠点です。その国・地域で使えるという意味ではありません。',
        })
      : null,
    options.languages.length
      ? flagGroup({
          legend: '会話できる言語',
          flag: '--lang',
          name: 'languages',
          items: options.languages.map((code) => ({ value: code, text: languageName(code) })),
        })
      : null,
    flagGroup({
      legend: '利用環境',
      flag: '--on',
      name: 'platforms',
      items: v.platforms.map((p) => ({ value: p.id, text: p.label })),
    }),
    flagGroup({
      legend: '料金',
      flag: '--free',
      name: 'freeOnly',
      items: [{ value: '1', text: '無料で使えるプランがある' }],
      note: '対象地域や回数の制限は、詳細ページで確かめてください。',
    }),
  ];

  el.moreSummary = h('summary', { class: 'more-filters__summary' });
  el.filters.replaceChildren(
    ...basic,
    h('details', { class: 'more-filters' }, el.moreSummary, h('div', { class: 'more-filters__body' }, advanced.filter(Boolean))),
  );
  updateMoreSummary(emptyCriteria());
}

/** Summary of the collapsed group, showing how many hidden conditions are active. */
function updateMoreSummary(c) {
  if (!el.moreSummary) return;
  const n = c.origins.length + c.languages.length + c.platforms.length + (c.freeOnly ? 1 : 0);
  const parts = [
    h('span', { class: 'more-filters__mark', 'aria-hidden': 'true' }),
    '詳細条件',
    h('span', { class: 'dim' }, '（拠点・言語・利用環境・料金）'),
  ];
  if (n) parts.push(h('span', { class: 'more-filters__count' }, ` ${n}件を選択中`));
  el.moreSummary.replaceChildren(...parts);
}

function flagGroup({ legend, flag, name, items, extra = null, note = null }) {
  return h(
    'fieldset',
    { class: 'flag-group' },
    h('legend', {}, h('span', { class: 'flag', 'aria-hidden': 'true' }, flag), legend),
    extra,
    h(
      'div',
      { class: 'opts' },
      items.map((item) =>
        h(
          'label',
          { class: 'check', title: item.hint ?? null },
          h('input', { type: 'checkbox', name, value: item.value }),
          h('span', { class: 'check__box', 'aria-hidden': 'true' }),
          h('span', { class: 'check__text' }, item.text),
        ),
      ),
    ),
    note ? h('p', { class: 'dim', style: 'padding-left:2.2ch' }, note) : null,
  );
}

function radio(name, value, text, checked) {
  return h(
    'label',
    { class: 'mode__option' },
    h('input', { type: 'radio', name, value, checked }),
    h('span', { class: 'mode__mark', 'aria-hidden': 'true' }),
    h('span', {}, text),
  );
}

function readCriteria() {
  const form = el.filters;
  const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  return {
    query: el.search.value,
    capabilities: checked('capabilities'),
    capabilityMode: form.querySelector('input[name="capabilityMode"]:checked')?.value ?? 'any',
    origins: checked('origins'),
    languages: checked('languages'),
    platforms: checked('platforms'),
    freeOnly: checked('freeOnly').length > 0,
  };
}

/** The decorative command line that mirrors the current filters. */
function renderCommand(c) {
  const parts = ['atlas search'];
  const flag = (name, values) => {
    parts.push(' ', h('span', { class: 'flag' }, name));
    if (values != null) parts.push(' ', h('span', { class: 'arg' }, values));
  };
  if (c.query.trim()) parts.push(' ', h('span', { class: 'arg' }, `"${c.query.trim()}"`));
  if (c.capabilities.length) {
    flag(c.capabilityMode === 'all' ? '--can-all' : '--can', c.capabilities.map((id) => label('capabilities', id)).join(','));
  }
  if (c.origins.length) flag('--origin', c.origins.join(','));
  if (c.languages.length) flag('--lang', c.languages.join(','));
  if (c.platforms.length) flag('--on', c.platforms.join(','));
  if (c.freeOnly) flag('--free');
  el.command.replaceChildren(...parts);
}

function bindEvents() {
  el.search.addEventListener('input', updateResults);
  el.search.form?.addEventListener('submit', (e) => e.preventDefault());
  el.filters.addEventListener('change', updateResults);
  el.filters.addEventListener('submit', (e) => e.preventDefault());
  el.clear.addEventListener('click', () => {
    el.search.value = '';
    for (const input of el.filters.querySelectorAll('input[type="checkbox"]')) input.checked = false;
    const any = el.filters.querySelector('input[name="capabilityMode"][value="any"]');
    if (any) any.checked = true;
    updateResults();
    el.search.focus();
  });
  window.addEventListener('hashchange', route);
}

// ---------------------------------------------------------------------------
// Results

function updateResults() {
  state.criteria = readCriteria();
  const results = filterServices(state.services, state.criteria);
  const total = state.services.length;
  const active = hasActiveCriteria(state.criteria);

  el.clear.disabled = !active;
  el.count.textContent = active ? `${results.length}件が該当（全${total}件）` : `${total}件のサービス`;
  renderCommand(state.criteria);
  updateMoreSummary(state.criteria);
  state.globe?.setHighlight(state.criteria.origins);

  el.listEnd.hidden = results.length === 0;
  if (total === 0) {
    el.results.replaceChildren(
      h('li', { class: 'empty' }, h('p', {}, '検証が済んだサービスは、まだありません。'), h('p', {}, '公式情報で確かめられたものから順に載せていきます。')),
    );
    return;
  }
  if (results.length === 0) {
    el.results.replaceChildren(
      h('li', { class: 'empty' }, h('p', {}, '0件：条件に合うサービスはありません。'), h('p', {}, '条件を減らすか、[ 条件をクリア ] で最初からやり直してください。')),
    );
    return;
  }
  el.results.replaceChildren(...results.map(renderEntry));
}

const LIST_CAPS_MAX = 5;

/** One result in the list: a short summary. Conditions, sources and unknowns live on the detail page. */
function renderEntry(service) {
  const range = checkedRange(service);
  const stale = range && isStale(range.oldest, TODAY, state.vocab.staleAfterDays);
  // Every listed service is a chat service, so text chat is left to the detail page.
  const available = state.vocab.raw.capabilities.filter((c) => c.id !== 'text_chat' && AVAILABLE_STATUSES.has(capabilityStatus(service, c.id)));
  const shown = available.slice(0, LIST_CAPS_MAX);
  const more = available.length - shown.length;
  const origin = service.provider?.originCountryCode;
  const lifecycle = service.lifecycle?.status ?? 'unknown';

  return h(
    'li',
    { class: 'entry' },
    h(
      'article',
      { 'aria-labelledby': `entry-${service.id}` },
      h(
        'div',
        { class: 'entry__head' },
        h('h3', { class: 'entry__title', id: `entry-${service.id}` }, h('a', { href: `#/service/${service.id}`, dataset: { serviceId: service.id } }, service.name)),
        h('span', { class: 'entry__id', 'aria-hidden': 'true' }, service.id.toUpperCase()),
      ),
      previewFigure(service, 'thumb'),
      h(
        'p',
        { class: 'entry__provider' },
        service.provider?.name,
        origin ? ['（', regionLabel(origin), '）'] : '',
        lifecycle !== 'active' ? ` / ${label('lifecycleStatuses', lifecycle)}` : '',
      ),
      h('p', { class: 'entry__desc' }, service.description?.ja),
      shown.length
        ? h(
            'ul',
            { class: 'caps', 'aria-label': 'できること' },
            shown.map((c) => h('li', {}, statusBadge(capabilityStatus(service, c.id), { text: c.label }))),
            more > 0 ? h('li', { class: 'caps__more' }, `ほか${more}件`) : null,
          )
        : null,
      h(
        'p',
        { class: 'entry__foot' },
        h(
          'span',
          {},
          hasFreeOffer(service) ? h('span', { class: 'entry__free' }, '無料プランあり') : null,
          range ? `// 確認日 ${range.latest}` : '// 確認日なし',
          stale ? h('span', { class: 'stale' }, '要再確認') : null,
        ),
        h('a', { href: `#/service/${service.id}`, class: 'back', tabindex: '-1', 'aria-hidden': 'true' }, '[ 詳細を見る ]'),
      ),
    ),
  );
}

/**
 * The official page's Open Graph image, shown as a link preview.
 * The image is loaded from the provider's own server (not copied); if it fails, the figure is removed.
 */
function previewFigure(service, size) {
  const pv = service.officialPreview;
  if (!pv?.imageUrl) return null;
  const host = new URL(pv.sourceUrl ?? service.officialUrl).hostname;
  const large = size === 'large';
  const img = h('img', {
    src: pv.imageUrl,
    alt: large ? pv.alt ?? `${service.name} 公式サイトのプレビュー画像` : '',
    width: 1200,
    height: 630,
    loading: 'lazy',
    decoding: 'async',
    referrerpolicy: 'no-referrer',
  });
  const figure = h(
    'figure',
    { class: `preview preview--${size}` },
    large
      ? h('a', { href: service.officialUrl, target: '_blank', rel: 'noopener noreferrer' }, img, h('span', { class: 'visually-hidden' }, '（公式サイト・外部サイト・新しいタブで開きます）'))
      : h('a', { href: `#/service/${service.id}`, tabindex: '-1', 'aria-hidden': 'true' }, img),
    h('figcaption', {}, `// og:image ${host}`, large ? ` / 確認日 ${pv.checkedAt}` : null),
  );
  img.addEventListener('error', () => figure.remove(), { once: true });
  return figure;
}

// ---------------------------------------------------------------------------
// Terminal conventions: screen ID, command line, function keys

function setScreenId(id) {
  el.screenId.firstChild.nodeValue = id;
}

const MENU_TARGETS = { 1: '#search-title', 2: '#policy', 3: '#legend', 4: 'data/services.json' };

/** "選択項目またはサービス名 ===>": a number opens a menu item, anything else searches by name. */
function bindCommandLine() {
  el.cmdline.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = el.cmdInput.value.normalize('NFKC').trim();
    if (!value) return;
    el.cmdInput.value = '';
    if (MENU_TARGETS[value]) {
      const target = MENU_TARGETS[value];
      if (target.startsWith('#')) goTo(target);
      else location.href = target;
      return;
    }
    el.search.value = value;
    updateResults();
    goTo('#search-title');
    el.search.focus({ preventScroll: true });
  });
}

function goTo(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

/**
 * Keyboard shortcuts shown in the function-key line. They are ignored while typing in a field
 * and never override browser keys (F1–F12, Ctrl/Cmd combinations).
 */
function bindShortcuts() {
  const actions = {
    '/': () => {
      if (!el.detailView.hidden) goTo('#search-title');
      el.search.focus();
      el.search.select();
    },
    Escape: () => {
      if (!el.detailView.hidden) goTo('#');
      else if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    },
    c: () => el.clear.click(),
    m: () => {
      if (!el.detailView.hidden) location.hash = '#';
      requestAnimationFrame(() => {
        el.menu.scrollIntoView();
        el.cmdInput.focus({ preventScroll: true });
      });
    },
  };
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const typing = event.target instanceof HTMLInputElement && !['checkbox', 'radio'].includes(event.target.type);
    if (typing && event.key !== 'Escape') return;
    const action = actions[event.key] ?? actions[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    action();
  });
  document.querySelectorAll('.fkeys button').forEach((button) => {
    button.addEventListener('click', () => actions[button.dataset.key]?.());
  });
}

// ---------------------------------------------------------------------------
// Routing

function route() {
  const match = location.hash.match(/^#\/service\/([a-z0-9-]+)$/);
  const service = match && state.services.find((s) => s.id === match[1]);

  setScreenId(match ? 'ATLAS02' : 'ATLAS01');
  if (match) {
    if (service) {
      state.lastListFocusId = service.id;
      renderDetail(service);
      document.title = `${service.name} | AI Atlas`;
    } else {
      el.detailView.replaceChildren(
        h('p', {}, h('a', { href: '#', class: 'back' }, '<- 一覧に戻る')),
        h('h2', { class: 'detail__title', tabindex: '-1' }, 'サービスが見つかりません'),
        h('p', {}, '指定されたサービスは掲載されていないか、掲載を終了しました。'),
      );
      document.title = DEFAULT_TITLE;
    }
    el.listView.hidden = true;
    el.detailView.hidden = false;
    window.scrollTo(0, 0);
    el.detailView.querySelector('h2')?.focus();
    return;
  }

  el.detailView.hidden = true;
  el.listView.hidden = false;
  document.title = DEFAULT_TITLE;
  const anchor = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
  if (anchor) {
    anchor.scrollIntoView();
    if (anchor.hasAttribute('tabindex')) anchor.focus({ preventScroll: true });
  } else if (state.lastListFocusId) {
    el.results.querySelector(`a[data-service-id="${state.lastListFocusId}"]`)?.focus();
    state.lastListFocusId = null;
  }
}

// ---------------------------------------------------------------------------
// Detail view

function renderDetail(service) {
  const evidence = new Map((service.evidence ?? []).map((ev, i) => [ev.id, { ...ev, n: i + 1 }]));
  const refs = (ids) =>
    ids?.length
      ? h(
          'span',
          { class: 'refs' },
          ' 根拠 ',
          ids.map((id, i) => {
            const ev = evidence.get(id);
            return [
              i ? ' ' : '',
              ev
                ? h('a', { href: ev.url, target: '_blank', rel: 'noopener noreferrer', title: ev.title }, `[${ev.n}]`, h('span', { class: 'visually-hidden' }, ` ${ev.title}（外部サイト）`))
                : `[${id}]`,
            ];
          }),
        )
      : null;
  const meta = (claim) => {
    if (!claim?.checkedAt && !claim?.evidenceIds?.length) return null;
    const stale = claim.checkedAt && isStale(claim.checkedAt, TODAY, state.vocab.staleAfterDays);
    return h('span', { class: 'meta' }, claim.checkedAt ? `確認日 ${claim.checkedAt}` : '確認日なし', refs(claim.evidenceIds), stale ? h('span', { class: 'stale' }, '要再確認') : null);
  };
  const valueList = (claim, fmt) => (claim?.values?.length ? claim.values.map(fmt).join('、') : '未確認');
  const section = (title, ...children) => h('section', {}, h('h3', { class: 'h' }, title), ...children);
  const kvBlock = (rows) =>
    h(
      'dl',
      { class: 'kv' },
      rows.filter(Boolean).map(([term, value, claim]) => [h('dt', {}, term), h('dd', {}, value, meta(claim))]),
    );

  const origin = service.provider?.originCountryCode;
  const sections = [];

  // Overview
  sections.push(
    section(
      '概要',
      h('p', {}, service.description?.ja),
      kvBlock([
        ['提供元', [service.provider?.name, '（拠点: ', origin ? regionLabel(origin) : '未確認', '）'], service.provider],
        ['公式サイト', externalLink(service.officialUrl, new URL(service.officialUrl).hostname)],
        ['分類', (service.categories ?? []).map((c) => label('categories', c)).join('、')],
        ['提供状況', label('lifecycleStatuses', service.lifecycle?.status ?? 'unknown'), service.lifecycle],
        service.aliases?.length ? ['別名', service.aliases.join('、')] : null,
      ]),
      service.inclusionReason?.ja ? h('p', { class: 'dim' }, `掲載理由: ${service.inclusionReason.ja}`) : null,
    ),
  );

  // Availability
  sections.push(
    section(
      '提供地域',
      service.availability?.length
        ? h(
            'ul',
            { class: 'bullets' },
            service.availability.map((a) =>
              h('li', { class: 'claim-line' }, statusBadge(a.status, { text: regionLabel(a.regionCode) }), a.conditions?.ja ? h('span', { class: 'detail-text' }, a.conditions.ja) : null, meta(a)),
            ),
          )
        : null,
      h('p', { class: 'dim' }, '書かれていない国・地域は未確認です。'),
    ),
  );

  // Capabilities: recorded ones in full, unrecorded ones folded into one line
  const recorded = [];
  const unrecorded = [];
  for (const cap of state.vocab.raw.capabilities) {
    const entries = capabilityEntries(service, cap.id);
    if (entries.length === 0) unrecorded.push(cap.label);
    for (const entry of entries) {
      recorded.push(
        h(
          'li',
          { class: 'claim-line' },
          statusBadge(entry.status, { text: cap.label }),
          h('span', { class: 'detail-text' }, [label('deliveries', entry.delivery), ...scopeParts(entry.scope)].join(' / ')),
          entry.conditions?.ja ? h('span', { class: 'detail-text' }, entry.conditions.ja) : null,
          meta(entry),
        ),
      );
    }
  }
  sections.push(
    section(
      'できること',
      recorded.length ? h('ul', { class: 'bullets' }, recorded) : null,
      unrecorded.length ? h('p', {}, statusBadge('unknown'), ' ', unrecorded.join('、'), h('span', { class: 'meta' }, 'データ未登録。使えないという意味ではありません。')) : null,
    ),
  );

  // Pricing: ASCII table for the plans, notes below
  const offers = service.pricing?.offers ?? [];
  sections.push(
    section(
      '料金',
      offers.length
        ? [
            ...asciiTable(
              ['プラン', '区分', '価格', '対象地域'],
              offers.map((o) => [o.planName, label('pricingAccess', o.access), priceText(o), o.regionCode ? regionName(o.regionCode) : '未確認']),
              { caption: '料金プラン', maxCell: 24 },
            ),
            h(
              'ul',
              { class: 'bullets' },
              offers.map((o) => h('li', {}, o.planName, o.limits?.ja ? `: ${o.limits.ja}` : '', o.isPromotional ? '（期間限定の価格）' : '', meta(o))),
            ),
          ]
        : h('p', {}, '料金は未確認です。'),
      h('p', { class: 'dim' }, '価格は確認日時点の公式の表示です。為替の換算はしていません。'),
    ),
  );

  // Languages & platforms
  sections.push(
    section(
      '言語と利用環境',
      kvBlock([
        ['画面の言語', valueList(service.languages?.interface, languageName), service.languages?.interface],
        ['会話の言語', valueList(service.languages?.conversation, languageName), service.languages?.conversation],
        ['利用環境', valueList(service.platforms, (p) => label('platforms', p)), service.platforms],
      ]),
    ),
  );

  // Strength claims
  if (service.strengthClaims?.length) {
    sections.push(
      section(
        '特徴として示されていること',
        h('p', { class: 'dim' }, '機能への対応とは別の情報です。提供元の主張は、客観的な評価ではありません。'),
        h(
          'ul',
          { class: 'bullets' },
          service.strengthClaims.map((s) =>
            h(
              'li',
              { class: 'claim-line' },
              h('span', { class: 'tag' }, label('strengthClaimTypes', s.claimType)),
              ' ',
              s.claim.ja,
              s.scope?.ja ? h('span', { class: 'detail-text' }, `適用範囲: ${s.scope.ja}`) : null,
              s.basis?.ja ? h('span', { class: 'detail-text' }, `判断の根拠: ${s.basis.ja}`) : null,
              meta(s),
            ),
          ),
        ),
      ),
    );
  }

  // Evidence
  sections.push(
    section(
      '根拠となる情報源',
      evidence.size
        ? h(
            'ol',
            { class: 'evidence' },
            [...evidence.values()].map((ev) =>
              h(
                'li',
                {},
                h('span', { class: 'evidence__n', 'aria-hidden': 'true' }, `[${ev.n}]`),
                h(
                  'div',
                  {},
                  externalLink(ev.url, ev.title),
                  h('span', { class: 'meta' }, [label('sourceTypes', ev.sourceType), `確認日 ${ev.checkedAt}`, ev.locale ? `表示言語 ${languageName(ev.locale)}` : null].filter(Boolean).join(' / ')),
                  h('p', {}, ev.note),
                ),
              ),
            ),
          )
        : h('p', {}, '登録された根拠はありません。'),
    ),
  );

  el.detailView.replaceChildren(
    h('p', {}, h('a', { href: '#', class: 'back' }, '<- 一覧に戻る')),
    h('p', { class: 'prompt', 'aria-hidden': 'true' }, h('span', { class: 'green' }, '===>'), ' atlas show ', h('span', { style: 'color:var(--amber)' }, service.id)),
    h('h2', { class: 'detail__title', tabindex: '-1' }, service.name),
    previewFigure(service, 'large'),
    ...sections,
  );
}

function scopeParts(scope) {
  if (!scope) return [];
  const parts = [];
  if (scope.regions?.length) parts.push(`地域: ${scope.regions.map(regionName).join('、')}`);
  if (scope.plans?.length) parts.push(`プラン: ${scope.plans.join('、')}`);
  if (scope.platforms?.length) parts.push(`環境: ${scope.platforms.map((p) => label('platforms', p)).join('、')}`);
  if (scope.languages?.length) parts.push(`言語: ${scope.languages.map(languageName).join('、')}`);
  return parts;
}

function priceText(o) {
  if (o.amount == null) return o.access === 'free' ? '無料' : '-';
  let amount;
  try {
    amount = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: o.currency }).format(o.amount);
  } catch {
    amount = `${o.amount} ${o.currency}`;
  }
  return `${amount}/${label('billingPeriods', o.billingPeriod)}（${label('taxTreatments', o.taxTreatment)}）`;
}
