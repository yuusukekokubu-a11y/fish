// 公開用の src/version.js に、取り込みの識別番号(commit の頭 7 文字)を書き込む(D-091)。
// 使い方:node scripts/stamp_version.mjs <公開用の version.js の場所> <commit の番号>
// リポジトリのファイルは書き換えない(公開用に集めたファイルだけに使う)。

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LINE = /^export const BUILD = "[^"]*";$/m;

/** version.js の中身の BUILD を、commit の頭 7 文字に置き換えた中身を返す。 */
export function stampVersion(source, sha) {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`commit の番号ではありません:${sha}`);
  if (!LINE.test(source)) throw new Error("BUILD の行が見つかりません");
  return source.replace(LINE, `export const BUILD = "${sha.slice(0, 7)}";`);
}

function main([file, sha]) {
  writeFileSync(file, stampVersion(readFileSync(file, "utf8"), sha));
  console.log(`${file} に ${sha.slice(0, 7)} を書き込みました`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
