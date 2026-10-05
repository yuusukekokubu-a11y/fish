// ファイルの大きさの目安(D-006)のテスト。

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { test } from "node:test";

import { readText, ROOT } from "./helpers.js";

const LIMIT = 800;
const TEXT_SUFFIXES = new Set([".js", ".mjs", ".html", ".css", ".md", ".json", ".yml", ".yaml", ".txt"]);

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
}

function allowedLargeFiles() {
  const section = readText("docs/DESIGN.md").split("### 800 行を超えるファイル")[1].split("\n## ")[0];
  return new Set([...section.matchAll(/^- `([^`]+)`:/gm)].map((m) => m[1]));
}

test("800 行を超えるファイルは、DESIGN に理由が書いてある", () => {
  const allowed = allowedLargeFiles();
  const tooLarge = [];
  for (const rel of trackedFiles()) {
    const full = join(ROOT, rel);
    if (!TEXT_SUFFIXES.has(extname(rel)) || !existsSync(full)) continue;
    const lines = readFileSync(full, "utf8").split("\n").length;
    if (lines > LIMIT && !allowed.has(rel)) tooLarge.push(`${rel}(${lines} 行)`);
  }
  assert.deepEqual(tooLarge, [], `${LIMIT} 行を超え、DESIGN に理由がないファイル`);
});
