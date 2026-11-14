// Initialises site/og-card.html (the source of site/og-image.png).
// Kept as an external same-origin module so it runs under the site's CSP (script-src 'self').
// scripts/build-og.mjs waits for body[data-ready="1"] and refuses to capture without it.
import { mountGlobe } from './globe.js';

// Show only the countries that actually appear in the published catalogue.
const catalog = await fetch('data/services.json').then((r) => r.json());
const origins = [...new Set(catalog.services.map((s) => s.provider?.originCountryCode).filter(Boolean))];
await document.fonts.ready;
mountGlobe(document.getElementById('globe'), { origins, angleDeg: 80, still: true });
document.body.dataset.ready = '1';
