# データ設計と検証ルール

## 1. 基本方針

サービス一覧をUIコードに埋め込まず、レビュー可能なJSON等の構造化データとして管理する。初期版では各主張に根拠を紐付け、地域・プラン・プラットフォーム・言語・確認日を失わないことを優先する。

実装済みの形式は次のとおり（決定の経緯は [decisions.md](decisions.md)、更新手順は [data-workflow.md](data-workflow.md) を参照）。

- 公開データ: `data/services.json`（`{ "schemaVersion": 1, "services": [...] }`）
- 語彙と表示名: `data/vocabulary.json`（状態値、機能ID、分類、環境、提供形態、情報源の種類、料金区分など）
- 検証: `scripts/lib/validate-data.mjs`（`npm run validate`）。本書のルールのうち機械的に確かめられるものを実装している。
- 開発用の架空データ: `data/fixtures/sample-services.json`

以下の例は構造の説明であり、特定サービスの機能・料金を示すデータではない。

## 2. ステータス定義

| 値 | 意味 | 使用条件 |
|---|---|---|
| `supported` | 対象範囲で利用可能と確認済み | 適用範囲と根拠を記録する |
| `conditional` | 条件を満たす場合に利用可能 | 条件（プラン、地域、端末、段階公開等）を必須で記録する |
| `unsupported` | 対象範囲で利用できないと確認済み | 未掲載だけを根拠にしない。対象の地域・プラン等を示す |
| `unknown` | 未確認、情報が不足、または根拠が不明瞭 | 公開データでも使用可。非対応と混同させない |

状態は絶対的なサービス属性ではなく、特定の条件で確認したスナップショットとして扱う。例えば国・地域やプランが違えば状態も異なる。

## 3. エンティティ

### Service

```json
{
  "id": "example-assistant",
  "name": "Example Assistant",
  "aliases": [],
  "provider": {
    "name": "Example Provider",
    "originCountryCode": null,
    "evidenceIds": [],
    "checkedAt": null
  },
  "officialUrl": "https://example.invalid/",
  "description": {
    "ja": "スキーマ説明用の例。実在サービスの情報ではありません。"
  },
  "inclusionReason": null,
  "categories": ["general_assistant"],
  "platforms": { "values": [], "evidenceIds": [], "checkedAt": null },
  "languages": {
    "interface": { "values": [], "evidenceIds": [], "checkedAt": null },
    "conversation": { "values": [], "evidenceIds": [], "checkedAt": null }
  },
  "availability": [
    {
      "regionCode": "JP",
      "status": "unknown",
      "conditions": null,
      "evidenceIds": [],
      "checkedAt": null
    }
  ],
  "capabilities": [
    {
      "id": "image_generation",
      "status": "unknown",
      "delivery": "unknown",
      "scope": {
        "regions": [],
        "plans": [],
        "platforms": [],
        "languages": []
      },
      "conditions": null,
      "evidenceIds": [],
      "checkedAt": null
    }
  ],
  "pricing": {
    "offers": [],
    "checkedAt": null,
    "evidenceIds": []
  },
  "strengthClaims": [],
  "evidence": [],
  "lifecycle": {
    "status": "unknown",
    "checkedAt": null,
    "evidenceIds": []
  }
}
```

`example.invalid` と `unknown` だけのレコードは構造例に限る。公開サービスの実データとして登録しない（検証スクリプトは公開データの例示用ドメインをエラーにする）。

### 主なフィールド

- `id`: 安定した小文字slug。名称変更があっても可能な限り維持する。
- `name`, `aliases`: 現行名と旧名・別表記。別サービスやモデル名はエイリアスに混ぜない。
- `provider.originCountryCode`: 提供元の拠点を表す場合の国コード（ISO 3166-1 alpha-2）。サービスの提供地域を意味しない。値を入れる場合は `provider.evidenceIds` と `provider.checkedAt` が必須。
- `officialUrl`: ユーザー向けサービスの公式URL（https）。
- `officialPreview`（任意）: 公式ページの OGP 画像。`{ imageUrl, sourceUrl, alt, checkedAt }`。`sourceUrl` は `og:image` を読み取ったページで、公式のユーザー向けページに限る。画像はコピーせず、提供元のサーバーから直接表示する。外部サイトからの表示を禁止している画像（`Cross-Origin-Resource-Policy: same-origin`）は使えない。
- `description.ja`: 中立的な短い紹介文。宣伝文句を転記しない。
- `inclusionReason.ja`: 初期版に載せる編集上の理由（任意）。
- `categories`: 汎用、検索、複数モデル、キャラクター対話等のサービス分類（`vocabulary.json` の `categories`）。
- `platforms`: `{ values, evidenceIds, checkedAt }`。`values` は Web、iOS、Android、Windows、macOS、Linux のID。空配列は未確認を意味する。値を入れる場合は根拠と確認日が必須。
- `languages.interface` / `languages.conversation`: UI言語と対話言語を別に記録する。形式は `platforms` と同じで、`values` は言語コード（`ja`, `en`, `zh-Hans` 等）。空配列は未確認。
- `availability`: 対象地域におけるサービス利用可否。国コード、状態、条件、根拠、確認日を保持する。同じ国の重複は不可。記載のない国・地域は未確認として表示する。
- `capabilities`: 機能ごとの状態。スコープ・条件・根拠・確認日を含める。プランや地域で状態が異なる場合は、同じ機能IDのエントリーを複数持てる。
- `pricing`: 価格情報をプランと地域に結び付ける。
- `strengthClaims`: 「得意」等の主張を、単なる対応機能から分けて管理する。
- `lifecycle`: `active`（提供中）、`beta`、`discontinued`（提供終了）、`unknown`。`unknown` 以外は根拠が必須。`discontinued` は一覧に表示しない。

`conditions`、`limits`、`claim`、`scope`（得意分野）、`basis` などの説明文は、将来の多言語化に備えて `{ "ja": "..." }` の形にする。

## 4. Capabilityのdelivery

機能がどこで提供されるかを `delivery` で区別する。

- `in_product`: 対象サービスの体験内で利用できる。
- `separate_product`: 同じ提供元でも別の製品・アプリを開く必要がある。
- `integration`: 外部サービスや別機能との連携が必要。
- `api_only`: APIでのみ確認され、一般ユーザー向けチャットには確認できない。
- `unknown`: 提供形態が未確認。

`in_product` と判断する場合も、同じチャット画面内か、サービス内の別ツール画面かなど重要な違いは `conditions` に説明する。

## 5. Evidence（根拠）

各根拠には次を持たせる。

```json
{
  "id": "provider-help-image-tools",
  "url": "https://example.invalid/help",
  "title": "公式ヘルプページ（例）",
  "sourceType": "official_help",
  "checkedAt": null,
  "publishedAt": null,
  "locale": "en",
  "note": "何の事実を裏付けるページかを短く記録"
}
```

`sourceType` は `official_product_page`, `official_help`, `official_pricing`, `official_availability`, `official_release_note`, `official_app_listing`, `other_primary` 等を使う。公式ページが直接示していない比較・評価は、第三者情報や編集者判断を一次情報と混同しない。

日付は `YYYY-MM-DD` のISO形式。`checkedAt` は確認日で、公開日や機能提供開始日とは別物。確認できない日付を推測で埋めない。

## 6. 料金

料金は単純な真偽値 `freePlan` にせず、プラン・地域・通貨・課金期間を含む `offers` として管理する。

```json
{
  "planName": "Example Free",
  "access": "free",
  "amount": null,
  "currency": null,
  "billingPeriod": null,
  "regionCode": "JP",
  "taxTreatment": "unknown",
  "limits": null,
  "isPromotional": false,
  "evidenceIds": [],
  "checkedAt": null
}
```

`access` は `free`, `paid`, `trial`, `freemium`, `unknown` 等。金額は公式価格が対象地域・通貨・課金期間と共に確認できた場合のみ入力する。税（`taxTreatment`: `included` / `excluded` / `unknown`）、利用上限（`limits.ja`）、キャンペーン、為替換算は明示して記録し、恒久価格と一時的な割引を区別する（期間限定価格は `isPromotional: true`）。`billingPeriod` は `month` / `year` / `one_time` / `usage`。`access` が `unknown` 以外のプランには根拠と確認日が必須。

## 7. 得意分野

機能の対応状況と主観的な「強さ」は別データにする。`strengthClaims` には、主張、根拠、適用範囲、主張の種類（`provider_claim` または `editorial_observation`）を持たせる。`provider_claim` は根拠が必須、`editorial_observation` は判断根拠 `basis.ja` が必須。提供元の宣伝文句を客観評価として書き換えない。比較テストを行う場合は、テスト方法・実施日・対象プラン等を別途文書化する。

## 8. 更新と古い情報の扱い

- 変わりうる主張は、主張ごとに確認日を保持する。
- 料金、地域、プラン、利用可能機能、サービス継続状況は、公開前に公式情報で再確認する。
- 確認日が古い主張は現況として断定しない。表示上は確認日と「要再確認」を出すか、`unknown` に戻す。
- サービス終了・名称変更を確認した時は、履歴を残し、現役一覧から適切に除外する。削除して履歴を消さない。
- 運用開始時に再確認サイクルを決める。初期案は少なくとも四半期ごとに棚卸しし、料金・提供条件は公開直前にも再確認する。

## 9. 公開データ品質チェック

- ID重複、無効な状態値、存在しない機能IDがない。
- `supported` / `conditional` / `unsupported` の各主張に根拠と確認日がある。
- `conditional` には具体的な条件がある。
- `unsupported` は検索されなかったことだけを根拠としていない。
- 価格には対象地域・通貨・課金期間か、それらが不明であることが表現されている。
- 企業拠点とサービス利用可能地域を混同していない。
- 外部URLは公式のユーザー向けページである。
