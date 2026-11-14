#!/usr/bin/env node
// Builds a standalone review sheet (reports/review.html) from data/services.json.
// Every claim is listed with its recorded value, status, sources and checked date, plus a
// checkbox so a reviewer can tick off what they have verified against the source page.
// The data is embedded, so the file opens directly from disk (no server needed).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const catalog = await read('data/services.json');
const vocab = await read('data/vocabulary.json');
const label = (group, id) => vocab[group]?.find((x) => x.id === id)?.label ?? id;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STATUS = Object.fromEntries(vocab.statuses.map((s) => [s.id, `${s.symbol} ${s.label}`]));

function rowsFor(service) {
  const rows = [];
  const add = (item, value, status, claim) =>
    rows.push({ item, value, status, evidenceIds: claim?.evidenceIds ?? [], checkedAt: claim?.checkedAt ?? null });
  const list = (claim, fmt = (v) => v) => (claim?.values?.length ? claim.values.map(fmt).join('、') : '（未確認）');

  add('提供元', `${service.provider.name}／拠点: ${service.provider.originCountryCode ?? '未確認'}`, null, service.provider);
  add('公式URL', service.officialUrl, null, null);
  if (service.officialPreview) add('OGP画像', `${service.officialPreview.imageUrl}（取得元 ${service.officialPreview.sourceUrl}）`, null, { evidenceIds: [], checkedAt: service.officialPreview.checkedAt });
  add('提供状況', label('lifecycleStatuses', service.lifecycle.status), null, service.lifecycle);
  add('利用環境', list(service.platforms, (p) => label('platforms', p)), null, service.platforms);
  add('画面の言語', list(service.languages.interface), null, service.languages.interface);
  add('会話の言語', list(service.languages.conversation), null, service.languages.conversation);
  for (const a of service.availability) {
    add(`提供地域: ${a.regionCode}`, a.conditions?.ja ?? '', a.status, a);
  }
  for (const cap of vocab.capabilities) {
    const entries = service.capabilities.filter((c) => c.id === cap.id);
    if (!entries.length) add(`機能: ${cap.label}`, '（データ未登録）', 'unknown', null);
    for (const c of entries) {
      const scope = Object.entries(c.scope)
        .filter(([, v]) => v.length)
        .map(([k, v]) => `${k}: ${v.join(', ')}`)
        .join(' / ');
      add(`機能: ${cap.label}`, [label('deliveries', c.delivery), scope, c.conditions?.ja].filter(Boolean).join(' ／ '), c.status, c);
    }
  }
  for (const o of service.pricing.offers) {
    const price = o.amount == null ? '' : `${o.amount} ${o.currency} / ${label('billingPeriods', o.billingPeriod)}`;
    add(
      `料金: ${o.planName}`,
      [label('pricingAccess', o.access), price, o.regionCode ? `地域 ${o.regionCode}` : '', `税: ${label('taxTreatments', o.taxTreatment)}`, o.limits?.ja].filter(Boolean).join(' ／ '),
      null,
      o,
    );
  }
  for (const s of service.strengthClaims) add(`特徴（${label('strengthClaimTypes', s.claimType)}）`, s.claim.ja, null, s);
  return rows;
}

const sections = catalog.services
  .map((service) => {
    const evidence = new Map(service.evidence.map((ev, i) => [ev.id, { ...ev, n: i + 1 }]));
    const rows = rowsFor(service);
    const tr = rows
      .map((r, i) => {
        const key = `${service.id}:${i}:${r.item}`;
        const refs = r.evidenceIds
          .map((id) => {
            const ev = evidence.get(id);
            return ev ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener noreferrer" title="${esc(ev.title)}">[${ev.n}]</a>` : `<span class="bad">[${esc(id)}?]</span>`;
          })
          .join(' ');
        const st = r.status ? `<span class="st st-${r.status}">${esc(STATUS[r.status])}</span>` : '';
        return `<tr data-status="${r.status ?? ''}">
  <td class="ck"><input type="checkbox" data-key="${esc(key)}" aria-label="${esc(service.name)} ${esc(r.item)} を確認済み"></td>
  <th scope="row">${esc(r.item)}</th>
  <td>${st}</td>
  <td>${esc(r.value)}</td>
  <td class="refs">${refs || '<span class="dim">なし</span>'}</td>
  <td class="date">${esc(r.checkedAt ?? '')}</td>
</tr>`;
      })
      .join('\n');
    const evList = [...evidence.values()]
      .map(
        (ev) =>
          `<li><span class="dim">[${ev.n}]</span> <a href="${esc(ev.url)}" target="_blank" rel="noopener noreferrer">${esc(ev.title)}</a><br><span class="dim">${esc(label('sourceTypes', ev.sourceType))} / 確認日 ${esc(ev.checkedAt)} / ${esc(ev.url)}</span><br>${esc(ev.note)}</li>`,
      )
      .join('\n');
    return `<section id="${esc(service.id)}">
<h2># ${esc(service.name)} <span class="dim">(${esc(service.id)})</span> <span class="progress" data-progress="${esc(service.id)}"></span></h2>
<p>${esc(service.description.ja)}</p>
<div class="wrap"><table>
<thead><tr><th>確認</th><th>項目</th><th>状態</th><th>記録した内容</th><th>根拠</th><th>確認日</th></tr></thead>
<tbody>
${tr}
</tbody></table></div>
<h3>## 根拠となる情報源</h3>
<ol class="ev">${evList}</ol>
</section>`;
  })
  .join('\n');

const generated = new Date().toISOString().slice(0, 10);
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Atlas 照合シート</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&display=swap">
<style>
:root{--bg:#0c0c0c;--text:#d2d2d2;--bright:#f4f4f4;--muted:#8a8a8a;--line:#333;--green:#4dff7c;--amber:#ffb547;--red:#ff7a6e;--link:#79a8ff}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px 64px;background:var(--bg);color:var(--text);font:15px/1.7 "BIZ UDGothic",ui-monospace,monospace}
@media(min-width:720px){body{padding:32px 36px 80px}}
a{color:var(--link)}
h1,h2,h3{font-size:inherit;font-weight:400;color:var(--bright)}
h1{margin:0 0 4px}
h2{margin:48px 0 8px;padding-top:16px;border-top:1px dashed #4f7fd9}
h3{margin:24px 0 8px}
.dim{color:var(--muted)}
.bar{display:flex;flex-wrap:wrap;gap:8px 24px;margin:16px 0;color:var(--muted)}
.bar label{cursor:pointer}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:760px}
th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--line)}
thead th{color:var(--muted);font-size:13px}
tbody th{white-space:nowrap;color:var(--bright);font-weight:400}
td.ck{width:2.5em}
td.refs,td.date{white-space:nowrap}
tr.done{opacity:.45}
input[type=checkbox]{accent-color:var(--green);width:16px;height:16px}
.st{white-space:nowrap}
.st-supported{color:var(--green)}.st-conditional{color:var(--amber)}.st-unsupported{color:var(--red)}.st-unknown{color:var(--muted)}
.bad{color:var(--red)}
.progress{color:var(--green);font-size:13px;margin-left:8px}
.ev{padding-left:0;list-style:none}.ev li{margin-bottom:10px}
.hide-unknown tr[data-status=unknown]{display:none}
.hide-done tr.done{display:none}
</style>
</head>
<body>
<h1>AI Atlas 照合シート</h1>
<p class="dim">data/services.json から ${esc(generated)} に生成 / ${catalog.services.length}件 / 根拠のリンクを開き、記録した内容と一致していればチェックしてください。チェックはこのブラウザにだけ保存されます。</p>
<nav class="bar">${catalog.services.map((s) => `<a href="#${esc(s.id)}">${esc(s.name)}</a>`).join('')}</nav>
<div class="bar">
<label><input type="checkbox" id="hide-unknown"> 未確認（データ未登録）の行を隠す</label>
<label><input type="checkbox" id="hide-done"> 確認済みの行を隠す</label>
<button type="button" id="reset" style="font:inherit;background:none;border:1px solid var(--line);color:var(--text);padding:0 8px;cursor:pointer">チェックをすべて外す</button>
</div>
${sections}
<script>
const KEY='ai-atlas-review';
let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}
const boxes=[...document.querySelectorAll('tbody input[type=checkbox]')];
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}};
const progress=()=>document.querySelectorAll('[data-progress]').forEach(el=>{const id=el.dataset.progress;const b=boxes.filter(x=>x.dataset.key.startsWith(id+':'));el.textContent='['+b.filter(x=>x.checked).length+'/'+b.length+' 確認済み]'});
boxes.forEach(b=>{b.checked=!!saved[b.dataset.key];b.closest('tr').classList.toggle('done',b.checked);b.addEventListener('change',()=>{saved[b.dataset.key]=b.checked;b.closest('tr').classList.toggle('done',b.checked);save();progress()})});
progress();
document.getElementById('hide-unknown').addEventListener('change',e=>document.body.classList.toggle('hide-unknown',e.target.checked));
document.getElementById('hide-done').addEventListener('change',e=>document.body.classList.toggle('hide-done',e.target.checked));
document.getElementById('reset').addEventListener('click',()=>{saved={};save();boxes.forEach(b=>{b.checked=false;b.closest('tr').classList.remove('done')});progress()});
</script>
</body>
</html>
`;

await mkdir(new URL('reports/', root), { recursive: true });
const out = new URL('reports/review.html', root);
await writeFile(out, html);
console.log(`照合シートを作成しました: ${fileURLToPath(out)}`);
