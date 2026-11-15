# 利用ソフトウェア

このリポジトリは公式コンテナを取得し、教材のソースをローカルでビルドします。コンテナバイナリは本リポジトリでは再配布していません。

| 対象 | 固定版 | ライセンス確認先 |
|---|---|---|
| Keycloak | 26.8.1 | [Apache License 2.0](https://github.com/keycloak/keycloak/blob/26.8.1/LICENSE.txt) |
| Node.js | 22.14.0 | [MITおよび同梱依存物の個別条件](https://github.com/nodejs/node/blob/v22.14.0/LICENSE) |
| Debianコンテナ内のパッケージ | bookworm-slimベース | 各イメージ内の `/usr/share/doc/*/copyright` |

Node.jsのライセンスをベースイメージ全体のライセンスとみなすものではありません。追加npmパッケージは使用していません。イメージの配布・改変時は各配布物のライセンスとNOTICEを別途確認してください。
