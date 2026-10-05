// シードで固定できる乱数(D-021)のテスト。

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createRng, normalizeSeed } from "../src/core/rng.js";
import { ROOT } from "./helpers.js";

function take(rng, n) {
  return Array.from({ length: n }, () => rng());
}

test("同じシードなら同じ数の並びになる", () => {
  assert.deepEqual(take(createRng(42), 50), take(createRng(42), 50));
});

test("ちがうシードなら並びも変わる", () => {
  assert.notDeepEqual(take(createRng(1), 10), take(createRng(2), 10));
});

test("数は 0 以上 1 未満", () => {
  for (const x of take(createRng(7), 10000)) {
    assert.ok(x >= 0 && x < 1, String(x));
  }
});

test("シードは数でも数字の文字列でも同じに扱う", () => {
  assert.equal(normalizeSeed("123"), 123);
  assert.equal(normalizeSeed(123), 123);
  assert.deepEqual(take(createRng("123"), 5), take(createRng(123), 5));
});

test("数字でない文字列や大きな数もシードにできる", () => {
  assert.equal(normalizeSeed("fish"), normalizeSeed("fish"));
  assert.notEqual(normalizeSeed("fish"), normalizeSeed("fishes"));
  assert.equal(normalizeSeed("4294967296"), 0);
  assert.equal(normalizeSeed(-1), 4294967295);
});

test("計算本体は Math.random を使わない(シードで固定するため)", () => {
  const dir = join(ROOT, "src", "core");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    assert.doesNotMatch(readFileSync(join(dir, file), "utf8"), /Math\.random/, file);
  }
});
