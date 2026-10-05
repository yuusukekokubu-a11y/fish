// PR で重いテストを回すかを、変わったファイルの一覧から決める(D-028)。
//
// 使い方:
//   変わったファイルを 1 行に 1 つずつ標準入力に渡す。
//   結果を "true" か "false" で表示する。
//   環境変数 GITHUB_OUTPUT があれば、そこへ "needs_slow=true" などを書き足す。

import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ここで始まるファイルが変わったら、重いテストを回す。
export const SLOW_PREFIXES = ["src/core/", "tests/slow/"];
// このファイルそのものが変わったら、重いテストを回す。
export const SLOW_FILES = ["scripts/run_slow_tests.mjs"];

/** 変わったファイルの中に、計算本体か重いテストに関わるものがあれば true。 */
export function needsSlow(changedFiles) {
  for (const raw of changedFiles) {
    let path = raw.trim().replaceAll("\\", "/");
    if (path.startsWith("./")) path = path.slice(2);
    if (!path) continue;
    if (SLOW_FILES.includes(path) || SLOW_PREFIXES.some((p) => path.startsWith(p))) {
      return true;
    }
  }
  return false;
}

function main() {
  const input = readFileSync(0, "utf8");
  const result = needsSlow(input.split("\n")) ? "true" : "false";
  console.log(result);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `needs_slow=${result}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
