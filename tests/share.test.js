// セーブコードの共有のテスト(画面の整理の依頼の受け入れ条件 3:D-315)。共有の仕組みを置き換えて確かめる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { canShareText, shareText } from "../src/ui/share.js";

test("共有の仕組みがあるときだけ使える(ないとき・文字を渡せないときは使えない)", () => {
  assert.equal(canShareText(undefined), false);
  assert.equal(canShareText({}), false, "navigator.share がない端末");
  assert.equal(canShareText({ share: async () => {} }), true);
  assert.equal(canShareText({ share: async () => {}, canShare: () => false }), false);
  assert.equal(canShareText({ share: async () => {}, canShare: () => { throw new Error("x"); } }), false);
});

test("押すと、書き出したコードの文字列だけを渡す", async () => {
  const sent = [];
  const nav = { share: async (data) => { sent.push(data); }, canShare: () => true };
  assert.equal(await shareText(nav, "TSURI5-k1-5-abc-xyz"), "shared");
  assert.deepEqual(sent, [{ text: "TSURI5-k1-5-abc-xyz" }]);
});

test("やめた(キャンセル)ときは cancelled、ほかの失敗は failed。どちらもエラーを投げない", async () => {
  const abort = Object.assign(new Error("canceled"), { name: "AbortError" });
  assert.equal(await shareText({ share: async () => { throw abort; } }, "x"), "cancelled");
  assert.equal(await shareText({ share: async () => { throw new TypeError("bad"); } }, "x"), "failed");
  assert.equal(await shareText({}, "x"), "failed", "使えない端末");
});
