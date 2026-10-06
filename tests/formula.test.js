// 魚の数値の式のテスト(②-4c 土台の条件 2・3:D-225・D-226・D-230)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT, defineFish, FISH_KINDS, FISH_ROWS, makeContent } from "../src/core/fish.js";
import { createGame, OUTCOMES, PHASES, tap, update } from "../src/core/fishing.js";
import {
  coinScale,
  craftCount,
  evolveCount,
  fishCoins,
  fishMinigame,
  fishScales,
  gradeFactor,
  growthMaxLevel,
  round2,
} from "../src/core/formula.js";
import { cratePrice, effectRange, EQUIP_KIND_ROWS, makeCrates, RARITY_ROWS } from "../src/core/gear.js";
import { levelRange, maxLevel, SKILL_ROWS } from "../src/core/skills.js";
import { hookJust, progressAt } from "./helpers.js";

const F = DEFAULT_CONFIG.formula;

test("魚と段階の数値は全部、通し番号 g の式から作られている", () => {
  for (const f of DEFAULT_CONTENT.fish) {
    assert.deepEqual(f.reward, { coins: fishCoins(f.kind, f.stage), scales: fishScales(f.kind, f.stage) }, f.id);
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

test("g=1〜5 の値は、②-4b4 のときの値から ±15% 以内(体力・報酬・製作の数・装備)。価格はおよそ半分", () => {
  const prices = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG).map((c) => c.price).slice(0, 5);
  const now = {
    weakCoins: [1, 2, 3, 4, 5].map((g) => fishCoins("weak", g)),
    strongCoins: [1, 2, 3, 4, 5].map((g) => fishCoins("strong", g)),
    bossCoins: [1, 2, 3, 4, 5].map((g) => fishCoins("boss", g)),
    strongHp: [1, 2, 3, 4, 5].map((g) => fishMinigame("strong", g).hp),
    strongTime: [1, 2, 3, 4, 5].map((g) => fishMinigame("strong", g).timeLimitMs),
    craft: [1, 2, 3, 4, 5].map((g) => craftCount(g)),
  };
  // 価格は、およそ半分(目標の時間 60 秒。弱い魚のジャストの分だけ、ちょうど半分より少し高い:D-253・D-258)。
  prices.forEach((p, i) => {
    const ratio = p / OLD_PRICE[i];
    assert.ok(ratio >= 0.45 && ratio <= 0.65, `価格 g=${i + 1}:${OLD_PRICE[i]} → ${p}(${ratio.toFixed(2)} 倍)`);
  });
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

test("2 けたの丸めと、製作の数は 3・4・4・5・6 から上限 10 に近づく", () => {
  assert.deepEqual([47.6, 238, 0.4, 1, 12345].map(round2), [48, 240, 1, 1, 12000]);
  assert.deepEqual([1, 2, 3, 4, 5, 10, 25, 100].map((g) => craftCount(g)), [3, 4, 4, 5, 6, 8, 10, 10]);
  assert.throws(() => craftCount(0));
});
