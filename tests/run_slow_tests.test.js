// 重いテストの回し方(D-026)のテスト。

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { findSlowTests } from "../scripts/run_slow_tests.mjs";
import { readText } from "./helpers.js";

test("重いテストが 0 件の場所では、空の一覧になる", () => {
  const dir = mkdtempSync(join(tmpdir(), "fish-slow-"));
  writeFileSync(join(dir, "README.md"), "説明だけ");
  assert.deepEqual(findSlowTests(dir), []);
});

test("*.test.js だけを、下の階層も含めて名前順に集める", () => {
  const dir = mkdtempSync(join(tmpdir(), "fish-slow-"));
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "b.test.js"), "");
  writeFileSync(join(dir, "a.test.js"), "");
  writeFileSync(join(dir, "helper.js"), "");
  writeFileSync(join(dir, "sub", "c.test.js"), "");
  assert.deepEqual(findSlowTests(dir), [
    join(dir, "a.test.js"),
    join(dir, "b.test.js"),
    join(dir, "sub", "c.test.js"),
  ]);
});

test("npm test は速いテストだけ、test:slow は重いテストを回す", () => {
  const scripts = JSON.parse(readText("package.json")).scripts;
  assert.equal(scripts.test, 'node --test "tests/*.test.js"');
  assert.equal(scripts["test:slow"], "node scripts/run_slow_tests.mjs");
});

test("外部の部品(npm の package)を入れていない", () => {
  const pkg = JSON.parse(readText("package.json"));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});
