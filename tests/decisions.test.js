// 決定の記録の対応(D-003・D-110)のテスト。
// 決定は docs/DECISIONS.md(今有効なもの)と docs/decisions/archive.md(載せなかったもの)に分かれる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { readText } from "./helpers.js";

const HEADING = /^## (D-\d{3}) /gm;
const REFERENCE = /D-\d{3}/g;

const decisionsText = readText("docs/DECISIONS.md");
const archiveText = readText("docs/decisions/archive.md");
const active = readText("docs/ACTIVE_DECISIONS.md");

const headings = (text) => [...text.matchAll(HEADING)].map((m) => m[1]);
const refs = (text) => new Set(text.match(REFERENCE) ?? []);
const kept = headings(decisionsText);
const archived = headings(archiveText);
const all = [...kept, ...archived].sort();
// 保管庫の「一覧」の各行の先頭の番号。
const [archiveHead] = archiveText.split("\n---\n");
const archiveList = [...archiveHead.matchAll(/^- (D-\d{3})/gm)].map((m) => m[1]);

test("D 番号は 2 つのファイルを合わせて D-001 からの通し番号で、重ならない", () => {
  assert.ok(all.length > 0);
  assert.equal(new Set(all).size, all.length, "同じ番号が 2 回出ている");
  assert.deepEqual(
    all,
    all.map((_, i) => `D-${String(i + 1).padStart(3, "0")}`),
  );
});

test("今有効な決定(DECISIONS.md)は全部 ACTIVE_DECISIONS に出る", () => {
  const listed = refs(active);
  const missing = kept.filter((n) => !listed.has(n));
  assert.deepEqual(missing, [], `ACTIVE_DECISIONS に出てこない決定:${missing}`);
});

test("ACTIVE_DECISIONS は、今有効な決定だけを指す(保管庫の番号を指さない)", () => {
  const unknown = [...refs(active)].filter((n) => !kept.includes(n));
  assert.deepEqual(unknown, [], `今有効でない番号:${unknown}`);
  assert.ok(!active.includes("## 載せなかった決定"), "載せなかった決定の節は保管庫へ");
});

test("保管庫の一覧と、保管庫に移した節がそろっている", () => {
  assert.deepEqual([...archiveList].sort(), [...archived].sort());
});

test("置き換えられた決定は、保管庫にある", () => {
  const replaced = [...`${decisionsText}\n${archiveText}`.matchAll(/置き換えた番号:(D-\d{3})/g)].map((m) => m[1]);
  for (const n of replaced) {
    assert.ok(archived.includes(n), `${n} は置き換えられたのに、まだ DECISIONS.md にある`);
  }
});
