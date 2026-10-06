// 用語の点検(D-180・②-4b2 の条件 12)。
// 画面に出る文字を集めて、戦闘の意味の古い言い方(当たり・当たり範囲・外したとき など)が残っていないかを確かめる。
// 集めるもの:画面のコード(src/ui/*.js)の文字列、index.html の文字、表(スキル・装備・レア度・魚)の名前と説明、
// ステータスの項目名。コードの変数名とコメントは見ない(D-180)。

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { createGame } from "../src/core/fishing.js";
import { EQUIP_KIND_ROWS, RARITY_ROWS } from "../src/core/gear.js";
import { SKILL_ROWS } from "../src/core/skills.js";
import { STATUS_ITEMS, statusView } from "../src/ui/screen_views.js";
import { readText } from "./helpers.js";

// 使わない言い方。「外す」(装備を外す)は別の意味なので、戦闘の意味の言い方だけを並べる。
const FORBIDDEN = ["当たり", "外したとき", "外したあと", "外し得", "外れ", "外した数"];

/** JS のコメントを除いて、文字列(" ' `)を取り出す。 */
function jsStrings(code) {
  const noBlock = code.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n");
  return [...noLine.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** 画面に出る文字の一覧([どこ, 文字])。 */
function screenTexts() {
  /** @type {[string, string][]} */
  const texts = [];
  for (const name of readdirSync(new URL("../src/ui/", import.meta.url)).filter((n) => n.endsWith(".js"))) {
    for (const s of jsStrings(readText(`src/ui/${name}`))) texts.push([`src/ui/${name}`, s]);
  }
  const html = readText("index.html").replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/g, "");
  texts.push(["index.html", html]);
  for (const s of SKILL_ROWS) texts.push([`スキル ${s.id}`, `${s.name} ${s.description} ${s.display.label} ${s.display.when ?? ""}`]);
  for (const k of EQUIP_KIND_ROWS) texts.push([`装備 ${k.id}`, `${k.name} ${k.display.label}`]);
  for (const r of RARITY_ROWS) texts.push([`レア度 ${r.id}`, r.name]);
  for (const f of DEFAULT_CONTENT.fish) texts.push([`魚 ${f.id}`, f.name]);
  for (const item of STATUS_ITEMS) texts.push(["ステータス", item.label]);
  const view = statusView({ game: createGame(1) });
  for (const section of view.sections) {
    texts.push(["ステータス", section.title]);
    for (const row of section.rows) texts.push(["ステータス", `${row.label} ${row.detail?.flat().join(" ") ?? ""}`]);
  }
  return texts;
}

test("画面の文言に、戦闘の意味の「当たり」「当たり範囲」「外したとき」などが残っていない(命中・命中範囲・ミスに統一)", () => {
  const found = [];
  for (const [where, text] of screenTexts()) {
    for (const word of FORBIDDEN) if (text.includes(word)) found.push(`${where}:「${word}」(${text.slice(0, 40)})`);
  }
  assert.deepEqual(found, []);
});

test("点検の仕組みが働く(古い言い方を入れると見つかる)", () => {
  const sample = 'const a = "当たり範囲が広い"; // 当たり(コメントは見ない)';
  assert.deepEqual(jsStrings(sample), ["当たり範囲が広い"]);
});

test("SPEC に用語集があり、命中・ミス・命中範囲・合わせ・高レア/低レアを説明している", () => {
  const spec = readText("docs/SPEC.md");
  const glossary = spec.slice(spec.indexOf("## 7. 用語集"));
  for (const word of ["| 命中 |", "| ミス |", "| 命中範囲 |", "| 合わせ |", "| 高レア・低レア |"]) assert.ok(glossary.includes(word), word);
});
