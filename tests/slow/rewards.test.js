// 重いテスト:時間あたりの期待ウロコインは、全段階で 強い魚 > 弱い魚(D-095・D-253)。
// 遊び方のモデル(D-259:policy.js):上手(ジャスト 70%)と、ときどき失敗(ジャストなし、命中の 3 割は外す)。
// 装備は、段階の平均的な装備(弱い魚のジャストのウロコイン × 1.5 と、強い魚の初撃が入る)。
// 1 匹ごとの所要時間は、前の結果が出てから次の結果が出るまで(投げる・待つ・合わせ・戦い・結果の表示を含む)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONTENT, STAGE_LIST } from "../../src/core/fish.js";
import { createGame, PHASES, update } from "../../src/core/fishing.js";
import { averageItems, progressWith } from "./builds.js";
import { policyOf, SKILLED, SLOPPY } from "./policy.js";

function coinsPerSecond(stage, style) {
  const acc = { weak: [0, 0], strong: [0, 0] };
  for (let seed = 1; seed <= 4; seed++) {
    const g = createGame(seed, { progress: progressWith(stage, averageItems(DEFAULT_CONTENT, stage)) });
    const policy = policyOf(style, seed);
    let start = 0;
    let n = 0;
    for (let t = 16; t <= 900000; t += 16) {
      update(g, 16);
      policy(g);
      while (n < g.results.length) {
        const x = g.results[n++];
        acc[x.kind][0] += x.reward.coins;
        acc[x.kind][1] += t - start;
        start = t;
      }
    }
  }
  return { weak: (acc.weak[0] / acc.weak[1]) * 1000, strong: (acc.strong[0] / acc.strong[1]) * 1000 };
}

for (const [label, style] of [
  ["上手", SKILLED],
  ["ときどき失敗", SLOPPY],
]) {
  test(`${label}:全段階で、時間あたりのウロコインは強い魚が弱い魚より多い`, () => {
    for (const { stage } of STAGE_LIST) {
      const r = coinsPerSecond(stage, style);
      assert.ok(r.strong > r.weak, `段階 ${stage}:強い ${r.strong.toFixed(2)} / 弱い ${r.weak.toFixed(2)}`);
      console.log(`${label} 段階 ${stage}:強い ${r.strong.toFixed(2)}/秒 弱い ${r.weak.toFixed(2)}/秒`);
    }
  });
}
