// 重いテストで共通に使う、遊び方のモデル(テストではない:D-112・D-259)。
//  - 上手(SKILLED):合わせはジャスト成功率 70%(残りは通常の成功)。ミニゲームは、印が命中範囲の真ん中に来たら必ず当てる
//    (タップとタップの間は 250 ミリ秒以上あける)。
//  - ときどき失敗(SLOPPY):合わせはジャストを狙わず、通常の成功だけ。ミニゲームは真ん中に来たとき 7 割で当て、
//    3 割は範囲の外で押して外す(体力が回復する)。
// makePolicy(rate, hookOk, seed, justRate):rate は命中の割合、hookOk は合わせを押す割合(残りは遅すぎで逃す)、
// justRate は合わせをジャストにする割合。遊び方の乱数は、ゲームの乱数とは別(魚の並びは変わらない)。

import { currentHookTiming, currentMarker, PHASES, tap } from "../../src/core/fishing.js";
import { createRng } from "../../src/core/rng.js";

/** タップとタップの間の最小の時間(人の指の速さ:D-260)。 */
const MIN_TAP_GAP_MS = 250;

/** 上手・ときどき失敗の数(D-259)。 */
export const SKILLED = Object.freeze({ rate: 1, hookOk: 1, justRate: 0.7 });
export const SLOPPY = Object.freeze({ rate: 0.7, hookOk: 1, justRate: 0 });

export function makePolicy(rate, hookOk, seed, justRate = 0) {
  const r = createRng(seed * 7919 + 13);
  let hookPlan = null;
  let fightPlan = null;
  let fight = null;
  let lastTap = -Infinity;
  return (g) => {
    if (g.phase === PHASES.BITE) {
      if (hookPlan === null) hookPlan = r() < hookOk ? (r() < justRate ? "just" : "good") : "skip";
      const t = currentHookTiming(g);
      // ジャストは帯の真ん中、通常の成功は成功帯に入ってすぐ(ジャスト帯の前)。
      const at = hookPlan === "just" ? (t.justStart + t.justEnd) / 2 : Math.min(t.successStart + 10, t.justStart - 1);
      if (hookPlan !== "skip" && g.phaseMs >= at) {
        hookPlan = null;
        tap(g);
      }
      return;
    }
    hookPlan = null;
    if (g.phase === PHASES.MINIGAME) {
      if (g.fight !== fight) {
        fight = g.fight;
        lastTap = -Infinity;
      }
      if (g.phaseMs - lastTap < MIN_TAP_GAP_MS) return;
      const z = g.fight.zone;
      const p = currentMarker(g);
      if (fightPlan === "miss") {
        if (p < z.start - 0.03 || p > z.end + 0.03) {
          tap(g);
          lastTap = g.phaseMs;
          fightPlan = null;
        }
      } else if (Math.abs(p - (z.start + z.end) / 2) < 0.02) {
        if (fightPlan === null) fightPlan = r() < rate ? "hit" : "miss";
        if (fightPlan === "hit") {
          tap(g);
          lastTap = g.phaseMs;
          fightPlan = null;
        }
      }
      return;
    }
    if (g.phase === PHASES.RESTING) tap(g);
  };
}

/** 遊び方の数(SKILLED・SLOPPY)から、makePolicy を作る。 */
export function policyOf(style, seed) {
  return makePolicy(style.rate, style.hookOk, seed, style.justRate);
}
