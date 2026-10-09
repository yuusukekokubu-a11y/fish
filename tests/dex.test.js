// 魚の図鑑と大きさ(D-405)のテスト。
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { catchRatio, crownOf, entryCrowns, recordCatch, sizeCm, sizeRatio } from "../src/core/dex.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { createGame, PHASES, tap, update } from "../src/core/fishing.js";
import { decodeSave, encodeSave } from "../src/core/save.js";
import { progressAt } from "./helpers.js";

const C = DEFAULT_CONFIG.dex;

test("大きさの倍率は 0.80〜1.25。冠は倍率で決まる(金冠 1.20 以上・銀冠 1.12 以上・ミニ金冠 0.85 以下)", () => {
  assert.deepEqual([sizeRatio(0, C), sizeRatio(0.0099, C), sizeRatio(0.5, C), sizeRatio(0.97, C), sizeRatio(0.999999, C)].map((r) => r >= 800 && r <= 1250), [true, true, true, true, true]);
  assert.equal(sizeRatio(0, C), 800);
  assert.equal(crownOf(sizeRatio(0.005, C), C), "mini");
  assert.equal(crownOf(sizeRatio(0.5, C), C), null);
  assert.equal(crownOf(sizeRatio(0.96, C), C), "silver");
  assert.equal(crownOf(sizeRatio(0.995, C), C), "gold");
  assert.equal(sizeCm(40, 1234), 49.4);
  // u が大きいほど倍率も大きい(区分けの境目で戻らない)。
  let last = 0;
  for (let i = 0; i <= 1000; i++) {
    const r = sizeRatio(i / 1000, C);
    assert.ok(r >= last, `u=${i / 1000}`);
    last = r;
  }
});

test("冠の出る割合:10 万回で 金冠 約 1%・銀冠 約 4%・ミニ金冠 約 1%(シードと回数から決まる)", () => {
  const n = 100000;
  const counts = { gold: 0, silver: 0, mini: 0 };
  for (let i = 0; i < n; i++) {
    const c = crownOf(catchRatio(12345, i % 90, Math.floor(i / 90), C), C);
    if (c) counts[c] += 1;
  }
  assert.ok(Math.abs(counts.gold / n - 0.01) < 0.002, `金冠 ${counts.gold}`);
  assert.ok(Math.abs(counts.silver / n - 0.04) < 0.004, `銀冠 ${counts.silver}`);
  assert.ok(Math.abs(counts.mini / n - 0.01) < 0.002, `ミニ金冠 ${counts.mini}`);
  // 同じシード・同じ魚・同じ回数なら同じ大きさ。
  assert.equal(catchRatio(7, 3, 5, C), catchRatio(7, 3, 5, C));
});

test("記録:釣った数・最小・最大が更新され、新しい冠と最大・最小の更新が分かる", () => {
  const p = {};
  const fish = { id: "kurodai", cm: 40 };
  const first = recordCatch(p, fish, 1, 1, C);
  assert.equal(p.dex.kurodai.count, 1);
  assert.equal(p.dex.kurodai.min, first.ratio);
  assert.equal(p.dex.kurodai.max, first.ratio);
  assert.equal(first.best, null, "はじめての 1 匹は更新とは言わない");
  assert.equal(first.cm, sizeCm(40, first.ratio));
  // 何匹か釣ると、最小 ≤ 最大で、数が増える。
  for (let i = 0; i < 50; i++) recordCatch(p, fish, 1, 1, C);
  assert.equal(p.dex.kurodai.count, 51);
  assert.ok(p.dex.kurodai.min <= p.dex.kurodai.max);
  // 冠は最小・最大から出る。
  assert.deepEqual(entryCrowns({ count: 3, min: 820, max: 1210 }, C), { gold: true, silver: true, mini: true });
  assert.deepEqual(entryCrowns({ count: 3, min: 900, max: 1150 }, C), { gold: false, silver: true, mini: false });
  assert.deepEqual(entryCrowns(undefined, C), { gold: false, silver: false, mini: false });
});

test("釣りの中で図鑑に記録される(結果に大きさ)。魚の出方は変わらない", () => {
  const game = createGame(3, { progress: progressAt(1) });
  for (let i = 0; i < 20000 && game.counts.weak === 0; i++) {
    update(game, 16);
    if (game.phase === PHASES.BITE && game.phaseMs > 1300) tap(game);
  }
  const caught = game.results.find((r) => r.outcome === "caught");
  assert.ok(caught?.size && caught.size.cm > 0);
  assert.equal(game.progress.dex[caught.fishId].count, 1);
});

test("保存(版 11):図鑑の欄は往復で元に戻る。表にない魚・数 0・範囲外・最小 > 最大は拒否", () => {
  const p = progressAt(3);
  p.dex = { aji: { count: 12, min: 830, max: 1180 }, kurodai: { count: 1, min: 1000, max: 1000 } };
  const body = encodeSave(p);
  assert.equal(body.split("~")[15], "aji:c.n2.ws,kurodai:1.rs.rs");
  assert.deepEqual(decodeSave(body), { ok: true, progress: p });
  const parts = body.split("~");
  const withDex = (d) => [...parts.slice(0, 15), d].join("~");
  for (const bad of ["nope:1.rs.rs", "aji:0.rs.rs", "aji:1.m0.rs", "aji:1.rs.yy", "aji:1.ws.rs", "aji:1.rs.rs,aji:1.rs.rs", "aji:1.rs"]) {
    assert.equal(decodeSave(withDex(bad)).ok, false, bad);
  }
  const empty = progressAt(3);
  assert.ok(!("dex" in (/** @type {any} */ (decodeSave(encodeSave(empty))).progress)), "記録がなければ欄を持たない");
});
