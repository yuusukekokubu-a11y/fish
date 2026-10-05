// 魚の設定表とミニゲームの限界のテスト(受け入れ条件 5)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { availableFish, effectiveMinigame, FISH_KINDS, FISH_LIST, fishWeight, pickWeighted } from "../src/core/fish.js";
import { createGame, currentMarker, drawCast, PHASES, tap, update } from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";

const LIMITS = DEFAULT_CONFIG.minigame;

test("各段階に、普通と強いの魚が 1 種類ずつある", () => {
  for (let stage = 1; stage <= DEFAULT_CONFIG.rod.maxStage; stage++) {
    const at = FISH_LIST.filter((f) => f.stage === stage);
    assert.deepEqual(at.map((f) => f.kind).sort(), [FISH_KINDS.NORMAL, FISH_KINDS.STRONG]);
  }
});

test("id は重ならず、強い魚だけがミニゲームの重さを持つ", () => {
  assert.equal(new Set(FISH_LIST.map((f) => f.id)).size, FISH_LIST.length);
  for (const f of FISH_LIST) {
    assert.equal(f.minigame !== null, f.kind === FISH_KINDS.STRONG, f.name);
  }
});

test("段階 1 の魚は Issue #4 と同じ設定", () => {
  const [normal, strong] = [availableFish(1, FISH_KINDS.NORMAL), availableFish(1, FISH_KINDS.STRONG)];
  assert.equal(normal.length, 1);
  assert.equal(strong.length, 1);
  // 印の速さと当たり範囲の幅は Issue #4 のまま。体力と制限時間は体力制で足した(D-063)。
  assert.equal(strong[0].minigame.sweepMs, 900);
  assert.equal(strong[0].minigame.zoneWidth, 0.22);
  assert.equal(strong[0].color, "#f4a261");
  assert.equal(normal[0].color, "#a8dadc");
});

test("段階が上の強い魚ほど、印が速く、当たり範囲が狭い", () => {
  const strong = availableFish(5, FISH_KINDS.STRONG);
  for (let i = 1; i < strong.length; i++) {
    assert.ok(strong[i].minigame.sweepMs < strong[i - 1].minigame.sweepMs, strong[i].name);
    assert.ok(strong[i].minigame.zoneWidth < strong[i - 1].minigame.zoneWidth, strong[i].name);
  }
});

test("全部の強い魚が、限界(幅 10% 以上・端から端 0.45 秒以上)の中にある", () => {
  for (const f of availableFish(5, FISH_KINDS.STRONG)) {
    const m = effectiveMinigame(f, LIMITS);
    assert.deepEqual(m, { ...f.minigame }, `${f.name} は限界で直されずにそのまま使われる`);
    assert.ok(m.zoneWidth >= LIMITS.minZoneWidth && m.sweepMs >= LIMITS.minSweepMs);
  }
});

test("限界の境界:ちょうどの値はそのまま、こえた値は限界に直す", () => {
  const make = (sweepMs, zoneWidth) => ({ minigame: { sweepMs, zoneWidth, hp: 3, timeLimitMs: 9000 } });
  const pick = (m) => ({ sweepMs: m.sweepMs, zoneWidth: m.zoneWidth });
  assert.deepEqual(pick(effectiveMinigame(make(450, 0.1), LIMITS)), { sweepMs: 450, zoneWidth: 0.1 });
  assert.deepEqual(pick(effectiveMinigame(make(449, 0.0999), LIMITS)), { sweepMs: 450, zoneWidth: 0.1 });
  assert.deepEqual(pick(effectiveMinigame(make(100, 0), LIMITS)), { sweepMs: 450, zoneWidth: 0.1 });
  assert.deepEqual(pick(effectiveMinigame(make(451, 0.1001), LIMITS)), { sweepMs: 451, zoneWidth: 0.1001 });
  assert.equal(effectiveMinigame(make(100, 0), LIMITS).hp, 3, "体力と制限時間はそのまま");
  assert.equal(effectiveMinigame({ minigame: null }, LIMITS), null);
});

test("強い魚ごとの設定が、当たり範囲の幅と印の動きに反映される", () => {
  const rng = createRng(31);
  for (let i = 0; i < 3000; i++) {
    const cast = drawCast(rng, DEFAULT_CONFIG, 5);
    if (!cast.zone) continue;
    assert.ok(Math.abs(cast.zone.end - cast.zone.start - cast.fish.minigame.zoneWidth) < 1e-12, cast.fish.name);
    assert.equal(cast.minigame.sweepMs, cast.fish.minigame.sweepMs);
  }
  // マグロ(0.52 秒)のミニゲームで、0.52 秒たつと印は反対側の対称の位置に来る。
  const game = createGame(1, { progress: { coins: 0, material: 0, rodStage: 5, seen: [] } });
  // マグロが掛かったときだけ合わせる。ほかは逃がし、休みになったら再開する。
  for (let i = 0; i < 1000000 && !(game.phase === PHASES.MINIGAME && game.cast.fish.id === "maguro"); i++) {
    update(game, 10);
    if (game.phase === PHASES.BITE && game.cast.fish.id === "maguro") tap(game);
    if (game.phase === PHASES.RESTING) tap(game);
  }
  assert.equal(game.cast.fish.id, "maguro");
  const before = currentMarker(game);
  assert.ok(before < 0.1, `始まった直後の位置 ${before}`);
  update(game, 520);
  assert.ok(Math.abs(currentMarker(game) - (1 - before)) < 1e-9);
});

test("重みは段階ごとに 2 倍で、境界の値で正しく選ぶ", () => {
  const list = availableFish(3, FISH_KINDS.NORMAL);
  assert.deepEqual(list.map(fishWeight), [1, 2, 4]);
  // 合計 7 のうち、[0, 1/7) は段階 1、[1/7, 3/7) は段階 2、[3/7, 1) は段階 3。
  assert.equal(pickWeighted(list, 0).stage, 1);
  assert.equal(pickWeighted(list, 0.9999 / 7).stage, 1);
  assert.equal(pickWeighted(list, 1 / 7).stage, 2);
  assert.equal(pickWeighted(list, 2.9999 / 7).stage, 2);
  assert.equal(pickWeighted(list, 3 / 7).stage, 3);
  assert.equal(pickWeighted(list, 0.99999).stage, 3);
});
