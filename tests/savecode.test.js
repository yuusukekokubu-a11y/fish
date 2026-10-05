// セーブコードのテスト(受け入れ条件 9)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { FISH_LIST } from "../src/core/fish.js";
import { checksum, decodeSaveCode, encodeSaveCode, SAVE_CODE_ERRORS } from "../src/core/savecode.js";

const ROD = DEFAULT_CONFIG.rod;
const SAMPLE = { coins: 123456, material: 789, rodStage: 4, seen: ["aji", "kurodai", "saba", "buri"] };

/** 中身を差し替えて、印も正しく付け直したコードを作る(範囲外の数値などを試すため)。 */
function codeWith(data, prefix = "FISH2") {
  const body = btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${prefix}-${body}-${checksum(body)}`;
}

test("書き出して読み込むと、完全に元に戻る(往復)", () => {
  const cases = [
    { coins: 0, material: 0, rodStage: 1, seen: [] },
    SAMPLE,
    { coins: Number.MAX_SAFE_INTEGER, material: 0, rodStage: ROD.maxStage, seen: FISH_LIST.map((f) => f.id) },
  ];
  for (const progress of cases) {
    const code = encodeSaveCode(progress);
    assert.match(code, /^FISH2-[A-Za-z0-9_-]+-[0-9a-f]{8}$/);
    assert.deepEqual(decodeSaveCode(code, ROD), { ok: true, progress });
  }
});

test("前後の空白や、途中の改行が入っていても読める", () => {
  const code = encodeSaveCode(SAMPLE);
  const messy = `  ${code.slice(0, 20)}\n${code.slice(20)}  \n`;
  assert.deepEqual(decodeSaveCode(messy, ROD), { ok: true, progress: SAMPLE });
});

test("読み込みは、渡したデータを書き換えない(失敗しても成功しても)", () => {
  const before = structuredClone(SAMPLE);
  decodeSaveCode(encodeSaveCode(SAMPLE), ROD);
  decodeSaveCode("FISH2-xx-00000000", ROD);
  assert.deepEqual(SAMPLE, before);
});

function assertRejected(text, error) {
  const result = decodeSaveCode(text, ROD);
  assert.equal(result.ok, false, String(text).slice(0, 40));
  assert.equal(result.error, error, String(text).slice(0, 40));
  assert.equal(result.message, SAVE_CODE_ERRORS[error]);
  assert.equal(result.progress, undefined);
}

test("空のコードは拒否する", () => {
  for (const text of ["", "   ", "\n", null, undefined, 42]) assertRejected(text, "empty");
});

test("途中で切れたコードは拒否する", () => {
  const code = encodeSaveCode(SAMPLE);
  for (const cut of [5, 10, code.length - 9, code.length - 3, code.length - 1]) {
    const result = decodeSaveCode(code.slice(0, cut), ROD);
    assert.equal(result.ok, false, `${cut} 文字`);
  }
  // 中身の途中を抜いたもの(印は元のまま)は「壊れている」になる。
  const [head, body, sum] = code.split("-");
  assertRejected(`${head}-${body.slice(0, -4)}-${sum}`, "checksum");
});

test("1 文字でも変わったコードは、壊れているとして拒否する", () => {
  const code = encodeSaveCode(SAMPLE);
  const [head, body, sum] = code.split("-");
  for (const i of [0, 7, body.length - 1]) {
    const c = body[i] === "A" ? "B" : "A";
    assertRejected(`${head}-${body.slice(0, i)}${c}${body.slice(i + 1)}-${sum}`, "checksum");
  }
  const badSum = sum.replace(/^./, sum[0] === "0" ? "1" : "0");
  assertRejected(`${head}-${body}-${badSum}`, "checksum");
});

test("ちがう形式のコードは拒否する", () => {
  for (const text of [
    "hello",
    "FISH2",
    "FISH2--00000000",
    "FISH-abc-00000000",
    "FISH2-abc-0000000g",
    "FISH2-abc-000000000",
    "FISH2-ab+c-00000000",
    "FISHX-abc-00000000",
    JSON.stringify({ version: 2, progress: SAMPLE }),
    "x".repeat(5000),
  ]) {
    assertRejected(text, "format");
  }
  // 印は正しいが、中身が JSON でないもの。
  const body = btoa("not json").replace(/=+$/, "");
  assertRejected(`FISH2-${body}-${checksum(body)}`, "format");
});

test("ちがう版のコードは拒否する", () => {
  assertRejected(codeWith({ version: 2, progress: SAMPLE }, "FISH3"), "version");
  assertRejected(codeWith({ version: 1, ...SAMPLE }), "version");
  assertRejected(codeWith({ version: 3, progress: SAMPLE }), "version");
});

test("範囲外の数値や、形のちがう中身は拒否する", () => {
  const bad = [
    { coins: -1 },
    { coins: 1.5 },
    { coins: "1" },
    { coins: Number.MAX_SAFE_INTEGER + 2 },
    { material: -5 },
    { material: null },
    { rodStage: 0 },
    { rodStage: ROD.maxStage + 1 },
    { rodStage: 2.5 },
    { seen: "aji" },
    { seen: [1, 2] },
  ];
  for (const over of bad) {
    assertRejected(codeWith({ version: 2, progress: { ...SAMPLE, ...over } }), "content");
  }
  assertRejected(codeWith({ version: 2 }), "content");
  assertRejected(codeWith({ version: 2, progress: null }), "content");
});

test("範囲の境界の値は読める", () => {
  for (const over of [{ coins: 0 }, { material: 0 }, { rodStage: 1 }, { rodStage: ROD.maxStage }]) {
    const progress = { ...SAMPLE, ...over };
    assert.deepEqual(decodeSaveCode(codeWith({ version: 2, progress }), ROD), { ok: true, progress });
  }
});
