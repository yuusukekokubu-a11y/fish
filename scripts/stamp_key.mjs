// 公開用の src/save_key.js に、本番の署名の鍵を書き込む(D-292・D-293)。
// 使い方:SAVE_SIGNING_KEY=… node scripts/stamp_key.mjs <公開用の save_key.js の場所>
// - 鍵は、環境変数 SAVE_SIGNING_KEY(GitHub の Secrets)から読む。鍵の値は画面(記録)に出さない。
// - 鍵がない・短い・仮の鍵と同じ・リポジトリのファイルに入っている、のどれかなら、書き込まずに失敗する(公開を止める)。
// - リポジトリのファイルは書き換えない(公開用に集めたファイルだけに使う)。

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 本番の鍵の番号(鍵を替えるときは k2 にする:DESIGN の「セーブコードの署名」)。 */
export const PRODUCTION_KEY_ID = "k1";
/** 鍵の最低の長さ(文字)。 */
export const MIN_KEY_LENGTH = 16;

const ID_LINE = /^export const SIGNING_KEY_ID = "[^"]*";$/m;
const SECRET_LINE = /^export const SIGNING_KEY_SECRET = "[^"]*";$/m;
const PLACEHOLDERS = ["dev-placeholder-key-not-secret", "debug-placeholder-key-not-secret"];

/** 鍵を確かめる。問題があれば、はっきりした文の Error を投げる(鍵の値は文に入れない)。 @param {string | undefined} secret */
export function checkKey(secret) {
  if (typeof secret !== "string" || secret.trim() === "") {
    throw new Error("SAVE_SIGNING_KEY が設定されていません。GitHub の Settings → Secrets and variables → Actions に登録してください。");
  }
  if (secret.length < MIN_KEY_LENGTH) throw new Error(`SAVE_SIGNING_KEY が短すぎます(${MIN_KEY_LENGTH} 文字以上にしてください)。`);
  if (PLACEHOLDERS.includes(secret)) throw new Error("SAVE_SIGNING_KEY が仮の鍵と同じです。別の文字列にしてください。");
}

/** save_key.js の中身の鍵の番号と鍵を、本番のものに置き換えた中身を返す。 @param {string} source @param {string} secret */
export function stampKey(source, secret) {
  checkKey(secret);
  if (!ID_LINE.test(source) || !SECRET_LINE.test(source)) throw new Error("鍵の行が見つかりません");
  return source
    .replace(ID_LINE, `export const SIGNING_KEY_ID = "${PRODUCTION_KEY_ID}";`)
    .replace(SECRET_LINE, () => `export const SIGNING_KEY_SECRET = ${JSON.stringify(secret)};`);
}

/** リポジトリに登録されたファイルのどれかに、鍵の文字が入っていないか(入っていたら、そのファイルの名前)。 @param {string} secret @param {string} [dir] */
export function filesContaining(secret, dir = ".") {
  const names = execFileSync("git", ["ls-files", "-z"], { cwd: dir, encoding: "utf8" }).split("\0").filter(Boolean);
  return names.filter((name) => {
    try {
      return readFileSync(`${dir}/${name}`, "utf8").includes(secret);
    } catch {
      return false;
    }
  });
}

function main([file]) {
  const secret = process.env.SAVE_SIGNING_KEY;
  try {
    checkKey(secret);
    const found = filesContaining(/** @type {string} */ (secret));
    if (found.length > 0) throw new Error(`本番の鍵が、リポジトリのファイルに入っています:${found.join(", ")}`);
    writeFileSync(file, stampKey(readFileSync(file, "utf8"), /** @type {string} */ (secret)));
  } catch (e) {
    console.error(`::error::${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  console.log(`${file} に、鍵の番号 ${PRODUCTION_KEY_ID} の鍵を書き込みました(鍵の値は出しません)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
