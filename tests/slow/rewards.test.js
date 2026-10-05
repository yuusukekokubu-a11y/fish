// 重いテスト:時間あたりの期待ウロコインは、全段階で 強い魚 > 弱い魚(受け入れ条件 5・D-095)。
// 遊び方のモデル(D-112):
//  - 上手:合わせは毎回ジャスト帯の真ん中、ミニゲームは印が当たり範囲の真ん中に来たら必ず当てる。
//  - ときどき失敗:合わせは 8 割だけ押す(残りは遅すぎで逃す)、ミニゲームは真ん中に来たとき 7 割で当て、
//    3 割は範囲の外で押して外す(体力が回復する)。
// 1 匹ごとの所要時間は、前の結果が出てから次の結果が出るまで(投げる・待つ・合わせ・戦い・結果の表示を含む)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { STAGE_LIST } from "../../src/core/fish.js";
import { createGame, currentMarker, PHASES, tap, update } from "../../src/core/fishing.js";
import { createRng } from "../../src/core/rng.js";
import { progressAt } from "../helpers.js";

function makePolicy(rate, hookOk, seed) {
  const r = createRng(seed * 7919 + 13);
  let hookPlan = null;
  let fightPlan = null;
  return (g) => {
    if (g.phase === PHASES.BITE) {
      if (hookPlan === null) hookPlan = r() < hookOk;
      const ring = g.cast.kind === "strong" ? g.combat.hook.strong : g.combat.hook.normal;
      if (hookPlan && g.phaseMs >= ring.ringMs - ring.successMs / 2 - 8) {
        hookPlan = null;
        tap(g);
      }
      return;
    }
    hookPlan = null;
    if (g.phase === PHASES.MINIGAME) {
      const z = g.fight.zone;
      const p = currentMarker(g);
      if (fightPlan === "miss") {
        if (p < z.start - 0.03 || p > z.end + 0.03) {
          tap(g);
          fightPlan = null;
        }
      } else if (Math.abs(p - (z.start + z.end) / 2) < 0.02) {
        if (fightPlan === null) fightPlan = r() < rate ? "hit" : "miss";
        if (fightPlan === "hit") {
          tap(g);
          fightPlan = null;
        }
      }
      return;
    }
    if (g.phase === PHASES.RESTING) tap(g);
  };
}

function coinsPerSecond(stage, rate, hookOk) {
  const acc = { weak: [0, 0], strong: [0, 0] };
  for (let seed = 1; seed <= 4; seed++) {
    const g = createGame(seed, { progress: progressAt(stage) });
    const policy = makePolicy(rate, hookOk, seed);
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

for (const [label, rate, hookOk] of [
  ["上手", 1, 1],
  ["ときどき失敗", 0.7, 0.8],
]) {
  test(`${label}:全段階で、時間あたりのウロコインは強い魚が弱い魚より多い`, () => {
    for (const { stage } of STAGE_LIST) {
      const r = coinsPerSecond(stage, rate, hookOk);
      assert.ok(r.strong > r.weak, `段階 ${stage}:強い ${r.strong.toFixed(2)} / 弱い ${r.weak.toFixed(2)}`);
      console.log(`${label} 段階 ${stage}:強い ${r.strong.toFixed(2)}/秒 弱い ${r.weak.toFixed(2)}/秒`);
    }
  });
}
