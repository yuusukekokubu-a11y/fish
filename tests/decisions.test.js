// 決定の記録の対応(D-003・D-110)のテスト。
// 今有効な決定は docs/DECISIONS.md と巻のファイル(docs/decisions/vol*.md:D-133)、
// 載せなかった決定は docs/decisions/archive.md に分かれる。

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";

import { readText } from "./helpers.js";

const HEADING = /^## (D-\d{3}) /gm;
const REFERENCE = /D-\d{3}/g;

const volumes = readdirSync(new URL("../docs/decisions/", import.meta.url))
  .filter((name) => /^vol\d+\.md$/.test(name))
  .sort();
const decisionsText = [readText("docs/DECISIONS.md"), ...volumes.map((name) => readText(`docs/decisions/${name}`))].join("\n");
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

test("D 番号は全部のファイルを合わせて D-001 からの通し番号で、重ならない", () => {
  assert.ok(all.length > 0);
  assert.equal(new Set(all).size, all.length, "同じ番号が 2 回出ている");
  assert.deepEqual(
    all,
    all.map((_, i) => `D-${String(i + 1).padStart(3, "0")}`),
  );
});

test("今有効な決定(DECISIONS.md と巻)は全部 ACTIVE_DECISIONS に出る", () => {
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
  // 「置き換えた番号:D-019・D-054」のように複数あるときも、全部を見る。
  const replaced = [...`${decisionsText}\n${archiveText}`.matchAll(/置き換えた番号:(.*)/g)].flatMap((m) => m[1].match(REFERENCE) ?? []);
  for (const n of replaced) {
    assert.ok(archived.includes(n), `${n} は置き換えられたのに、まだ DECISIONS.md にある`);
  }
});

test("巻のファイルがあり、DECISIONS.md は 800 行以内(D-133)", () => {
  assert.ok(volumes.length >= 1);
  assert.ok(readText("docs/DECISIONS.md").split("\n").length <= 800);
});
