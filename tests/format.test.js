// 数の短い表示のテスト(受け入れ条件 13・D-116)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCount } from "../src/ui/format.js";

test("1 万未満はそのまま、1 万以上は万・億・兆で小数 1 けた(切り捨て)", () => {
  const cases = [
    [0, "0"],
    [9999, "9999"],
    [10000, "1万"],
    [12345, "1.2万"],
    [19999, "1.9万"],
    [99999999, "9999万"], // 1000 以上は小数を出さない(短くする)
    [100000000, "1億"],
    [123456789, "1.2億"],
    [1e12, "1兆"],
    [1234567890123, "1.2兆"],
    [Number.MAX_SAFE_INTEGER, "9007兆"],
  ];
  for (const [n, text] of cases) assert.equal(formatCount(n), text, String(n));
});

test("どんな数でも 8 文字以内(表示がくずれない)", () => {
  for (let n = 1; n < Number.MAX_SAFE_INTEGER; n = n * 7 + 3) {
    assert.ok(formatCount(n).length <= 8, `${n} → ${formatCount(n)}`);
  }
  assert.equal(formatCount(-5), "0");
  assert.equal(formatCount(NaN), "0");
});
