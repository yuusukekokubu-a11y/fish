// 重いテスト:餌の経済(D-265)。全段階で、餌を使い続ける遊び方と使わない遊び方を比べる。
// - 遊び方のモデルは policy.js(上手・ときどき失敗)、装備は段階の平均的な装備(rewards.test.js と同じ)。
// - 餌を使い続ける:スイッチを入れ、餌が切れないように足し続け、使った数 × 価格を稼ぎから引く。
// - 稼ぎ(餌代を引いた後)は、使わないときの 1.5 倍以内。製作の時間 = 製作に要る鱗の数 ÷ 時間あたりに集まる鱗。
// - 0 から:ウロコイン 0 で段階を始め、餌が切れたら買えるだけ買う遊び方で、製作に要る鱗が集まるまでの時間(16 シードの平均)。
// 製作の時間の目安(餌なしの 5 割前後)は、価格 7〜9 割・効果 100% の範囲では届かない(D-269)。表は報告に載せる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { baitFish, buyBait, maxBuyable, setUseBait } from "../../src/core/bait.js";
import { DEFAULT_CONTENT, STAGE_LIST } from "../../src/core/fish.js";
import { createGame, update } from "../../src/core/fishing.js";
import { baitPrice, fishCoins } from "../../src/core/formula.js";
import { averageItems, progressWith } from "./builds.js";
import { policyOf, SKILLED, SLOPPY } from "./policy.js";

const PLAY_MS = 900000;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** 段階 stage を、餌あり/なしで遊んだときの、1 秒あたりの稼ぎ(餌代を引いた後)と、製作の鱗の集まり方。 */
function play(stage, style, bait) {
  const scaleId = baitFish(DEFAULT_CONTENT, stage).id;
  let coins = 0;
  let scales = 0;
  let used = 0;
  let catches = 0;
  for (const seed of SEEDS) {
    const base = progressWith(stage, averageItems(DEFAULT_CONTENT, stage));
    const g = createGame(seed, { progress: bait ? { ...base, bait: 99, useBait: true } : base });
    const policy = policyOf(style, seed);
    for (let t = 16; t <= PLAY_MS; t += 16) {
      update(g, 16);
      policy(g);
      if (bait && g.progress.bait < 50) {
        used += 99 - g.progress.bait;
        g.progress.bait = 99;
      }
    }
    if (bait) used += 99 - g.progress.bait;
    coins += g.progress.coins;
    scales += g.progress.scales[scaleId] ?? 0;
    catches += g.results.filter((r) => r.fishId === scaleId && r.outcome === "caught").length;
  }
  const sec = (PLAY_MS * SEEDS.length) / 1000;
  const cost = used * baitPrice(stage);
  return { net: (coins - cost) / sec, gross: coins / sec, scalesPerSec: scales / sec, used, catchRate: used ? catches / used : null };
}

/** ウロコイン 0 から、製作に要る鱗が集まるまでの秒(餌ありは、切れたら買えるだけ買う)。 */
function craftFromZero(stage, style, bait, seed) {
  const id = baitFish(DEFAULT_CONTENT, stage).id;
  const need = STAGE_LIST.find((s) => s.stage === stage).craft.count;
  const g = createGame(seed, { progress: progressWith(stage, averageItems(DEFAULT_CONTENT, stage)) });
  if (bait) setUseBait(g.progress, true);
  const policy = policyOf(style, seed);
  for (let t = 16; t <= 7200000; t += 16) {
    update(g, 16);
    policy(g);
    if (bait && !g.progress.bait) {
      const n = maxBuyable(g.progress, g.config);
      if (n > 0) buyBait(g.progress, n, g.config);
    }
    if ((g.progress.scales[id] ?? 0) >= need) return t / 1000;
  }
  return Infinity;
}

function averageFromZero(stage, style, bait) {
  let sum = 0;
  for (let seed = 1; seed <= 16; seed++) sum += craftFromZero(stage, style, bait, seed);
  return sum / 16;
}

for (const [label, style] of [
  ["上手", SKILLED],
  ["ときどき失敗", SLOPPY],
]) {
  test(`${label}:餌ありの稼ぎ(餌代を引いた後)は餌なしの 1.5 倍以内。製作の時間は餌ありのほうが短い`, () => {
    const rows = [];
    for (const { stage, craft } of STAGE_LIST) {
      const off = play(stage, style, false);
      const on = play(stage, style, true);
      const ratio = on.net / off.net;
      const craftOff = craft.count / off.scalesPerSec;
      const craftOn = craft.count / on.scalesPerSec;
      const zeroOff = averageFromZero(stage, style, false);
      const zeroOn = averageFromZero(stage, style, true);
      rows.push(
        `| ${stage} | ${baitPrice(stage)} | ${fishCoins("strong", stage)} | ${off.net.toFixed(2)} | ${on.net.toFixed(2)} | ${ratio.toFixed(2)} | ${craftOff.toFixed(0)} | ${craftOn.toFixed(0)} | ${(craftOn / craftOff).toFixed(2)} | ${zeroOff.toFixed(0)} | ${zeroOn.toFixed(0)} | ${(zeroOn / zeroOff).toFixed(2)} | ${(on.catchRate * 100).toFixed(0)}% |`,
      );
      assert.ok(zeroOn < zeroOff, `段階 ${stage}:0 からの製作 ${zeroOn.toFixed(0)} / ${zeroOff.toFixed(0)}`);
      assert.ok(ratio <= 1.5, `段階 ${stage}:稼ぎの比 ${ratio.toFixed(2)}`);
      assert.ok(craftOn < craftOff, `段階 ${stage}:製作の時間 ${craftOn.toFixed(0)} / ${craftOff.toFixed(0)}`);
    }
    console.log(`${label}\n| g | 餌の価格 | 強い魚のウロコイン | 稼ぎ/秒(餌なし) | 稼ぎ/秒(餌あり・餌代後) | 比 | 製作の秒(餌なし) | 製作の秒(餌あり) | 比 | 0 からの製作の秒(餌なし) | 0 から(餌あり) | 比 | 餌の投で釣れた割合 |\n${rows.join("\n")}`);
  });
}
