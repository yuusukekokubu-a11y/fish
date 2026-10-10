// @ts-check
// 竿の工程(製作 → ヌシ戦 → 進化)と、ヌシ・降臨に挑む(D-101・D-274・D-396)。fishing.js から分けた(800 行に余裕を持たせるため)。
// fishing.js が、ここをまとめて書き出す(画面は fishing.js から読む)。画面に関係しない計算だけを置く。

import { areaOfStage, inNewestArea } from "./areas.js";
import { refundBait } from "./bait.js";
import { makeBossCast } from "./casts.js";
import { charmEffect } from "./charms.js";
import { PHASES, refreshCombat, reresolve, startFight } from "./fishing.js";
import { canAffordRaid, kourinOf, makeRaidCast, payChallenge, summonRaid } from "./kourin.js";
import { canChallengeStep, canCraft, canEvolve, COUNT_MAX, craftRod, currentStage, evolveRod } from "./rod.js";

/** 今の段階の表の行(製作の鱗・ヌシ・進化の鱗)。 */
export function gameStage(/** @type {any} */ game) {
  return currentStage(game.progress, game.content);
}

/** いちばん新しい釣り場にいるか(製作・ヌシ戦・進化・餌はここでだけ:D-274)。 */
export function inNewestGameArea(/** @type {any} */ game) {
  return inNewestArea(game.progress, game.content);
}

/** 竿を製作できるか(いちばん新しい釣り場でだけ)。 */
export function canCraftRod(/** @type {any} */ game) {
  return inNewestGameArea(game) && canCraft(game.progress, game.content);
}

/** 竿を製作する(鱗を使う)。 */
export function craftGameRod(/** @type {any} */ game) {
  return canCraftRod(game) && craftRod(game.progress, game.content);
}

/** 竿を進化できるか(いちばん新しい釣り場でだけ)。 */
export function canEvolveRod(/** @type {any} */ game) {
  return inNewestGameArea(game) && canEvolve(game.progress, game.content);
}

/**
 * 竿を進化する。次の段階の魚は、次に投げるときから一覧に加わる。
 * 段階が進んだら、残りの餌を、進化の前の段階の価格で払い戻す(D-263)。結果は game.baitRefund({ count, coins })に置く。
 */
export function evolveGameRod(/** @type {any} */ game) {
  const before = game.progress.rodStage;
  const done = canEvolveRod(game) && evolveRod(game.progress, game.content);
  game.baitRefund = null;
  game.areaUnlocked = null;
  if (done && game.progress.rodStage !== before) {
    const refund = refundBait(game.progress, before, COUNT_MAX, game.config.formula);
    if (refund.count > 0) game.baitRefund = refund;
    // 釣り場の最後のヌシのあと:次の釣り場が解放され、そのまま移る(古い釣り場の欄は持たない:D-273)。
    const area = areaOfStage(game.content, game.progress.rodStage);
    if (area !== areaOfStage(game.content, before)) {
      delete game.progress.area;
      game.areaUnlocked = area;
      // 投げている・待っている投は、新しい釣り場の魚に決め直す(乱数は引き直さない)。
      if (game.phase === PHASES.CASTING || game.phase === PHASES.WAITING) game.cast = reresolve(game, game.cast);
      if (game.pendingCast) game.pendingCast = reresolve(game, game.pendingCast);
    }
  }
  // 段階が上がると、成長型のスキルの最大レベルが伸びる(D-167)。
  if (done) refreshCombat(game);
  return done;
}

/**
 * ヌシに挑めるか(D-101)。工程が製作済みかヌシ撃破で、魚が掛かっていない(投げる・待つの間)とき。
 */
export function canChallengeBoss(/** @type {any} */ game) {
  const phaseOk = game.phase === PHASES.CASTING || game.phase === PHASES.WAITING;
  return phaseOk && inNewestGameArea(game) && canChallengeStep(game.progress) && !!gameStage(game);
}

/**
 * ヌシに挑む。釣りを止めて、合わせなしで体力制の戦いから始める。
 * 待っていた魚は取っておき、戦いのあとにそこから続ける。負けても鱗は減らない。
 */
export function challengeBoss(/** @type {any} */ game) {
  if (!canChallengeBoss(game)) return false;
  const boss = game.content.byId.get(/** @type {any} */ (gameStage(game)).boss);
  game.pendingCast = game.cast;
  // お守り「和らぎ」:くせを弱める(D-397)。
  const soften = charmEffect(game.progress.charms, "yawaragi", true, game.config.kourin.charmK);
  game.cast = makeBossCast(boss, game.config, game.seed, game.bossAttempts, soften);
  game.bossAttempts += 1;
  game.hookGrade = null;
  game.autoHooked = false;
  startFight(game, null);
  return true;
}

/** 降臨に挑めるか(呼んでいて、魚が掛かっていない:投げる・待つの間。どの釣り場でも:D-397)。 */
export function canChallengeRaid(/** @type {any} */ game) {
  const phaseOk = game.phase === PHASES.CASTING || game.phase === PHASES.WAITING;
  return phaseOk && kourinOf(game.progress).raid !== null;
}

/** 降臨に挑む。ヌシ戦と同じく、待っていた魚は取っておき、合わせなしで戦いから始める。挑戦の回数を進める。 */
export function challengeRaid(/** @type {any} */ game) {
  if (!canChallengeRaid(game)) return false;
  const cast = makeRaidCast(game.progress, game.config, game.seed);
  if (!cast) return false;
  game.pendingCast = game.cast;
  game.cast = cast;
  /** @type {any} */ (game.progress.kourin).raid.tries += 1;
  game.hookGrade = null;
  game.autoHooked = false;
  startFight(game, null);
  return true;
}

/**
 * 降臨の相手 id に挑めるか(D-409・D-411)。投げる・待つの間だけ。その回の値段のウロコパワーがあること。
 * 呼んでいる相手なら、その相手だけ。誰も呼んでいなければ、どの相手でも(挑むときに呼び出す)。
 */
export function canStartRaid(/** @type {any} */ game, /** @type {string} */ id) {
  const phaseOk = game.phase === PHASES.CASTING || game.phase === PHASES.WAITING;
  return phaseOk && canAffordRaid(game.progress, game.content, game.config.kourin, id);
}

/** 降臨の相手 id に挑む(呼んでいなければ呼んでから。挑むたびに値段を払う:D-409・D-411)。挑めたら true。 */
export function startRaid(/** @type {any} */ game, /** @type {string} */ id) {
  if (!canStartRaid(game, id)) return false;
  const summoned = !kourinOf(game.progress).raid;
  if (summoned && !summonRaid(game.progress, id, game.content, game.config)) return false;
  if (!challengeRaid(game)) {
    if (summoned) /** @type {any} */ (game.progress.kourin).raid = null;
    return false;
  }
  payChallenge(game.progress, id, game.config.kourin);
  return true;
}
