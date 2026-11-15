# 検証記録

## 環境と固定版

- 検証日：2026-11-15（JST）。Windows上のWSL2 Ubuntu 24.04.3 LTS、aarch64。
- Docker Engine 28.4.0、Compose v2.39.2。
- Keycloak `quay.io/keycloak/keycloak:26.8.1`。取得時digest：`sha256:a78d6b79572168cb25886b80a8b5b8d4ed4390743e3eecb810538683e209dd6b`。
- Node.js `node:22.14.0-bookworm-slim`。取得時digest：`sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b`。
- ComposeとDockerfileは版タグ固定。digestは取得時の記録でありComposeによるdigest固定ではない。
- 両イメージのmanifestでlinux/amd64とlinux/arm64を確認。実行検証はarm64のみ。

## 実測結果

| 操作 | 実際に応答したサービス | 観測 |
|---|---|---|
| ログイン・scope同意 | Keycloak | Authorization Code + PKCEからLabへ復帰 |
| Sourceで参照 | Document API | 401 / wrong_audience |
| 参照専用へ委任交換 | Keycloak | 200、sub保持、act追加、aud変更、readのみ |
| 参照専用で参照 | Document API | 200、文書を取得 |
| 参照専用で更新 | Document API | 403 / insufficient_scope、再読でも本文・revision不変 |
| Sourceから参照・更新へ交換 | Keycloak | 200、read/write |
| 更新して参照Tokenで再読 | Document API | 200、入力した本文と増加したrevisionを確認 |
| 参照Tokenからwriteを要求 | Keycloak | 400 / invalid_scope |

上記は自動回帰確認と実ブラウザーの両方で確認。ブラウザーでは「ブラウザーから交換後Tokenで更新しました」がrevision 3として再読できた。[画面証拠](docs/images/browser-result.jpg)。revisionの具体値は、それまでの操作回数で変わる。

画面のHTTP表示は上流サービスの実ステータス。Lab Webの結果転送自体はHTTP 200のJSONに包まれるため、ブラウザーのNetwork欄の`/call`ステータスとは区別する。

回帰確認はさらに、不正callback、CSRF、Labログアウトを確認する。JWTの単体確認は改ざん、期限切れ、issuer不一致、audience不一致を扱う。

## 制約

- 一つのrealm、固定subject/actor、一件の文書、ローカルHTTPによる教材。
- Standard Token Exchangeに委任Preview機能を追加。固定may_act mapperとdownscope policyを設定した構成での観測。
- AMD64での実行、公開運用、負荷・侵入試験、即時失効、refresh、再委任、Cross-tenant、LLMのTool選択は未検証。
- 文書はAPIメモリ内。再起動で初期値に戻る。Keycloakの状態は専用volumeに保存。
- 旧プロトタイプの委任設計とHTTPブラウザーテスト補助を参考にした独立教材。既存プロトタイプの資格情報・データを使用しない。
