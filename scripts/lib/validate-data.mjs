// AI Atlas catalogue validator.
// Checks structure, vocabulary, and the evidence rules in docs/data-schema.md.
// Pure module: no file I/O, so it can be used from the CLI and from tests.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REGION = /^[A-Z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const EXAMPLE_HOSTS = /(^|\.)(example\.(invalid|com|org|net)|invalid|test|localhost)$/i;
const CLAIM_STATUSES = new Set(['supported', 'conditional', 'unsupported']);

/**
 * @param {unknown} catalog parsed services file ({ schemaVersion, services })
 * @param {object} vocab parsed data/vocabulary.json
 * @param {{ allowExampleDomains?: boolean, today?: string }} [options]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateCatalog(catalog, vocab, options = {}) {
  const errors = [];
  const warnings = [];
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const allowExample = options.allowExampleDomains === true;

  const ids = (key) => new Set((vocab[key] ?? []).map((x) => x.id));
  const V = {
    statuses: ids('statuses'),
    capabilities: ids('capabilities'),
    categories: ids('categories'),
    platforms: ids('platforms'),
    deliveries: ids('deliveries'),
    sourceTypes: ids('sourceTypes'),
    pricingAccess: ids('pricingAccess'),
    billingPeriods: ids('billingPeriods'),
    taxTreatments: ids('taxTreatments'),
    lifecycleStatuses: ids('lifecycleStatuses'),
    strengthClaimTypes: ids('strengthClaimTypes'),
  };
  const staleAfterDays = Number.isInteger(vocab.staleAfterDays) ? vocab.staleAfterDays : 90;

  if (!isObject(catalog)) {
    return { errors: ['ルート: オブジェクトではありません'], warnings };
  }
  if (catalog.schemaVersion !== 1) errors.push('ルート: schemaVersion は 1 である必要があります');
  if (!Array.isArray(catalog.services)) {
    errors.push('ルート: services は配列である必要があります');
    return { errors, warnings };
  }

  const seenIds = new Set();
  catalog.services.forEach((service, index) => {
    const label = isObject(service) && typeof service.id === 'string' ? service.id : `services[${index}]`;
    const err = (msg) => errors.push(`${label}: ${msg}`);
    const warn = (msg) => warnings.push(`${label}: ${msg}`);

    if (!isObject(service)) return err('オブジェクトではありません');

    // --- identity -----------------------------------------------------------
    if (typeof service.id !== 'string' || !SLUG.test(service.id)) err('id は小文字英数字とハイフンのslugにしてください');
    else if (seenIds.has(service.id)) err('id が重複しています');
    else seenIds.add(service.id);

    if (!nonEmptyString(service.name)) err('name が必要です');
    if (!Array.isArray(service.aliases) || !service.aliases.every(nonEmptyString)) err('aliases は文字列の配列にしてください');
    if (!isObject(service.description) || !nonEmptyString(service.description.ja)) err('description.ja が必要です');
    if (service.inclusionReason != null && (!isObject(service.inclusionReason) || !nonEmptyString(service.inclusionReason.ja))) {
      err('inclusionReason は null または { ja } にしてください');
    }
    checkUrl(service.officialUrl, 'officialUrl', err, allowExample);

    // --- evidence -------------------------------------------------------------
    const evidenceIds = new Set();
    if (!Array.isArray(service.evidence)) {
      err('evidence は配列である必要があります');
    } else {
      service.evidence.forEach((ev, i) => {
        const where = `evidence[${i}]`;
        if (!isObject(ev)) return err(`${where}: オブジェクトではありません`);
        if (typeof ev.id !== 'string' || !SLUG.test(ev.id)) err(`${where}: id はslugにしてください`);
        else if (evidenceIds.has(ev.id)) err(`${where}: id "${ev.id}" が重複しています`);
        else evidenceIds.add(ev.id);
        checkUrl(ev.url, `${where}.url`, err, allowExample);
        if (!nonEmptyString(ev.title)) err(`${where}: title が必要です`);
        if (!V.sourceTypes.has(ev.sourceType)) err(`${where}: sourceType "${ev.sourceType}" は定義されていません`);
        checkDate(ev.checkedAt, `${where}.checkedAt`, err, today, { required: true });
        checkDate(ev.publishedAt, `${where}.publishedAt`, err, today, { required: false });
        if (ev.locale != null && !(typeof ev.locale === 'string' && LANGUAGE.test(ev.locale))) err(`${where}: locale は言語コードにしてください`);
        if (!nonEmptyString(ev.note)) err(`${where}: 何を裏付けるかを note に記録してください`);
      });
    }

    const usedEvidence = new Set();
    /** Validates a dated claim: status needs evidence + checkedAt; references must resolve. */
    const checkClaim = (claim, where, { status, needsEvidence }) => {
      if (!Array.isArray(claim.evidenceIds)) {
        err(`${where}: evidenceIds は配列である必要があります`);
        return;
      }
      for (const ref of claim.evidenceIds) {
        if (!evidenceIds.has(ref)) err(`${where}: 根拠 "${ref}" が evidence にありません`);
        usedEvidence.add(ref);
      }
      checkDate(claim.checkedAt, `${where}.checkedAt`, err, today, { required: false });
      if (needsEvidence) {
        if (claim.evidenceIds.length === 0) err(`${where}: ${status ?? '値'} には根拠 (evidenceIds) が必要です`);
        if (claim.checkedAt == null) err(`${where}: ${status ?? '値'} には確認日 (checkedAt) が必要です`);
      }
      if (claim.checkedAt && DATE.test(claim.checkedAt) && daysBetween(claim.checkedAt, today) > staleAfterDays) {
        warn(`${where}: 確認日 ${claim.checkedAt} から ${staleAfterDays} 日以上経過しています（要再確認）`);
      }
    };
    const checkConditions = (value, where, required) => {
      if (value == null) {
        if (required) err(`${where}: conditional には具体的な conditions.ja が必要です`);
        return;
      }
      if (!isObject(value) || !nonEmptyString(value.ja)) err(`${where}: conditions は null または { ja } にしてください`);
    };

    // --- provider ---------------------------------------------------------------
    if (!isObject(service.provider) || !nonEmptyString(service.provider.name)) {
      err('provider.name が必要です');
    } else {
      const origin = service.provider.originCountryCode;
      if (origin != null && !(typeof origin === 'string' && REGION.test(origin))) err('provider.originCountryCode は ISO 3166-1 alpha-2 にしてください');
      checkClaim({ evidenceIds: service.provider.evidenceIds, checkedAt: service.provider.checkedAt ?? null }, 'provider', {
        status: '提供元の拠点',
        needsEvidence: origin != null,
      });
    }

    // --- categories -------------------------------------------------------------
    if (!Array.isArray(service.categories) || service.categories.length === 0) err('categories を1つ以上指定してください');
    else for (const c of service.categories) if (!V.categories.has(c)) err(`categories: "${c}" は定義されていません`);

    // --- platforms / languages (value lists with evidence) ---------------------
    const checkValueList = (obj, where, validate) => {
      if (!isObject(obj) || !Array.isArray(obj.values)) return err(`${where}: { values, evidenceIds, checkedAt } の形にしてください`);
      if (new Set(obj.values).size !== obj.values.length) err(`${where}: values が重複しています`);
      obj.values.forEach((v) => validate(v) || err(`${where}: "${v}" は無効な値です`));
      checkClaim(obj, where, { status: '登録値', needsEvidence: obj.values.length > 0 });
    };
    checkValueList(service.platforms, 'platforms', (v) => V.platforms.has(v));
    if (!isObject(service.languages)) err('languages が必要です');
    else {
      checkValueList(service.languages.interface, 'languages.interface', (v) => typeof v === 'string' && LANGUAGE.test(v));
      checkValueList(service.languages.conversation, 'languages.conversation', (v) => typeof v === 'string' && LANGUAGE.test(v));
    }

    // --- availability -------------------------------------------------------------
    if (!Array.isArray(service.availability)) err('availability は配列である必要があります');
    else {
      const regions = new Set();
      service.availability.forEach((a, i) => {
        const where = `availability[${i}]`;
        if (!isObject(a)) return err(`${where}: オブジェクトではありません`);
        if (typeof a.regionCode !== 'string' || !REGION.test(a.regionCode)) err(`${where}: regionCode は ISO 3166-1 alpha-2 にしてください`);
        else if (regions.has(a.regionCode)) err(`${where}: 地域 ${a.regionCode} が重複しています`);
        else regions.add(a.regionCode);
        checkStatus(a.status, where);
        checkConditions(a.conditions, where, a.status === 'conditional');
        checkClaim(a, where, { status: a.status, needsEvidence: CLAIM_STATUSES.has(a.status) });
      });
    }

    // --- capabilities -------------------------------------------------------------
    if (!Array.isArray(service.capabilities)) err('capabilities は配列である必要があります');
    else {
      service.capabilities.forEach((c, i) => {
        const where = `capabilities[${i}]${isObject(c) && c.id ? `(${c.id})` : ''}`;
        if (!isObject(c)) return err(`${where}: オブジェクトではありません`);
        if (!V.capabilities.has(c.id)) err(`${where}: 機能ID "${c.id}" は定義されていません`);
        checkStatus(c.status, where);
        if (!V.deliveries.has(c.delivery)) err(`${where}: delivery "${c.delivery}" は定義されていません`);
        if (!isObject(c.scope)) err(`${where}: scope が必要です`);
        else {
          for (const key of ['regions', 'plans', 'platforms', 'languages']) {
            if (!Array.isArray(c.scope[key])) err(`${where}: scope.${key} は配列である必要があります`);
          }
          (c.scope.regions ?? []).forEach((r) => REGION.test(r) || err(`${where}: scope.regions "${r}" は無効です`));
          (c.scope.platforms ?? []).forEach((p) => V.platforms.has(p) || err(`${where}: scope.platforms "${p}" は無効です`));
          (c.scope.languages ?? []).forEach((l) => LANGUAGE.test(l) || err(`${where}: scope.languages "${l}" は無効です`));
        }
        checkConditions(c.conditions, where, c.status === 'conditional');
        checkClaim(c, where, { status: c.status, needsEvidence: CLAIM_STATUSES.has(c.status) });
      });
    }

    // --- pricing ------------------------------------------------------------------
    if (!isObject(service.pricing) || !Array.isArray(service.pricing.offers)) err('pricing.offers は配列である必要があります');
    else {
      checkClaim(service.pricing, 'pricing', { status: '料金情報', needsEvidence: false });
      service.pricing.offers.forEach((o, i) => {
        const where = `pricing.offers[${i}]`;
        if (!isObject(o)) return err(`${where}: オブジェクトではありません`);
        if (!nonEmptyString(o.planName)) err(`${where}: planName が必要です`);
        if (!V.pricingAccess.has(o.access)) err(`${where}: access "${o.access}" は定義されていません`);
        if (o.regionCode != null && !(typeof o.regionCode === 'string' && REGION.test(o.regionCode))) err(`${where}: regionCode は null または国コードにしてください`);
        if (o.amount != null) {
          if (typeof o.amount !== 'number' || o.amount < 0) err(`${where}: amount は0以上の数値にしてください`);
          if (typeof o.currency !== 'string' || !CURRENCY.test(o.currency)) err(`${where}: 金額には通貨 (ISO 4217) が必要です`);
          if (!V.billingPeriods.has(o.billingPeriod)) err(`${where}: 金額には billingPeriod が必要です`);
          if (o.regionCode == null) err(`${where}: 金額には対象地域 regionCode が必要です`);
        } else if (o.currency != null || o.billingPeriod != null) {
          if (o.currency != null && !CURRENCY.test(o.currency)) err(`${where}: currency が無効です`);
          if (o.billingPeriod != null && !V.billingPeriods.has(o.billingPeriod)) err(`${where}: billingPeriod が無効です`);
        }
        if (!V.taxTreatments.has(o.taxTreatment)) err(`${where}: taxTreatment "${o.taxTreatment}" は定義されていません`);
        if (o.limits != null && (!isObject(o.limits) || !nonEmptyString(o.limits.ja))) err(`${where}: limits は null または { ja } にしてください`);
        if (o.isPromotional != null && typeof o.isPromotional !== 'boolean') err(`${where}: isPromotional は真偽値にしてください`);
        checkClaim(o, where, { status: `料金区分 ${o.access}`, needsEvidence: o.access !== 'unknown' });
      });
    }

    // --- strength claims ------------------------------------------------------------
    if (!Array.isArray(service.strengthClaims)) err('strengthClaims は配列である必要があります');
    else {
      service.strengthClaims.forEach((s, i) => {
        const where = `strengthClaims[${i}]`;
        if (!isObject(s)) return err(`${where}: オブジェクトではありません`);
        if (!isObject(s.claim) || !nonEmptyString(s.claim.ja)) err(`${where}: claim.ja が必要です`);
        if (!V.strengthClaimTypes.has(s.claimType)) err(`${where}: claimType "${s.claimType}" は定義されていません`);
        if (s.scope != null && (!isObject(s.scope) || !nonEmptyString(s.scope.ja))) err(`${where}: scope は null または { ja } にしてください`);
        if (s.claimType === 'editorial_observation' && (!isObject(s.basis) || !nonEmptyString(s.basis?.ja))) {
          err(`${where}: 編集部の所見には判断根拠 basis.ja が必要です`);
        }
        checkClaim(s, where, { status: '得意分野の主張', needsEvidence: s.claimType === 'provider_claim' });
      });
    }

    // --- lifecycle --------------------------------------------------------------------
    if (!isObject(service.lifecycle)) err('lifecycle が必要です');
    else {
      if (!V.lifecycleStatuses.has(service.lifecycle.status)) err(`lifecycle.status "${service.lifecycle.status}" は定義されていません`);
      checkClaim(service.lifecycle, 'lifecycle', {
        status: `提供状況 ${service.lifecycle.status}`,
        needsEvidence: service.lifecycle.status !== 'unknown',
      });
    }

    // --- hygiene ------------------------------------------------------------------------
    for (const id of evidenceIds) if (!usedEvidence.has(id)) warn(`evidence "${id}" はどの主張からも参照されていません`);

    function checkStatus(status, where) {
      if (!V.statuses.has(status)) err(`${where}: status "${status}" は定義されていません`);
    }
  });

  return { errors, warnings };
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function checkUrl(value, where, err, allowExample) {
  let url;
  try {
    url = new URL(value);
  } catch {
    err(`${where}: URLが無効です`);
    return;
  }
  if (url.protocol !== 'https:') err(`${where}: https のURLにしてください`);
  if (!allowExample && EXAMPLE_HOSTS.test(url.hostname)) err(`${where}: 例示用ドメイン (${url.hostname}) は公開データに使えません`);
}

function checkDate(value, where, err, today, { required }) {
  if (value == null) {
    if (required) err(`${where}: 日付が必要です`);
    return;
  }
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    err(`${where}: YYYY-MM-DD 形式の実在する日付にしてください`);
    return;
  }
  if (value > today) err(`${where}: 未来の日付 (${value}) は使えません`);
}

function daysBetween(from, to) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
