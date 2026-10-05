// 重いテストで共通に使う、遊び方のモデル(テストではない:D-112)。
//  - 上手:rate = 1、hookOk = 1。合わせは毎回ジャスト帯の真ん中、ミニゲームは印が当たり範囲の真ん中に来たら必ず当てる。
//  - ときどき失敗:rate = 0.7、hookOk = 0.8。合わせは 8 割だけ押し(残りは遅すぎで逃す)、ミニゲームは真ん中に来たとき
//    7 割で当て、3 割は範囲の外で押して外す(体力が回復する)。

import { currentMarker, PHASES, tap } from "../../src/core/fishing.js";
import { createRng } from "../../src/core/rng.js";

export function makePolicy(rate, hookOk, seed) {
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
