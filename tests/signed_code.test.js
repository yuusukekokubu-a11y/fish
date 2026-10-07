// 署名つきのセーブコード(TSURI5)のテスト(署名の依頼の受け入れ条件 1〜4:D-291〜D-294)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { initialProgress } from "../src/core/save.js";
import { checksum, encodeSaveCode } from "../src/core/savecode.js";
import { DEBUG_KEY_ID, readSaveCode, SIGNATURE_LENGTH, signSaveCode, SIGNED_CODE_ERRORS, UNSIGNED_WARNING } from "../src/core/signed_code.js";
import { CURRENT_KEY, DEBUG_KEY, signingKeys } from "../src/ui/save_sign.js";
import { readText } from "./helpers.js";

const DEV = CURRENT_KEY;
// テスト用の作り物の本番の鍵(本物の鍵ではない)。
const K1 = Object.freeze({ id: "k1", secret: "test-only-production-like-key" });
const STRICT = Object.freeze({ ...DEFAULT_CONFIG, saveCode: Object.freeze({ acceptUnsigned: false }) });

/** 持ち物 100 個(スキル 3 つ)・鱗 20 種類の進み具合(長さの確かめ用)。 */
function bigProgress() {
  const v4 = JSON.parse(readText("tests/fixtures/compat_v4.json"));
  const p = structuredClone(v4.cases.find((c) => c.progress.gear.items.some((it) => it.skills.length === 3)).progress);
  const proto = p.gear.items.find((it) => it.skills.length === 3);
  p.gear.items = Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(proto), id: i + 1 }));
  p.gear.equipped = {};
  p.gear.nextId = 101;
  p.scales = Object.fromEntries(DEFAULT_CONTENT.fish.slice(0, 20).map((f) => [f.id, 999]));
  return p;
}

test("書き出すと TSURI5-(鍵の番号)-(保存の版)-(本文)-(署名 22 文字)。読むと元に戻る(往復)", async () => {
  for (const c of JSON.parse(readText("tests/fixtures/compat_v4.json")).cases) {
    const code = await signSaveCode(c.progress, DEV);
    assert.match(code, /^TSURI5-dev-4-[0-9A-Za-z.,:~-]+-[A-Za-z0-9_-]{22}$/);
    // 本文は、これまでの本文(TSURI4 の形)のまま。
    assert.ok(code.includes(`-4-${encodeSaveCode(c.progress).slice(7, -9)}-`), c.name);
    assert.deepEqual(await readSaveCode(code, { keys: [DEV] }), { ok: true, progress: c.progress, signed: true, keyId: "dev", warning: null }, c.name);
  }
});

test("1 文字でも変えると読めない。本文と署名のどこを変えても「署名が合いません」。いまの保存データは変わらない", async () => {
  const p = initialProgress();
  p.coins = 12345;
  const code = await signSaveCode(p, DEV);
  const before = structuredClone(p);
  const bodyStart = "TSURI5-dev-4-".length;
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,:~-_";
  for (let i = 0; i < code.length; i++) {
    const other = chars[(chars.indexOf(code[i]) + 7) % chars.length];
    const changed = code.slice(0, i) + other + code.slice(i + 1);
    const r = await readSaveCode(changed, { keys: [DEV] });
    assert.equal(r.ok, false, `${i} 文字目`);
    if (i >= bodyStart && i !== code.length - SIGNATURE_LENGTH - 1 && "-".indexOf(other) < 0 && code[i] !== "-") {
      assert.equal(r.error, "signature", `${i} 文字目(${code[i]} → ${other}):${r.ok ? "" : r.message}`);
    }
  }
  assert.deepEqual(p, before);
  assert.equal(SIGNED_CODE_ERRORS.signature, "署名が合いません");
});

test("長さの増えは 40 文字以内(持ち物 100 個・スキル 3 つ・鱗 20 種類)", async () => {
  const p = bigProgress();
  assert.deepEqual([p.gear.items.length, Object.keys(p.scales).length], [100, 20]);
  for (const key of [K1, DEV, DEBUG_KEY]) {
    const signed = await signSaveCode(p, key);
    const plain = encodeSaveCode(p);
    assert.ok(signed.length - plain.length <= 40, `${key.id}:${signed.length - plain.length}`);
    assert.equal((await readSaveCode(signed, { keys: [key] })).ok, true);
  }
});

test("鍵の番号:知らない番号は拒否。本番の鍵(k1)と手元の鍵(dev)は、互いのコードを読めない", async () => {
  const p = initialProgress();
  const k1Code = await signSaveCode(p, K1);
  const devCode = await signSaveCode(p, DEV);
  assert.equal((await readSaveCode(k1Code, { keys: [DEV] })).error, "unknownKey");
  assert.equal((await readSaveCode(devCode, { keys: [K1] })).error, "unknownKey");
  // 番号だけ書き換えても、鍵がちがうので署名が合わない。
  const fake = { id: "k1", secret: DEV.secret };
  assert.equal((await readSaveCode(devCode.replace("-dev-", "-k1-"), { keys: [K1] })).error, "signature");
  assert.equal((await readSaveCode(await signSaveCode(p, fake), { keys: [K1] })).error, "signature");
  assert.equal(SIGNED_CODE_ERRORS.unknownKey, "知らない鍵のコードです");
  await assert.rejects(signSaveCode(p, { id: "K1!", secret: "x" }));
});

test("デバッグ用のコード:本番では拒否、?debug のときは本番のコードもデバッグ用のコードも読める", async () => {
  const p = initialProgress();
  const prod = signingKeys({ debug: false }, K1);
  const debug = signingKeys({ debug: true }, K1);
  assert.deepEqual([prod.signKey.id, debug.signKey.id], ["k1", DEBUG_KEY_ID]);
  const debugCode = await signSaveCode(p, debug.signKey);
  const prodCode = await signSaveCode(p, prod.signKey);
  const r = await readSaveCode(debugCode, { keys: prod.keys });
  assert.deepEqual([r.ok, r.ok ? "" : r.message], [false, "デバッグ用のコードは、本番では読めません"]);
  assert.equal((await readSaveCode(debugCode, { keys: debug.keys })).ok, true);
  assert.equal((await readSaveCode(prodCode, { keys: debug.keys })).ok, true);
  assert.equal((await readSaveCode(prodCode, { keys: prod.keys })).ok, true);
});

test("署名なしの古い形式(TSURI1〜4):acceptUnsigned が true なら注意つきで読み、false なら拒否する", async () => {
  assert.equal(DEFAULT_CONFIG.saveCode.acceptUnsigned, true, "この版は受け付ける");
  for (const version of [1, 2, 3, 4]) {
    for (const c of JSON.parse(readText(`tests/fixtures/compat_v${version}.json`)).cases) {
      const ok = await readSaveCode(c.code, { keys: [DEV] });
      assert.equal(ok.ok, true, c.name);
      if (ok.ok) assert.deepEqual([ok.signed, ok.warning], [false, UNSIGNED_WARNING]);
      const no = await readSaveCode(c.code, { keys: [DEV], config: STRICT });
      assert.deepEqual([no.ok, no.ok ? "" : no.error], [false, "unsigned"], c.name);
    }
  }
  assert.equal(UNSIGNED_WARNING, "署名がありません(古い形式です)");
  // 壊れた古い形式は、これまでどおりの理由で拒否する(注意より先)。
  const body = "0~1.0~~~0..1~~~~0.0.0~";
  assert.equal((await readSaveCode(`TSURI4-${body}-00000000`, { keys: [DEV] })).error, "checksum");
  assert.equal((await readSaveCode(`TSURI4-${body}-${checksum(body)}`, { keys: [DEV] })).ok, true);
  assert.equal((await readSaveCode("", { keys: [DEV] })).error, "empty");
  assert.equal((await readSaveCode("TSURI5-dev-4-abc", { keys: [DEV] })).error, "format");
});

test("互換の正解データ(compat_v5.json):仮の鍵(dev)の署名つきのコードが、いつまでも読めて決まった結果になる", async () => {
  const fixture = JSON.parse(readText("tests/fixtures/compat_v5.json"));
  assert.deepEqual([fixture.version, fixture.keyId], [5, "dev"]);
  for (const c of fixture.cases) {
    assert.deepEqual(await readSaveCode(c.code, { keys: [DEV] }), { ok: true, progress: c.progress, signed: true, keyId: "dev", warning: null }, c.name);
    // 書き出しも同じ(署名は決まった計算なので、同じ鍵・同じ中身なら同じコード)。
    assert.equal(await signSaveCode(c.progress, DEV), c.code, c.name);
  }
  for (const c of fixture.rejected) {
    const r = await readSaveCode(c.code, { keys: [DEV] });
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
});
