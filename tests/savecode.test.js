// セーブコードのテスト(受け入れ条件 11:版 3 の往復、FISH2 の読み替え、壊れたコードの拒否)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONTENT, FISH_LIST } from "../src/core/fish.js";
import { COUNT_MAX, ROD_STEPS } from "../src/core/rod.js";
import { checksum, decodeSaveCode, encodeSaveCode, SAVE_CODE_ERRORS } from "../src/core/savecode.js";
import { toSaveData } from "../src/core/save.js";
import { progressAt } from "./helpers.js";

const ROD = DEFAULT_CONTENT;
const SAMPLE = progressAt(4, ROD_STEPS.DEFEATED, {
  coins: 123456,
  scales: { kurodai: 3, katsuo: 12, "nushi-katsuo": 1 },
  seen: ["aji", "kurodai", "saba", "buri"],
});

/** 中身を差し替えて、印も正しく付け直したコードを作る(範囲外の数値などを試すため)。 */
function codeWith(data, prefix = "FISH3") {
  const body = btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${prefix}-${body}-${checksum(body)}`;
}

test("書き出して読み込むと、完全に元に戻る(往復)", () => {
  const all = Object.fromEntries(FISH_LIST.filter((f) => f.kind !== "weak").map((f) => [f.id, COUNT_MAX]));
  const cases = [
    progressAt(1),
    SAMPLE,
    progressAt(ROD.maxStage, ROD_STEPS.EVOLVED, { coins: COUNT_MAX, scales: all, seen: FISH_LIST.map((f) => f.id) }),
  ];
  for (const progress of cases) {
    const code = encodeSaveCode(progress);
    assert.match(code, /^FISH3-[A-Za-z0-9_-]+-[0-9a-f]{8}$/);
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

test("前の FISH2 のコードも読め、版 3 に読み替える", () => {
  const v2 = { version: 2, progress: { coins: 40, material: 5, rodStage: 3, seen: ["aji"] } };
  assert.deepEqual(decodeSaveCode(codeWith(v2, "FISH2"), ROD), {
    ok: true,
    progress: progressAt(3, ROD_STEPS.NONE, { coins: 45, seen: ["aji"] }),
  });
});

test("ちがう版のコードは拒否する", () => {
  assert.deepEqual(decodeSaveCode(codeWith(toSaveData(SAMPLE), "FISH4"), ROD).error, "version");
  assert.deepEqual(decodeSaveCode(codeWith(toSaveData(SAMPLE), "FISH1"), ROD).error, "version");
  assert.deepEqual(decodeSaveCode(codeWith(toSaveData(SAMPLE), "FISH2"), ROD).error, "version", "先頭と中身の版がちがう");
  assert.deepEqual(decodeSaveCode(codeWith({ version: 4, progress: {} }, "FISH3"), ROD).error, "version");
});

test("範囲外の数値・存在しない工程・形のちがう中身は拒否する", () => {
  const base = toSaveData(SAMPLE).progress;
  const bad = [
    { coins: -1 },
    { coins: 1.5 },
    { coins: "1" },
    { coins: COUNT_MAX + 2 },
    { scales: { kurodai: -1 } },
    { scales: { kurodai: null } },
    { scales: [1, 2] },
    { scales: { "NG id": 1 } },
    { rod: { stage: 0, step: "none" } },
    { rod: { stage: ROD.maxStage + 1, step: "none" } },
    { rod: { stage: 2.5, step: "none" } },
    { rod: { stage: 2, step: "upgraded" } },
    { rod: { stage: 2, step: "evolved" } },
    { rod: "1" },
    { seen: "aji" },
    { seen: [1, 2] },
  ];
  for (const over of bad) {
    const r = decodeSaveCode(codeWith({ version: 3, progress: { ...base, ...over } }), ROD);
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.equal(r.error, "content", JSON.stringify(over));
  }
  assert.equal(decodeSaveCode(codeWith({ version: 3 }), ROD).error, "content");
  assert.equal(decodeSaveCode(codeWith({ version: 3, progress: null }), ROD).error, "content");
});

test("範囲の境界の値は読める", () => {
  for (const progress of [
    progressAt(1, ROD_STEPS.NONE, { coins: 0 }),
    progressAt(1, ROD_STEPS.NONE, { coins: COUNT_MAX }),
    progressAt(ROD.maxStage, ROD_STEPS.EVOLVED),
    progressAt(ROD.maxStage, ROD_STEPS.DEFEATED, { scales: { "nushi-maguro": 0 } }),
  ]) {
    assert.deepEqual(decodeSaveCode(codeWith(toSaveData(progress)), ROD), { ok: true, progress });
  }
});

test("セーブコードの長さの見込み", () => {
  assert.ok(encodeSaveCode(SAMPLE).length < 300, `今の例 ${encodeSaveCode(SAMPLE).length} 文字`);
  // 魚 60 種類くらい(鱗を落とす魚 40 種類)を、全部大きな数で持っていても、2000 文字ほど。
  const scales = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`fish-${i}`, 123456]));
  const seen = Array.from({ length: 60 }, (_, i) => `fish-${i}`);
  const code = encodeSaveCode(progressAt(20, ROD_STEPS.NONE, { coins: 123456789, scales, seen }));
  assert.ok(code.length < 2500, `${code.length} 文字`);
});
