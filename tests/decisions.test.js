// DECISIONS と ACTIVE_DECISIONS の対応(D-003)のテスト。

import assert from "node:assert/strict";
import { test } from "node:test";

import { readText } from "./helpers.js";

const HEADING = /^## (D-\d{3}) /gm;
const REFERENCE = /D-\d{3}/g;

const decisions = [...readText("docs/DECISIONS.md").matchAll(HEADING)].map((m) => m[1]);
const active = readText("docs/ACTIVE_DECISIONS.md");
const refs = (text) => new Set(text.match(REFERENCE) ?? []);
// 「載せなかった決定」では、各行の先頭の番号がその決定。後ろの番号は置き換えた先の説明。
const unlistedHeads = (text) => new Set([...text.matchAll(/^- (D-\d{3})/gm)].map((m) => m[1]));

test("D 番号は D-001 からの通し番号", () => {
  assert.ok(decisions.length > 0, "決定が 1 つもない");
  assert.deepEqual(
    decisions,
    decisions.map((_, i) => `D-${String(i + 1).padStart(3, "0")}`),
  );
});

test("全部の決定が ACTIVE_DECISIONS か「載せなかった決定」に出る", () => {
  const [current, unlisted] = active.split("## 載せなかった決定");
  const listed = new Set([...refs(current), ...unlistedHeads(unlisted ?? "")]);
  const missing = decisions.filter((n) => !listed.has(n));
  assert.deepEqual(missing, [], `ACTIVE_DECISIONS に出てこない決定:${missing}`);
});

test("ACTIVE_DECISIONS は DECISIONS にある番号だけを指す", () => {
  const unknown = [...refs(active)].filter((n) => !decisions.includes(n));
  assert.deepEqual(unknown, [], `DECISIONS にない番号:${unknown}`);
});

test("「載せなかった決定」と有効な決定の両方に出る番号はない", () => {
  const [current, unlisted] = active.split("## 載せなかった決定");
  assert.ok(unlisted, "「載せなかった決定」の節がない");
  const both = [...refs(current)].filter((n) => unlistedHeads(unlisted).has(n));
  assert.deepEqual(both, [], `両方にある番号:${both}`);
});

test("置き換えられた決定は「載せなかった決定」にある", () => {
  const [, unlisted] = active.split("## 載せなかった決定");
  const replaced = [...readText("docs/DECISIONS.md").matchAll(/置き換えた番号:(D-\d{3})/g)].map((m) => m[1]);
  for (const n of replaced) {
    assert.ok(unlistedHeads(unlisted).has(n), `${n} は置き換えられたのに「載せなかった決定」にない`);
  }
});
