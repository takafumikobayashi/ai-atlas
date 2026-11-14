# 公開手順（Cloudflare Pages）

公開先は `https://ai-atlas.tariki-code.tokyo/` です。サイトは静的ファイルだけなので、`dist/` の中身を Cloudflare Pages に置けば動きます。

Cloudflare の画面の名称や配置は変わることがあります。見当たらない場合は、Cloudflare の公式ドキュメントで「Pages」「Custom domains」を確認してください。

## 公開前のチェック

```sh
npm test                       # テスト
npm run validate -- --strict   # 公開データの検証（確認から90日超の情報があれば失敗）
npm run review                 # 照合シートを作り、根拠と記録が一致しているか確認（docs/data-workflow.md）
npm run og                     # データの提供元の国が変わったら OGP 画像を作り直す
npm run build                  # 本番用ビルド（og:image などが絶対 URL でなければエラーで止まる）
npm run preview                # dist/ を手元で確認（Cloudflare と同じヘッダーを付けて配信）
```

## 方法A：GitHub と連携して自動で公開する（おすすめ）

リポジトリを GitHub に置き、ブランチへの push のたびに Cloudflare がビルドして公開します。

1. リポジトリを GitHub に push する（非公開リポジトリでも可）。
2. Cloudflare のダッシュボードで「Workers & Pages」→ 作成 →「Pages」→「Git に接続」を選び、このリポジトリを選ぶ。
3. ビルドの設定：

   | 項目 | 値 |
   |---|---|
   | 本番ブランチ | `main`（`develop` を確認用にする場合は、プレビューとして公開される） |
   | フレームワーク | なし |
   | ビルドコマンド | `npm run build` |
   | 出力ディレクトリ | `dist` |
   | 環境変数 | 不要（`ai-atlas.tariki-code.tokyo` 以外で公開する場合だけ `SITE_URL` を設定） |

   Node.js のバージョンは、リポジトリの `.node-version`（22）が使われます。依存パッケージはないので、インストールの手順は不要です。
4. 保存すると最初のビルドが走り、`<プロジェクト名>.pages.dev` で公開される。表示を確認する。

## 方法B：手元からアップロードする（Wrangler）

GitHub を使わずに、手元でビルドした `dist/` を直接アップロードします。

```sh
npm run build
npx wrangler login                                        # ブラウザで Cloudflare にログイン（初回のみ）
npx wrangler pages deploy dist --project-name ai-atlas    # 初回はプロジェクトが作成される
```

`npx wrangler` は、実行時に Cloudflare の公式 CLI を一時的にダウンロードします。

## 独自ドメインの設定

`tariki-code.tokyo` の DNS は **Netlify** で管理しているため、Netlify に CNAME レコードを追加する。CNAME の向け先は Cloudflare 側でプロジェクトを作ると決まるので、次の順で進める。

1. Cloudflare Pages でプロジェクトを作って一度公開し、`<プロジェクト名>.pages.dev` で表示を確認する。
2. Pages のプロジェクトの「カスタムドメイン」で `ai-atlas.tariki-code.tokyo` を追加する。CNAME の向け先が表示される。
3. Netlify の「Domains」→ `tariki-code.tokyo` → DNS の設定 →「Add new record」で、次のレコードを追加する。

   | 項目 | 値 |
   |---|---|
   | Record type | `CNAME` |
   | Name | `ai-atlas` |
   | Value | `<プロジェクト名>.pages.dev`（手順2で表示された値） |
   | TTL | 既定のまま |

   追加する前に、`ai-atlas` という名前の既存レコードがないこと、Netlify のサイトのドメイン設定（Domain aliases など）に `ai-atlas.tariki-code.tokyo` が登録されていないことを確認する。登録されていると Netlify 側が応答してしまう。
4. Cloudflare 側でドメインの確認と証明書の発行が終わるのを待ち（通常は数分〜1時間程度）、`https://ai-atlas.tariki-code.tokyo/` で表示を確認する。

## 公開後の確認

- トップ・一覧・詳細画面が表示される。スマートフォンでも確認する。
- ブラウザの開発者ツールで、コンテンツセキュリティポリシー（CSP）の違反が出ていない。
- SNS で OGP 画像が大きく表示される（画像の URL は `https://ai-atlas.tariki-code.tokyo/og-image.png`）。X などはリンクの情報をしばらく保存するため、修正直後は古い表示のことがある。`https://ai-atlas.tariki-code.tokyo/?v=2` のように末尾を変えた URL で確かめる。
- `https://ai-atlas.tariki-code.tokyo/robots.txt` と `/sitemap.xml` が開ける。

## 関連ファイル

| ファイル | 内容 |
|---|---|
| `site/_headers` | Cloudflare Pages のレスポンスヘッダー（CSP など）。`npm run dev` / `preview` でも同じものが付く |
| `site/robots.txt`、`site/sitemap.xml` | 検索エンジン向け |
| `.node-version` | ビルドに使う Node.js のバージョン |
| `scripts/build.mjs` | og:image・og:url・twitter:image が絶対 URL かを確かめる。`SITE_URL` があると公開先の URL を置き換える |
