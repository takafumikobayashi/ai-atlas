# AI Atlas

世界の対話型AIサービスを、できることや利用条件から探せる図鑑サイトのプロジェクトです。

**コンセプト:** 世界のAIを、見つける・知る・比べる。

初期版は、一般ユーザーがWebまたはアプリで会話形式に利用できるサービスを対象にします。機能の有無だけでなく、無料利用、日本語、提供地域、プラン、利用環境を、確認日と根拠付きで整理します。順位付けや性能ランキングではなく、目的に合うサービスを見つけるための中立的な案内を目指します。

## 使い方

Node.js 20 以上が必要です。依存パッケージはないため、`npm install` は不要です。

```sh
npm run dev        # 開発サーバー http://localhost:4173/（?sample で架空のサンプルデータを表示）
npm run validate   # 掲載データの検証（構造・語彙・根拠・確認日）
npm test           # 絞り込みロジックと検証ルールのテスト
npm run build      # 検証後、公開用の静的ファイルを dist/ に出力
npm run preview    # dist/ をローカルで確認
```

## 構成

| パス | 内容 |
|---|---|
| `data/services.json` | 公開用の掲載データ（検証済みのレコードのみ） |
| `data/vocabulary.json` | 状態値・機能・分類などの語彙と表示名 |
| `data/fixtures/` | 開発・テスト専用の架空データ（公開ビルドには含めない） |
| `site/` | 画面（HTML / CSS / JavaScript） |
| `scripts/` | 検証・ビルド・開発サーバー |
| `test/` | テスト |

## ドキュメント

- [Claude Code向け作業ガイド](CLAUDE.md)
- [企画・要件](docs/requirements.md)
- [データ設計・検証ルール](docs/data-schema.md)
- [データ更新手順](docs/data-workflow.md)
- [決定事項・保留事項](docs/decisions.md)
- [候補サービス（未検証）](docs/service-candidates.md)
- [実装フェーズ・検証計画](docs/implementation-plan.md)

## 現在のデータについて

会話中に挙がったサービス名は調査候補です。機能、料金、提供地域、サービス継続状況は、公式一次情報で検証するまで公開用データとして扱いません。`supported`、`conditional`、`unsupported`、`unknown` は状態を区別するための設計値であり、具体的なサービスの機能を示すものではありません。

2026年11月版という日付は当初の企画上の対象時点です。公開時点の現状を示すものとして使う場合は、公開直前に各情報を再確認してください。
