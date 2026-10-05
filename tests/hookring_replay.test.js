// 縮む輪の合わせで遊んだ結果が、記録と完全に一致するかのテスト(受け入れ条件 8・D-090)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { readText } from "./helpers.js";
import { playRecorded } from "./hookring_play.js";

const FIXTURE = JSON.parse(readText("tests/fixtures/hookring_plays.json"));

test("同じシードと同じ操作で、合わせ・釣果・ウロコイン・鱗・竿の段階が記録と完全に一致する", () => {
  for (const [key, expected] of Object.entries(FIXTURE.plays)) {
    const [stage, seed, way] = key.split("-");
    assert.deepEqual(playRecorded(Number(seed), Number(stage), way), expected, key);
  }
});

test("記録には、ジャスト・成功・時間切れ・体力ゼロが含まれている", () => {
  const rows = Object.values(FIXTURE.plays).flatMap((p) => p.results);
  for (const [reason, hook] of [
    ["hp-zero", "just"],
    ["hooked", "just"],
    ["hooked", "good"],
    ["timeout", "good"],
  ]) {
    assert.ok(rows.some((r) => r[3] === reason && r[4] === hook), `${reason}/${hook}`);
  }
});
