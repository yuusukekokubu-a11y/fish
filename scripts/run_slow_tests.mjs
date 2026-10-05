// 重いテスト(tests/slow/ の *.test.js)を回す(D-026)。
// 重いテストが 0 件のときは、何も回さずに成功として終わる。
// 引数は、そのまま node --test に渡す。

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SLOW_DIR = join(ROOT, "tests", "slow");

/** 重いテストのファイルの一覧(並びは名前順)。 */
export function findSlowTests(dir = SLOW_DIR) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith(".test.js"))
    .sort()
    .map((name) => join(dir, name));
}

function main(argv) {
  const files = findSlowTests();
  if (files.length === 0) {
    console.log("重いテストはまだありません(0 件)。成功として終わります。");
    return 0;
  }
  const result = spawnSync(process.execPath, ["--test", ...argv, ...files], { stdio: "inherit" });
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
