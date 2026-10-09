// 魚の数値の式のテスト(②-4c 土台の条件 2・3:D-225・D-226・D-230)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { fightTimeLimit } from "../src/core/combat.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT, defineFish, FISH_KINDS, FISH_ROWS, makeContent } from "../src/core/fish.js";
import { createGame, OUTCOMES, PHASES, tap, update } from "../src/core/fishing.js";
import {
  coinScale,
  craftCount,
  evolveCount,
  fishCoins,
  fishDefense,
  fishHp,
  fishMinigame,
  fishScales,
  fishZoneWidth,
  fishQuirks,
  fishSweepMs,
  fishTimeLimitMs,
  gradeFactor,
  growthMaxLevel,
  targetPulls,
  round2,
} from "../src/core/formula.js";
import { cratePrice, effectRange, EQUIP_KIND_ROWS, makeCrates, RARITY_ROWS } from "../src/core/gear.js";
import { levelRange, maxLevel, SKILL_ROWS } from "../src/core/skills.js";
import { hookJust, progressAt } from "./helpers.js";

const F = DEFAULT_CONFIG.formula;

test("魚と段階の数値は全部、通し番号 g の式から作られている", () => {
  for (const f of DEFAULT_CONTENT.fish) {
    // 珍しい魚は弱い魚 × rareCoinRatio(D-406)。
    const coins = f.rare ? round2(fishCoins(f.kind, f.stage) * F.rareCoinRatio) : fishCoins(f.kind, f.stage);
    assert.deepEqual(f.reward, { coins, scales: fishScales(f.kind, f.stage) }, f.id);
    assert.deepEqual(f.minigame, f.kind === FISH_KINDS.WEAK ? null : fishMinigame(f.kind, f.stage), f.id);
  }
  for (const s of DEFAULT_CONTENT.stages) {
    assert.equal(s.craft.count, craftCount(s.stage));
    assert.equal(s.evolve.count, evolveCount(s.stage));
  }
  // 価格は魚の報酬(式)から、装備はグレードの倍率(式)から、スキルの最大は 2 + g(式)から。
  for (const c of makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG)) assert.equal(c.price, cratePrice(DEFAULT_CONTENT, c.stage, DEFAULT_CONFIG));
  const reel = EQUIP_KIND_ROWS.find((k) => k.id === "reel");
  assert.deepEqual(effectRange(reel, RARITY_ROWS[0], 5, 0.35), { min: Math.round(1 * gradeFactor(5, 0.35)), max: Math.round(2 * gradeFactor(5, 0.35)) });
  assert.equal(maxLevel(SKILL_ROWS[0], 7, DEFAULT_CONFIG.skills), growthMaxLevel(7, DEFAULT_CONFIG.skills));
  assert.equal(growthMaxLevel(100, DEFAULT_CONFIG.skills), 102);
});

test("式の数(config.formula)を変えると、表の数値・価格・ゲームの報酬がそれに従う(手書きの数はない)", () => {
  const doubled = { ...F, weakCoins: 2, hpPerStage: 20, craftMin: 5 };
  const content = makeContent(FISH_ROWS.map((r) => defineFish(r, doubled)), undefined);
  const aji = content.byId.get("aji");
  const kurodai = content.byId.get("kurodai");
  assert.equal(aji.reward.coins, 2);
  assert.equal(kurodai.minigame.hp, 30);
  assert.ok(makeCrates(content, DEFAULT_CONFIG)[0].price > makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG)[0].price);
  // ゲームで釣った魚の報酬も式の値。
  const game = createGame(3, { progress: progressAt(1) });
  for (let i = 0; i < 200000 && !game.results.some((r) => r.fishId === "aji" && r.outcome === OUTCOMES.CAUGHT); i++) {
    update(game, 10);
    if (game.phase === PHASES.BITE && hookJust(game)) tap(game);
    if (game.phase === PHASES.RESTING) tap(game);
  }
  const r = game.results.find((x) => x.fishId === "aji" && x.outcome === OUTCOMES.CAUGHT);
  // ジャストで釣ったので × 1.5(四捨五入:D-258)。
  assert.equal(r.reward.coins, Math.round(fishCoins("weak", 1) * 1.5));
});

// ②-4b4 のときの手書きの値(段階 1〜5)。手触りを ±15% 以内に保つ(D-226)。
// ヌシの体力と制限時間は、②-4c 防御で「育てた装備で決まった命中回数」の式に作り直したので、ここでは比べない(D-260・D-254)。
// クレートの価格は、目標の時間を 120 秒から 60 秒にしたので、およそ半分にした(下の別のテスト:D-253)。
const OLD = {
  weakCoins: [1, 3, 8, 20, 50],
  strongCoins: [5, 15, 40, 100, 250],
  bossCoins: [50, 150, 400, 1000, 2500],
  strongHp: [20, 30, 40, 50, 60],
  strongTime: [8000, 9000, 10000, 11000, 12000],
  craft: [3, 4, 4, 5, 6],
};
const OLD_PRICE = [20, 46, 110, 260, 630];
/** 目標の時間 60 秒のときの価格(D-253)。D-355 で 15 秒にしたので、いまはおよそ 4 分の 1。 */
const PRICE_60 = [12, 28, 67, 160, 370];

test("g=1〜5 の値は、②-4b4 のときの値から ±15% 以内(体力・報酬・製作の数・装備)。価格は 60 秒のときのおよそ 4 分の 1", () => {
  const prices = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG).map((c) => c.price).slice(0, 5);
  const now = {
    weakCoins: [1, 2, 3, 4, 5].map((g) => fishCoins("weak", g)),
    strongCoins: [1, 2, 3, 4, 5].map((g) => fishCoins("strong", g)),
    bossCoins: [1, 2, 3, 4, 5].map((g) => fishCoins("boss", g)),
    strongHp: [1, 2, 3, 4, 5].map((g) => fishMinigame("strong", g).hp),
    strongTime: [1, 2, 3, 4, 5].map((g) => fishMinigame("strong", g).timeLimitMs),
    craft: [1, 2, 3, 4, 5].map((g) => craftCount(g)),
  };
  // 価格は、目標の時間 60 秒のときの、およそ 4 分の 1(15 秒:D-355。上から 2 けたに丸めるので少しずれる)。
  prices.forEach((p, i) => {
    const ratio = p / PRICE_60[i];
    assert.ok(ratio >= 0.2 && ratio <= 0.3, `価格 g=${i + 1}:${PRICE_60[i]} → ${p}(${ratio.toFixed(2)} 倍)`);
  });
  assert.ok(OLD_PRICE.every((p, i) => prices[i] < p / 4), "②-4b4 のときの 4 分の 1 より安い");
  for (const [k, olds] of Object.entries(OLD)) {
    olds.forEach((old, i) => {
      const diff = Math.abs(now[k][i] - old) / old;
      assert.ok(diff <= 0.15, `${k} g=${i + 1}:${old} → ${now[k][i]}(${(diff * 100).toFixed(0)}%)`);
    });
  }
  // 装備の基本効果は、グレードの倍率の式が前と同じ(1 + 0.35(g − 1))なので、同じ値。
  for (let g = 1; g <= 5; g++) assert.equal(gradeFactor(g, DEFAULT_CONFIG.gacha.gradeGrowth), 1 + 0.35 * (g - 1));
  // スキルのレベルの範囲も前と同じ式(グレード 5 のレジェンドは Lv2〜4)。
  assert.deepEqual(levelRange("legend", 5, DEFAULT_CONFIG.skills), { min: 2, max: 4 });
});

test("伸び方は緩やか:報酬の 1 段ごとの伸びは下がり続け、g=100 でも 1.2 倍未満", () => {
  let prevRatio = Infinity;
  for (let g = 2; g <= 100; g++) {
    const ratio = coinScale(g) / coinScale(g - 1);
    assert.ok(ratio <= prevRatio + 1e-12 && ratio > 1, `g=${g}:${ratio}`);
    prevRatio = ratio;
  }
  assert.ok(prevRatio < 1.2);
  assert.ok(fishCoins("boss", 100) < Number.MAX_SAFE_INTEGER / 100);
});

test("2 けたの丸めと、製作の数は釣り場の中の位置で 3・4・4・5・6(どの釣り場も同じ:D-282)", () => {
  assert.deepEqual([47.6, 238, 0.4, 1, 12345].map(round2), [48, 240, 1, 1, 12000]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10, 11, 25, 100].map((g) => craftCount(g)), [3, 4, 4, 5, 6, 3, 6, 3, 6, 6]);
  assert.throws(() => craftCount(0));
});

test("制限時間は強い魚 8 秒 + 4 秒 × log5(g)、ヌシ 20 秒 + 2 秒 × log5(g)(D-380)。延長は元の制限時間まで", () => {
  const log5 = (g) => Math.log(g) / Math.log(5);
  for (let g = 1; g <= 100; g++) {
    assert.equal(fishTimeLimitMs("strong", g), Math.round((8000 + 4000 * log5(g)) / 100) * 100);
    assert.equal(fishTimeLimitMs("boss", g), Math.round((20000 + 2000 * log5(g)) / 100) * 100);
  }
  // 延長(糸・粘りなど)は、魚の制限時間 × 1 まで(合計で最大 2 倍)。
  const limits = DEFAULT_CONFIG.combatLimits;
  assert.equal(fightTimeLimit(20000, { timeLimitBonusMs: 5000 }, limits), 25000);
  assert.equal(fightTimeLimit(20000, { timeLimitBonusMs: 50000 }, limits), 40000);
  assert.equal(fightTimeLimit(20000, { timeLimitBonusMs: -30000 }, limits), limits.minTimeLimitMs);
});

test("ヌシの体力は 64.1 × g^0.93 × 1.14^g を上から 2 けた(D-380・D-382・D-395)。g=1〜2 は 120 まで。強い魚の体力は 10 + 10g、防御はどの魚も 0", () => {
  const f = DEFAULT_CONFIG.formula;
  for (let g = 1; g <= 100; g++) {
    const raw = f.bossHpBase * g ** f.bossHpPower * f.bossHpGrowth ** g;
    assert.equal(fishHp("boss", g), g <= 2 ? Math.min(120, round2(raw)) : round2(raw), `g=${g}`);
    assert.equal(fishHp("strong", g), 10 + 10 * g);
    assert.equal(fishDefense("boss", g) + fishDefense("strong", g), 0);
    if (g > 1) assert.ok(fishHp("boss", g) >= fishHp("boss", g - 1), `g=${g} は前より少なくない`);
  }
  assert.deepEqual([1, 10, 30].map((g) => fishHp("boss", g)), [73, 2100, 83000]);
  // 目安の引く回数 P(g):g=1 で 20、g=30 で 120(D-379)。
  assert.deepEqual([1, 15, 30].map((g) => targetPulls(g)), [20, 48, 120]);
});

test("ヌシのくせ(D-381・D-382):港なし・磯 狭い命中範囲・川 防御の壁・沖 速い印・外洋 自動回復・深海 短い制限時間。4・5 体目は前のくせも重ねる", () => {
  const q = (g) => fishQuirks("boss", g);
  assert.deepEqual([1, 5].map(q), [[], []]);
  assert.deepEqual([6, 8, 9, 10].map(q), [["narrow"], ["narrow"], ["narrow"], ["narrow"]], "港のくせはないので、磯の 4・5 体目も狭い命中範囲だけ");
  assert.deepEqual([11, 13, 14, 15].map(q), [["wall"], ["wall"], ["wall", "narrow"], ["wall", "narrow"]]);
  assert.deepEqual([16, 18, 19, 20].map(q), [["fast"], ["fast"], ["fast", "wall"], ["fast", "wall"]]);
  assert.deepEqual([21, 23, 24, 25].map(q), [["regen"], ["regen"], ["regen", "fast"], ["regen", "fast"]]);
  assert.deepEqual([26, 28, 29, 30].map(q), [["short"], ["short"], ["short", "regen"], ["short", "regen"]]);
  assert.deepEqual([31, 34].map(q), [[], ["short"]], "表にない釣り場はくせなし(4・5 体目は前の釣り場のくせだけ)");
  assert.deepEqual(fishQuirks("strong", 14), [], "強い魚にくせはない");
  const f = DEFAULT_CONFIG.formula;
  // 狭い命中範囲:幅 × 0.6・体力 × hpScale。防御の壁:体力 × hpScale。重なると両方を掛ける。
  assert.equal(fishMinigame("boss", 8).zoneWidth, Math.round(fishZoneWidth("boss", 8) * f.quirks.narrow.zoneScale * 1000) / 1000);
  assert.equal(fishMinigame("boss", 8).hp, round2(fishHp("boss", 8) * f.quirks.narrow.hpScale));
  assert.equal(fishMinigame("boss", 14).hp, round2(fishHp("boss", 14) * f.quirks.wall.hpScale * f.quirks.narrow.hpScale));
  assert.equal(fishMinigame("boss", 5).zoneWidth, fishZoneWidth("boss", 5), "くせのないヌシは式のまま");
  // 速い印:印の速さ × sweepScale(安全の下限 0.3 秒まで)。
  assert.equal(fishMinigame("boss", 16).sweepMs, Math.max(300, Math.round(fishSweepMs("boss", 16) * f.quirks.fast.sweepScale)));
  assert.equal(fishMinigame("boss", 16).hp, round2(fishHp("boss", 16) * f.quirks.fast.hpScale));
  // 自動回復:1 秒あたり 体力 × perSecRatio。ほかのヌシは持たない。
  const r = fishMinigame("boss", 21);
  assert.equal(r.regenPerSec, Math.max(1, Math.round(r.hp * f.quirks.regen.perSecRatio)));
  assert.equal(fishMinigame("boss", 20).regenPerSec, undefined);
  // 短い制限時間:制限時間 × timeScale。延びる上限は、くせの前の制限時間(limitBaseMs)で数える。
  const s = fishMinigame("boss", 26);
  assert.equal(s.limitBaseMs, fishTimeLimitMs("boss", 26));
  assert.equal(s.timeLimitMs, Math.round((fishTimeLimitMs("boss", 26) * f.quirks.short.timeScale) / 100) * 100);
  const limits = DEFAULT_CONFIG.combatLimits;
  assert.equal(fightTimeLimit(s.timeLimitMs, { timeLimitBonusMs: 60000 }, limits, s.limitBaseMs), s.timeLimitMs + s.limitBaseMs);
  assert.equal(fishMinigame("boss", 25).limitBaseMs, undefined);
});
