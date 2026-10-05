// 重いテストを回すかの判定(D-028)のテスト。

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { needsSlow } from "../scripts/ci_needs_slow.mjs";
import { ROOT } from "./helpers.js";

test("計算本体や重いテストが変わったら回す", () => {
  for (const files of [
    ["src/core/fishing.js"],
    ["docs/SPEC.md", "src/core/rng.js"],
    ["tests/slow/fishing_stats.test.js"],
    ["scripts/run_slow_tests.mjs"],
    ["./src/core/x.js"],
    ["src\\core\\x.js"],
  ]) {
    assert.equal(needsSlow(files), true, files.join(","));
  }
});

test("それ以外の変更では回さない", () => {
  for (const files of [
    [],
    [""],
    ["README.md", "docs/DECISIONS.md"],
    ["src/ui/main.js", "index.html"],
    ["tests/fishing.test.js"],
    [".github/workflows/ci.yml"],
    ["scripts/ci_needs_slow.mjs"],
    ["src/corelike/x.js"],
    ["docs/src/core/x.md"],
  ]) {
    assert.equal(needsSlow(files), false, files.join(","));
  }
});

test("スクリプトは結果を表示し、GITHUB_OUTPUT に書き足す", () => {
  for (const [stdin, expected] of [
    ["README.md\nsrc/core/a.js\n", "true"],
    ["README.md\n", "false"],
    ["", "false"],
  ]) {
    const output = join(mkdtempSync(join(tmpdir(), "fish-")), "out.txt");
    const result = spawnSync(process.execPath, [join(ROOT, "scripts", "ci_needs_slow.mjs")], {
      input: stdin,
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
    assert.equal(readFileSync(output, "utf8"), `needs_slow=${expected}\n`);
  }
});
