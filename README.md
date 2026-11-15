# Token Exchangeを、トークンとAPIの応答で理解する

ユーザーのトークンを、そのまま別のAPIへ渡せるでしょうか。交換すると、ユーザー・宛先・権限・代理主体はどう変わるでしょうか。

この教材はブラウザーで一つずつ操作し、**予想 → Tokenの比較 → APIの実応答 → 文書の再読**まで確認するハンズオンです。一括テストのPASSを見るだけで終わりません。ChatGPTアカウント、APIキー、Pythonのインストールは不要です。

解説記事：[背景・Painから読む](docs/article.md)。検証状況：[VALIDATION.md](VALIDATION.md)。

## 用意するもの

- Docker EngineとDocker Compose v2、Git、curlが使えるLinuxまたはWSL。
- ホストのブラウザー。URLは`localhost`を使用（127.0.0.1と混在させない）。
- 空きポート19360・19361・19362。初回はコンテナイメージを取得するネットワーク接続。
- 動作確認環境とdigestはVALIDATION.md。ローカル実験用のHTTP / Keycloak start-dev構成です。

## 起動

WSLのターミナルで実行します。

```sh
git clone --branch v0.1.0 https://github.com/takuma-8trees/token-exchange-handson.git
cd token-exchange-handson
sh run/start.sh
cat .secrets/login.json
```

最後のコマンドで、この環境だけのデモユーザー`alice`とランダムなパスワードを確認します。チャットや記事に貼る必要はありません。起動処理は資格情報とrealmを初回だけ生成し、3サービスの準備を待ちます。

ブラウザーで **http://localhost:19360/** を開いてください。`.secrets/`を削除したり、setupをやり直す必要はありません。

## 実験1：ログイン済みでも、そのTokenでは読めない

1. 「Keycloakでログイン／やり直す」を押す。
2. `alice`と生成したパスワードでログイン。
3. Keycloakの同意画面で`document.read`と`document.write`を確認して同意。
4. 戻った画面の「交換前 / Source」を読む。
5. Step 03の「使うToken」を「交換前 / Source」にし、「文書を読む」を押す。

**観察**：ログインは成功しているのに、文書APIは401を返します。結果の`reason`は`wrong_audience`です。

ここでSourceの`aud`を確認してください。これは`lab-agent`向けであり、`document-api`向けではありません。ユーザー本人のTokenであることだけでは、別のAPIへ持っていけません。

## 実験2：参照だけに絞って交換する

Step 02の「① 参照だけに絞って交換」を押します。SourceとRead onlyを比較してください。

| 観察点 | 交換前 | 交換後 |
|---|---|---|
| sub | lab-user-id | lab-user-idを保持 |
| aud | lab-agent | document-api |
| scope | document.read / document.writeを含む | document.readのみ |
| may_act | lab-agentを許容する管理者設定 | 出力のactと役割が違う |
| act | なし | lab-agent-idがユーザーの代理で動く |

表示は単なるbase64デコードではなく、Webサーバーが署名・issuer・audience・期限を検証したクレームの抜粋です。ただし秘密を持つWeb自体を信頼する教材構成です。

Step 04には、実際にKeycloakへ送った要求の秘密値を除いた要約と、KeycloakのHTTPステータスが出ます。

```text
grant_type         urn:ietf:params:oauth:grant-type:token-exchange
subject_token      Source token（値は非表示）
actor_token        Agentのservice account token（値は非表示）
audience           document-api
scope              document.read
```

交換APIを呼ぶクライアントは`lab-agent`です。client secretで認証し、subject tokenとactor tokenを提示します。生Tokenとsecretはブラウザーへ渡しません。要求の組み立ては[src/web.mjs](src/web.mjs)の`/exchange`で確認できます。

## 実験3：読めるが、書けないことを確認する

1. Step 03で「交換後 / Read only」を選び、「文書を読む」を押す。**200**と本文・revisionが表示されます。
2. 本文欄に自分の言葉を入力し、「この本文で更新する」を押す。**403 / insufficient_scope**になります。
3. もう一度「文書を読む」を押す。本文とrevisionが変わっていないことを確認します。

ここで拒否したのはKeycloakではなく文書APIです。Tokenを発行する判断と、各リクエストを実行する判断を分けて観察してください。

## 実験4：元の許可範囲なら書ける

1. 「② 元の許可範囲で交換」を押す。
2. Read + Writeのscopeに`document.write`が含まれることを確認する。
3. 「使うToken」を「交換後 / Read + Write」にし、入力した本文で更新する。**200**になり、revisionが1増えます。
4. 「交換後 / Read only」に戻して文書を読む。**自分が入力した本文**が返ることを確認します。

これは、参照専用Tokenを昇格させたわけではありません。参照・更新が承認された元のSourceから、別のTokenを新たに発行しています。参照専用Tokenも引き続き参照に使えます。交換は元Tokenを消費・無効化する操作ではありません。

## 実験5：参照Token自体に更新権限を足せるか

「③ 参照Tokenから更新権限を要求」を押します。

今度は交換元をSourceではなく、①で得た参照専用Tokenに変えます。同じ`lab-agent`クライアントが通常のToken Exchangeとして更新scopeも要求します（actor tokenはこの再交換では付けません）。

**期待する観察**：Keycloakの交換要求が400 / invalid_scopeで拒否されます。APIを呼ぶ前の段階で止まっています。これは設定した`downscope-assertion-grant-enforcer`による制約です。Token Exchangeというプロトコルだけで自動的に権限縮小が保証されるわけではありません。

## 体験後の確認問題

- ログインできているのに実験1が失敗した理由を、クレーム一つで説明できますか？
- 実験3と実験5では、それぞれ誰が拒否しましたか？
- 実験4が成功しても、参照専用Tokenのscopeが変わらないのはなぜでしょうか？
- `sub`と`act.sub`は何を区別していますか？

答え：宛先aud / 文書APIとKeycloak / 元のSourceから別Tokenを発行したため / 代理元ユーザーと代理で動く主体。

## 構成と責務

```text
Browser ── Authorization Code + PKCE / 同意 ── Keycloak
   │                                              ↑
   └── Lab Web ── subject + actor / Exchange ──────┘
          └── 選択したBearer Token ── Document API
```

| サービス | 用途 | 公開・保存 |
|---|---|---|
| keycloak | 認証・同意・トークン発行・交換 | localhost:19361。realmは専用volume |
| web | 手順UI、OIDCクライアント、交換要求、Tokenの比較 | localhost:19360。セッションとTokenはメモリ |
| api | JWTと代理主体・scopeを検査し、文書を読む／更新する | localhost:19362。文書1件はメモリ |

Keycloak 26.8.1とNode.js 22.14.0を使用。追加npmライブラリなし。独立Composeネットワーク。LLM・MCP・OPA・RAR・Cross-tenantはこの教材に含めません。API側の短い判定コードを読めるようにしています。

ファイル：`run/setup.mjs`は環境生成、`src/common.mjs`はJWT検証、`src/web.mjs`は認証と交換、`src/api.mjs`は資源サーバー、`public/`は操作UI、`test/`は実通信での回帰確認です。

## 前提と限界

- Standard Token Exchangeに加え、Keycloakの**委任Preview機能**を使います。actorを伴わない交換一般と区別してください。
- 固定`may_act` mapperで唯一のAgentを管理者が許可する最小構成です。動的な委任先選択、FGAPの一般的設計を実証しません。
- Tokenは最大5分。期限切れ時はログインからやり直します。refresh・即時失効・再委任チェーンは実装しません。
- 「Labセッションを終了」はWebメモリからTokenを破棄します。KeycloakのSSOセッションや発行JWTそのものの即時失効ではありません。
- Web侵害への耐性、Tokenの所持者証明、LLMの判断の正しさは保証しません。
- APIの対象はaliceのデモ文書1件のみ。書き込み成功には、署名等の検証、所定のsubject/actor、write scopeの全てが必要です。
- 一般公開用Webサービスではありません。秘密値は`.secrets/`に生成され、Gitから除外されます。

## 自動確認・停止

読者の本編は画面操作です。以下は実装変更後の回帰確認用です。

```sh
sh run/verify.sh
docker compose down
```

verifyは本文を一時的に変更して再読し、終了時に元の本文へ戻します（revisionは進みます）。他の人が操作中には実行しないでください。通常停止でも文書とLabセッションは消えますが、Keycloakの専用volumeと資格情報ファイルは保持されます。初期化のためのvolume削除は通常手順に含めません。

接続できない場合は`docker compose ps`と`docker compose logs --tail 30 web keycloak api`を確認してください。19360番で別の画面が出る場合は、Windows側も含むポート競合です。URLはrealmのredirect URIとissuerにも使うため、Composeのportだけを変えてはいけません。

## 仕様・ライセンス

- [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html)：交換プロトコル、delegation、act。
- [Keycloak Token Exchange](https://www.keycloak.org/securing-apps/token-exchange)：対象版の機能と制約は実験結果と併読してください。
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：利用OSSと参照先。
