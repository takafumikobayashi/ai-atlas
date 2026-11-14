// ASCII globe: a slowly rotating sphere drawn with characters.
// Graticule every 20° latitude / 30° longitude; provider origin countries are marked with "@".
// Purely decorative (the container is aria-hidden). Respects prefers-reduced-motion.

// Approximate centroids [lat, lon] for countries likely to appear as provider origins.
const CENTROIDS = {
  US: [39, -98], CA: [56, -106], MX: [23, -102], BR: [-10, -52], AR: [-35, -65],
  GB: [54, -2], IE: [53, -8], FR: [46, 2], DE: [51, 10], NL: [52, 5], CH: [47, 8],
  SE: [62, 15], FI: [64, 26], ES: [40, -4], IT: [42, 12], PL: [52, 19], EE: [59, 25],
  RU: [60, 90], UA: [49, 32], TR: [39, 35], IL: [31, 35], AE: [24, 54], SA: [24, 45],
  IN: [22, 79], CN: [35, 104], HK: [22, 114], TW: [24, 121], KR: [36, 128], JP: [36, 138],
  SG: [1, 104], ID: [-2, 118], VN: [16, 107], TH: [15, 101], AU: [-25, 134], NZ: [-41, 174],
  ZA: [-29, 24], NG: [9, 8], KE: [0, 38], EG: [27, 30],
};

const ROWS = 27;
const RY = 13; // radius in rows
const CY = RY;
// Horizontal radius depends on the font's cell aspect ratio; measured at mount time.
let RX = 26;
let COLS = RX * 2 + 8; // spare columns on the right for marker labels
let CX = RX + 1;

function measureAspect(pre) {
  const probe = document.createElement('span');
  probe.textContent = 'x'.repeat(50);
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
  pre.append(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  const cellW = rect.width / 50;
  const lineH = parseFloat(getComputedStyle(pre).lineHeight) || rect.height;
  if (!cellW || !lineH) return;
  RX = Math.round((RY * lineH) / cellW);
  COLS = RX * 2 + 8;
  CX = RX + 1;
}
const TILT = (20 * Math.PI) / 180; // look down slightly so mid-northern latitudes face the viewer
const DEG = 180 / Math.PI;

export function mountGlobe(pre, { origins = [] } = {}) {
  const markers = origins
    .filter((code) => CENTROIDS[code])
    .map((code) => {
      const [lat, lon] = CENTROIDS[code].map((d) => d / DEG);
      return { code, v: [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)] };
    });
  let highlighted = new Set();
  measureAspect(pre);
  // Re-measure once web fonts have loaded (the cell width may change).
  document.fonts?.ready.then(() => {
    measureAspect(pre);
    draw();
  });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Start with Japan roughly facing the viewer.
  let theta = -138 / DEG;

  const draw = () => {
    pre.innerHTML = render(theta, markers, highlighted);
  };

  let last = 0;
  let raf = 0;
  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    if (t - last < 70) return; // ~14 fps is plenty for a terminal look
    last = t;
    theta += 0.004;
    draw();
  };
  const start = () => {
    cancelAnimationFrame(raf);
    if (!reduced.matches && !document.hidden) raf = requestAnimationFrame(tick);
  };
  reduced.addEventListener?.('change', () => {
    start();
    draw();
  });
  document.addEventListener('visibilitychange', start);

  draw();
  start();

  return {
    setHighlight(codes) {
      highlighted = new Set(codes);
      draw();
    },
  };
}

function render(theta, markers, highlighted) {
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const cosK = Math.cos(TILT);
  const sinK = Math.sin(TILT);
  const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => [' ', '']));

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const nx = (c - CX) / RX;
      const ny = (r - CY) / RY;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const vz = Math.sqrt(1 - d2);
      const vx = nx;
      const vy = -ny;
      // view -> world: undo tilt (about X), then undo spin (about Y)
      const y1 = vy * cosK + vz * sinK;
      const z1 = -vy * sinK + vz * cosK;
      const wx = vx * cosT - z1 * sinT;
      const wz = vx * sinT + z1 * cosT;
      const lat = Math.asin(Math.max(-1, Math.min(1, y1))) * DEG;
      const lon = Math.atan2(wx, wz) * DEG;

      const dLat = Math.abs(lat - Math.round(lat / 20) * 20);
      const dLon = Math.abs(lon - Math.round(lon / 30) * 30) * Math.cos(lat / DEG);
      const onLat = dLat < 2.4;
      const onLon = dLon < 2.4 && Math.abs(lat) < 80;
      const rim = d2 > 0.9;

      let ch = ' ';
      let cls = '';
      if (onLat && onLon) ch = '+';
      else if (onLat || onLon) ch = vz > 0.45 ? ':' : '.';
      else if (rim) ch = '.';
      if (ch !== ' ') {
        if (Math.abs(lat) < 2.4 && onLat) cls = 'g-eq';
        else if (vz < 0.35) cls = 'g-dim';
      }
      grid[r][c] = [ch, cls];
    }
  }

  for (const m of markers) {
    const [x, y, z] = m.v;
    // world -> view: spin (about Y), then tilt (about X)
    const x1 = x * cosT + z * sinT;
    const z1 = -x * sinT + z * cosT;
    const vy = y * cosK - z1 * sinK;
    const vz = y * sinK + z1 * cosK;
    if (vz < 0.08) continue;
    const c = Math.round(CX + x1 * RX);
    const r = Math.round(CY - vy * RY);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
    const hot = highlighted.size === 0 || highlighted.has(m.code);
    const cls = hot ? 'g-mark' : 'g-mark-off';
    grid[r][c] = ['@', cls];
    const label = m.code;
    for (let i = 0; i < label.length; i++) {
      const cc = c + 1 + i;
      if (cc < COLS) grid[r][cc] = [label[i], `${cls} g-label`];
    }
  }

  let html = '';
  for (const row of grid) {
    let run = '';
    let runCls = null;
    const flush = () => {
      if (!run) return;
      html += runCls ? `<span class="${runCls}">${run}</span>` : run;
      run = '';
    };
    for (const [ch, cls] of row) {
      if (cls !== runCls) {
        flush();
        runCls = cls;
      }
      run += ch;
    }
    flush();
    html += '\n';
  }
  return html;
}
