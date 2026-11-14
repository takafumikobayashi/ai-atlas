#!/usr/bin/env node
// Renders site/og-card.html to site/og-image.png (1200x630) with headless Chrome.
// Run again whenever the card or the catalogue changes: npm run og
// Chrome location can be overridden with CHROME_PATH.
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const out = fileURLToPath(new URL('../site/og-image.png', import.meta.url));
const PORT = 4199;

const chrome = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && existsSync(p));
if (!chrome) {
  console.error('Chrome が見つかりません。CHROME_PATH で実行ファイルの場所を指定してください。');
  process.exit(1);
}

// Serve site/ and data/ the same way as the dev server.
const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', String(PORT)], { cwd: root, stdio: 'ignore' });
try {
  await waitFor(`http://localhost:${PORT}/og-card.html`);
  // Render once and check the card finished (globe drawn) before overwriting the image.
  // A CSP or script error would otherwise still "succeed" with an incomplete card.
  const { stdout: dom } = await run(
    chrome,
    ['--headless=new', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom', `http://localhost:${PORT}/og-card.html`],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  if (!/<body[^>]*data-ready="1"/.test(dom) || !dom.includes('g-mark')) {
    throw new Error('OGP カードの描画が完了しませんでした（地球儀が描かれていません）。site/og-image.png は更新していません。CSP やスクリプトのエラーを確認してください。');
  }
  await run(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1200,630',
    '--virtual-time-budget=8000', // let web fonts and the globe finish
    `--screenshot=${out}`,
    `http://localhost:${PORT}/og-card.html`,
  ]);
  const { size } = await stat(out);
  console.log(`OGP 画像を作成しました: site/og-image.png（${Math.round(size / 1024)} KB）`);
} finally {
  server.kill();
}

async function waitFor(url) {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`サーバーに接続できません: ${url}`);
}
