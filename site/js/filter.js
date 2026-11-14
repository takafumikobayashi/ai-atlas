// Pure catalogue helpers shared by the UI and the tests. No DOM access here.

export const AVAILABLE_STATUSES = new Set(['supported', 'conditional']);
const STATUS_RANK = { supported: 3, conditional: 2, unsupported: 1, unknown: 0 };
const FREE_ACCESS = new Set(['free', 'freemium']);

/** Empty filter state. Groups combine with AND; values inside a group with OR (capabilities: selectable). */
export function emptyCriteria() {
  return {
    query: '',
    capabilities: [],
    capabilityMode: 'any', // 'any' = いずれか (OR) / 'all' = すべて (AND)
    origins: [],
    languages: [],
    platforms: [],
    freeOnly: false,
  };
}

export function hasActiveCriteria(c) {
  return (
    c.query.trim() !== '' ||
    c.capabilities.length > 0 ||
    c.origins.length > 0 ||
    c.languages.length > 0 ||
    c.platforms.length > 0 ||
    c.freeOnly
  );
}

export function normalizeText(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase().trim();
}

/**
 * The most favourable status recorded for a capability across its scoped entries.
 * Missing entries are `unknown` — never `unsupported`.
 */
export function capabilityStatus(service, capabilityId) {
  let best = 'unknown';
  for (const entry of service.capabilities ?? []) {
    if (entry.id === capabilityId && STATUS_RANK[entry.status] > STATUS_RANK[best]) best = entry.status;
  }
  return best;
}

export function capabilityEntries(service, capabilityId) {
  return (service.capabilities ?? []).filter((c) => c.id === capabilityId);
}

export function hasFreeOffer(service) {
  return (service.pricing?.offers ?? []).some((o) => FREE_ACCESS.has(o.access));
}

export function matchesQuery(service, query) {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = [service.name, ...(service.aliases ?? []), service.provider?.name].map(normalizeText);
  return q.split(/\s+/).every((term) => haystack.some((h) => h.includes(term)));
}

export function matchesCriteria(service, c) {
  if (!matchesQuery(service, c.query)) return false;

  if (c.capabilities.length > 0) {
    const ok = (id) => AVAILABLE_STATUSES.has(capabilityStatus(service, id));
    const pass = c.capabilityMode === 'all' ? c.capabilities.every(ok) : c.capabilities.some(ok);
    if (!pass) return false;
  }
  if (c.origins.length > 0 && !c.origins.includes(service.provider?.originCountryCode ?? '')) return false;
  if (c.languages.length > 0) {
    const langs = service.languages?.conversation?.values ?? [];
    if (!c.languages.some((l) => langs.some((v) => v === l || v.startsWith(`${l}-`)))) return false;
  }
  if (c.platforms.length > 0) {
    const platforms = service.platforms?.values ?? [];
    if (!c.platforms.some((p) => platforms.includes(p))) return false;
  }
  if (c.freeOnly && !hasFreeOffer(service)) return false;
  return true;
}

export function filterServices(services, criteria) {
  return services.filter((s) => matchesCriteria(s, criteria));
}

/** Filter options that depend on the data (only values present in the catalogue). */
export function deriveOptions(services) {
  const origins = new Map();
  const languages = new Map();
  for (const s of services) {
    const origin = s.provider?.originCountryCode;
    if (origin) origins.set(origin, (origins.get(origin) ?? 0) + 1);
    for (const lang of s.languages?.conversation?.values ?? []) {
      const base = lang.split('-')[0];
      languages.set(base, (languages.get(base) ?? 0) + 1);
    }
  }
  const sortByCount = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
  return { origins: sortByCount(origins), languages: sortByCount(languages) };
}

/** All checkedAt dates attached to claims and evidence of a service. */
export function checkedDates(service) {
  const dates = [];
  const push = (d) => typeof d === 'string' && dates.push(d);
  push(service.provider?.checkedAt);
  push(service.platforms?.checkedAt);
  push(service.languages?.interface?.checkedAt);
  push(service.languages?.conversation?.checkedAt);
  push(service.pricing?.checkedAt);
  push(service.lifecycle?.checkedAt);
  for (const list of [service.availability, service.capabilities, service.pricing?.offers, service.strengthClaims, service.evidence]) {
    for (const item of list ?? []) push(item.checkedAt);
  }
  return dates.sort();
}

export function checkedRange(service) {
  const dates = checkedDates(service);
  return dates.length ? { oldest: dates[0], latest: dates[dates.length - 1] } : null;
}

export function isStale(date, today, staleAfterDays) {
  if (!date) return false;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000;
  return days > staleAfterDays;
}

export function sortServices(services) {
  return [...services].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
