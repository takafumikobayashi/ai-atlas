// Parser for the main-menu command line ("選択項目またはサービス名 ===>").
// Pure module (no DOM) so it can be unit-tested. The grammar mirrors the decorative
// "===> atlas search …" line, so what the page shows can be typed back in:
//
//   1〜4                                   open a menu item
//   [atlas] [search] [words…] [--flag values]…
//       --can a,b      capabilities, any of them      (--can-all: all of them)
//       --origin JP    provider origin country        (code or name, e.g. 日本)
//       --lang ja      conversation language          (code or name, e.g. 日本語)
//       --on ios       platform                       (id or label)
//       --free         has a free plan
//   [atlas] show <service>                 open a service's detail page
//   clear | help

/**
 * @typedef {{ id: string, label: string }} Option
 * @typedef {{
 *   capabilities: Option[], platforms: Option[],
 *   origins: string[], languages: string[],
 *   services: { id: string, name: string, aliases?: string[] }[],
 *   regionName?: (code: string) => string, languageName?: (code: string) => string,
 * }} CommandContext
 */

const FLAGS = new Set(['can', 'can-all', 'origin', 'lang', 'on', 'free']);

export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKC')
    // IME input often turns "--" into long-vowel marks or dashes
    .replace(/(^|\s)[ー－—–‐]{2}(?=\S)/g, '$1--')
    .trim();
}

const fold = (s) => normalize(s).toLowerCase();

/** Splits on whitespace, keeping "quoted phrases" together. */
export function tokenize(text) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text))) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
}

/**
 * @param {string} raw
 * @param {CommandContext} ctx
 * @returns {{ type: 'empty' } | { type: 'menu', item: number } | { type: 'help' } | { type: 'clear' }
 *   | { type: 'show', id: string } | { type: 'search', criteria: object } | { type: 'error', errors: string[] }}
 */
export function parseCommand(raw, ctx) {
  const text = normalize(raw);
  if (!text) return { type: 'empty' };
  if (/^[1-4]$/.test(text)) return { type: 'menu', item: Number(text) };

  const tokens = tokenize(text);
  if (fold(tokens[0]) === 'atlas') tokens.shift();
  const verb = fold(tokens[0] ?? '');
  if (['help', '?', '-h', '--help', 'ヘルプ'].includes(verb)) return { type: 'help' };
  if (verb === 'clear' && tokens.length === 1) return { type: 'clear' };
  if (verb === 'show') {
    const name = tokens.slice(1).join(' ');
    if (!name) return { type: 'error', errors: ['show のあとにサービス名を入れてください（例：show claude）。'] };
    const service = findService(name, ctx.services);
    return service ? { type: 'show', id: service.id } : { type: 'error', errors: [`「${name}」というサービスは掲載されていません。`] };
  }
  if (verb === 'search') tokens.shift();

  const criteria = {
    query: '',
    capabilities: [],
    capabilityMode: 'any',
    origins: [],
    languages: [],
    platforms: [],
    freeOnly: false,
  };
  const errors = [];
  const words = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token.startsWith('--')) {
      words.push(token);
      continue;
    }
    const flag = fold(token.slice(2));
    if (!FLAGS.has(flag)) {
      errors.push(`--${flag} という指定はありません。使えるのは --can / --can-all / --origin / --lang / --on / --free です。`);
      continue;
    }
    // collect values up to the next flag; commas and 、 also separate values
    const values = [];
    while (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
      values.push(...tokens[++i].split(/[,、]/).filter(Boolean));
    }
    if (flag === 'free') {
      criteria.freeOnly = true;
      words.push(...values); // "--free claude" → treat trailing words as search words
      continue;
    }
    if (values.length === 0) {
      errors.push(`--${flag} のあとに値を入れてください。`);
      continue;
    }
    if (flag === 'can' || flag === 'can-all') {
      if (flag === 'can-all') criteria.capabilityMode = 'all';
      resolveAll(values, optionMatcher(ctx.capabilities), criteria.capabilities, errors, 'できること', ctx.capabilities.map((c) => c.label));
    } else if (flag === 'on') {
      resolveAll(values, optionMatcher(ctx.platforms), criteria.platforms, errors, '利用環境', ctx.platforms.map((p) => p.label));
    } else if (flag === 'origin') {
      const names = ctx.origins.map((c) => ctx.regionName?.(c) ?? c);
      resolveAll(values, codeMatcher(ctx.origins, ctx.regionName), criteria.origins, errors, '提供元の拠点', names, '（掲載データにある国だけ選べます）');
    } else if (flag === 'lang') {
      const names = ctx.languages.map((c) => ctx.languageName?.(c) ?? c);
      resolveAll(values, codeMatcher(ctx.languages, ctx.languageName), criteria.languages, errors, '会話できる言語', names);
    }
  }

  if (errors.length) return { type: 'error', errors };
  criteria.query = words.join(' ');
  return { type: 'search', criteria };
}

function resolveAll(values, match, into, errors, what, allowed, note = '') {
  for (const value of values) {
    const id = match(value);
    if (id) {
      if (!into.includes(id)) into.push(id);
    } else {
      errors.push(`${what}に「${value}」はありません${note}。使える値: ${allowed.join('、')}`);
    }
  }
}

/** Matches an option by id or label (case/width-insensitive). */
function optionMatcher(options) {
  return (value) => {
    const v = fold(value);
    return options.find((o) => fold(o.id) === v || fold(o.label) === v)?.id ?? null;
  };
}

/** Matches an ISO code or its display name (e.g. JP / 日本, ja / 日本語). */
function codeMatcher(codes, nameOf) {
  return (value) => {
    const v = fold(value);
    return codes.find((c) => fold(c) === v || (nameOf && fold(nameOf(c)) === v)) ?? null;
  };
}

function findService(name, services) {
  const v = fold(name);
  return (
    services.find((s) => fold(s.id) === v || fold(s.name) === v || (s.aliases ?? []).some((a) => fold(a) === v)) ??
    null
  );
}

/** Usage text shown for "help". */
export const HELP_TEXT = `使い方（例を入力して Enter）
  1〜4                          メニューの項目へ移動
  claude                        サービス名・提供元で検索
  --can 画像生成,音声会話        できること（いずれか）
  --can-all 画像生成,音声会話    できること（すべて）
  --origin JP  /  --origin 日本   提供元の拠点
  --lang ja    /  --lang 日本語   会話できる言語
  --on ios                      利用環境
  --free                        無料プランあり
  atlas search 検索 --can Web検索 --free   組み合わせも可
  show claude                   詳細画面を開く
  clear                         条件をクリア`;
