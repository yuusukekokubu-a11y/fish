// 餌のテスト(餌と自動分解の条件 1・2・3:D-263〜D-265)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { baitBlocker, baitCount, baitFish, buyBait, maxBuyable, refundBait, setUseBait } from "../src/core/bait.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT, STAGE_LIST } from "../src/core/fish.js";
import { createGame, drawCast, evolveGameRod, PHASES, tap, update } from "../src/core/fishing.js";
import { baitPrice, fishCoins } from "../src/core/formula.js";
import { createRng } from "../src/core/rng.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { progressAt } from "./helpers.js";

/** 1 投ぶん進める(結果が出て、次の投が始まるまで)。合わせはしない(どの魚も遅すぎで逃げる)。 */
function nextFish(game) {
  const n = game.results.length;
  while (game.results.length === n) {
    update(game, 50);
    if (game.phase === PHASES.RESTING) tap(game);
  }
  // 合わせを続けて逃すと休みになるので、再開する。
  while (game.phase !== PHASES.CASTING) {
    if (game.phase === PHASES.RESTING) tap(game);
    else update(game, 50);
  }
}

test("餌の価格は、強い魚 1 匹のウロコインの 7〜9 割(全ての g)", () => {
  for (let g = 1; g <= 100; g++) {
    const ratio = baitPrice(g) / fishCoins("strong", g);
    assert.ok(ratio >= 0.7 && ratio <= 0.9, `g=${g}:${baitPrice(g)} / ${fishCoins("strong", g)}`);
  }
  assert.deepEqual([1, 2, 3, 4, 5].map((g) => baitPrice(g)), [4, 12, 33, 80, 190]);
});

test("買う:現在の段階の餌だけ。上限 99。ウロコインが足りないと買えない(ちょうどは買える)。買えないときは何も変えない", () => {
  const config = DEFAULT_CONFIG;
  const p = progressAt(2, ROD_STEPS.NONE, { coins: 12 * 3 });
  assert.equal(baitBlocker(p, 4, config), "coins", "36 では 4 個(48)は買えない");
  assert.deepEqual(buyBait(p, 4, config), { ok: false, reason: "coins" });
  assert.deepEqual([p.coins, baitCount(p)], [36, 0]);
  assert.deepEqual(buyBait(p, 3, config), { ok: true, count: 3, cost: 36 }, "ちょうど買える");
  assert.deepEqual([p.coins, p.bait], [0, 3]);
  p.coins = 1e9;
  assert.equal(maxBuyable(p, config), 96, "上限 99 まで");
  assert.equal(baitBlocker(p, 97, config), "max");
  assert.deepEqual(buyBait(p, 96, config), { ok: true, count: 96, cost: 96 * 12 });
  assert.equal(p.bait, 99);
  assert.equal(baitBlocker(p, 1, config), "max");
  assert.equal(maxBuyable(p, config), 0);
  assert.equal(baitBlocker(p, 0, config), "count");
});

test("スイッチが入っていて餌があるときだけ、1 投で 1 個使い、その投は現在の段階の強い魚になる(各段階)。0 になったら通常の投", () => {
  for (const { stage } of STAGE_LIST) {
    const game = createGame(3, { progress: progressAt(stage, ROD_STEPS.NONE, { bait: 2, useBait: true }) });
    const strong = baitFish(game.content, stage);
    assert.equal(strong.kind, "strong");
    assert.equal(strong.stage, stage);
    update(game, game.config.castMs); // 投げ終わる → 餌を使う
    assert.deepEqual([game.cast.fish.id, game.cast.kind, game.cast.bait, game.progress.bait], [strong.id, "strong", true, 1], `段階 ${stage}`);
    nextFish(game);
    update(game, game.config.castMs);
    assert.equal(game.cast.fish.id, strong.id);
    assert.equal("bait" in game.progress, false, "0 になったら欄を消す");
    assert.equal(game.progress.useBait, true, "スイッチはそのまま");
    nextFish(game);
    update(game, game.config.castMs);
    assert.notEqual(game.cast.bait, true, "餌がなければ通常の投");
  }
  // スイッチが切れていれば使わない。
  const off = createGame(3, { progress: progressAt(1, ROD_STEPS.NONE, { bait: 5 }) });
  update(off, off.config.castMs);
  assert.deepEqual([off.cast.bait, off.progress.bait], [undefined, 5]);
});

test("乱数:餌を使っても使わなくても、魚の乱数の引く数と順番は同じ(待ち時間はそのまま、以後の並びも同じ)", () => {
  const plain = createGame(9, { progress: progressAt(3) });
  const baited = createGame(9, { progress: progressAt(3, ROD_STEPS.NONE, { bait: 5, useBait: true }) });
  // 魚の系統だけを、同じ数だけ引いて並べたもの。
  const rng = createRng(9);
  const expected = Array.from({ length: 12 }, () => drawCast(rng, DEFAULT_CONFIG, 3, { fish: DEFAULT_CONTENT.fish }));
  for (let i = 0; i < 12; i++) {
    update(plain, plain.config.castMs);
    update(baited, baited.config.castMs);
    assert.equal(plain.cast.fish.id, expected[i].fish.id, `${i} 投目(餌なし)`);
    assert.equal(baited.cast.waitMs, expected[i].waitMs, `${i} 投目の待ち時間`);
    if (i < 5) assert.equal(baited.cast.fish.id, "hirame", "餌の投は段階 3 の強い魚");
    else assert.equal(baited.cast.fish.id, expected[i].fish.id, "餌が切れたら、元の並びのまま");
    nextFish(plain);
    nextFish(baited);
  }
});

test("同じシード・操作・買い方なら、結果は完全に同じ", () => {
  const play = () => {
    const game = createGame(4, { progress: progressAt(2, ROD_STEPS.NONE, { coins: 200 }) });
    buyBait(game.progress, 5, game.config);
    setUseBait(game.progress, true);
    for (let i = 0; i < 10; i++) nextFish(game);
    return { progress: game.progress, results: game.results.map((r) => [r.fishId, r.outcome]) };
  };
  assert.deepEqual(play(), play());
});

test("払い戻し:進化で段階が進むと、残りの餌を、買った段階の価格でウロコインに換える", () => {
  const game = createGame(1, { progress: progressAt(2, ROD_STEPS.DEFEATED, { scales: { "nushi-suzuki": 1 }, coins: 1000 }) });
  assert.deepEqual(buyBait(game.progress, 7, game.config), { ok: true, count: 7, cost: 84 });
  setUseBait(game.progress, true);
  assert.equal(evolveGameRod(game), true);
  assert.equal(game.progress.rodStage, 3);
  assert.deepEqual(game.baitRefund, { count: 7, coins: 7 * 12 });
  assert.deepEqual([game.progress.coins, "bait" in game.progress], [1000, false], "買った金額がそのまま戻る");
  // 餌がなければ払い戻しはない。
  const none = createGame(1, { progress: progressAt(2, ROD_STEPS.DEFEATED, { scales: { "nushi-suzuki": 1 } }) });
  evolveGameRod(none);
  assert.equal(none.baitRefund, null);
  assert.deepEqual(refundBait(progressAt(1), 1, Number.MAX_SAFE_INTEGER), { count: 0, coins: 0 });
});
