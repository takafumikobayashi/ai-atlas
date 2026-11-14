# 掲載候補サービス（未検証リスト）

この一覧は、前段の会話で名前が挙がった**調査候補**です。ここに名前があることは、現在の提供状況、提供企業・地域、機能、価格、日本からの利用可否を確認済みであることを意味しません。公開データへ移す前に公式一次ソースで確認してください。

## 候補

### 世界的に知られる汎用・検索サービス

- ChatGPT
- Claude
- Gemini
- Microsoft Copilot
- Grok
- Meta AI
- Perplexity
- DeepSeek
- Qwen
- Vibe（会話では旧Le Chatとの関係が挙がったが、名称・提供状況を再確認）

### 中国・アジア市場などの候補

- Dola
- Doubao（豆包）
- Kimi
- Z.ai
- Tencent Yuanbao（元宝）
- ERNIE／文心

### 複数モデル、検索、会話など特徴を持つ候補

- Poe
- Duck.ai
- You.com
- Pi
- Character.AI
- NotebookLM
- Genspark

### 日本・その他地域の候補

- Felo AI
- GigaChat
- Alice AI
- PLaMo

## 調査状況（2026-11-14）

候補27件のうち25件を `data/services.json` に登録した。登録済みでも「未確認」の項目が残っているものがある（照合シート `npm run review` で確認できる）。

| 候補 | 状況 | 備考 |
|---|---|---|
| ChatGPT / Claude / Gemini | 登録済み | |
| Microsoft Copilot / Grok / Meta AI / Perplexity / DeepSeek / Qwen | 登録済み | |
| Vibe | 登録済み（Mistral Vibe） | 旧称 Le Chat。名称変更を公式ページで確認 |
| Dola / Doubao / Kimi / Z.ai / Tencent Yuanbao | 登録済み | Doubao は日本から開くと地域制限の案内が表示される |
| ERNIE／文心 | 登録済み（百度文心助手） | yiyan.baidu.com は百度文心助手に転送される |
| Poe / Duck.ai / Pi / Character.AI / Genspark | 登録済み | Character.AI は2026年10月に Chapter 11 を開始、サービスは継続と発表 |
| NotebookLM | 登録済み（Gemini Notebook） | 名称変更を公式ページで確認 |
| Felo AI / GigaChat / Alice AI | 登録済み（Felo / GigaChat / Alice AI） | |
| You.com | **保留** | 公式ページは法人向けAPIが中心で、個人向けの会話型サービスを確認できなかった（プライバシーポリシーに有料プランの名称のみ記載） |
| PLaMo | **保留** | 個人向けは翻訳サービス「PLaMo翻訳」（会話型ではない）と、ログインが必要なチャットのデモのみを確認。一般向けの会話型サービスとしての提供を確認できなかった |

## 候補の採否を決める前に確認すること

1. 現在も一般ユーザー向けに提供されているか。終了・統合・名称変更・ベータ移行がないか。
2. 対話型サービスとして掲載対象に当たるか。単独モデルやAPI、別の専用サービスと混同していないか。
3. 公式のサービスURL、提供元、提供元の拠点国を確認できるか。
4. 日本からの利用可否、アカウント条件、年齢・地域制限を確認できるか。
5. 公開する機能ごとに、地域・プラン・プラットフォームを特定できる根拠があるか。
6. 無料利用や料金を、対象地域・通貨・期間・制限と共に確認できるか。
7. 初期版に載せる編集上の理由（独自性、利用者への有用性、地域バランス等）を説明できるか。

採用の根拠が不足しているサービスは候補リストに残し、公開用データでは保留とする。会話中の説明文、機能一覧、地域ラベルは事実確認の根拠として転用しない。
