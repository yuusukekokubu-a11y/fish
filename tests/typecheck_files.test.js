// 型チェックの対象のファイルのテスト(D-144)。
// tsconfig.json の files と、先頭に「// @ts-check」があるファイルが、ずれていないかを確かめる。
// 型チェックそのもの(tsc)は、CI の「型チェック」と `npm run typecheck` で回す。

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { readText, ROOT } from "./helpers.js";

/** tsconfig.json は JSON にコメントを書いているので、行のコメントを除いてから読む。 */
const tsconfig = JSON.parse(
  readText("tsconfig.json")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n"),
);

function jsFiles(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsFiles(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : [],
  );
}

test("型チェックはファイルを作らず、厳しい設定で確かめる", () => {
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.strict, true);
});

test("tsconfig の files と、// @ts-check のあるファイルがそろっている", () => {
  const checked = jsFiles("src")
    .filter((f) => readText(f).startsWith("// @ts-check"))
    .sort();
  assert.deepEqual([...tsconfig.files].sort(), checked);
  assert.ok(checked.length >= 2);
});
