// @ts-check
// セーブコードの署名の鍵(D-292・D-293)。
// - リポジトリと手元では、仮の鍵(鍵の番号 dev)。これは秘密ではない(誰が見てもよい)。
// - 公開の処理(scripts/stamp_key.mjs)が、公開用のファイルにだけ、GitHub の Secrets(SAVE_SIGNING_KEY)の
//   本番の鍵(鍵の番号 k1)を書き込む。本番の鍵は、リポジトリのどのファイルにも書かない。
// - 計算本体(src/core/)からは読まない。画面(src/ui/save_sign.js)が読んで、計算本体に渡す。
export const SIGNING_KEY_ID = "dev";
export const SIGNING_KEY_SECRET = "dev-placeholder-key-not-secret";
