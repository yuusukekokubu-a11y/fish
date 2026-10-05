// 竿の工程(D-098・D-100・D-114)。竿は進行度の軸で、強さの効果は持たない。
// 段階ごとに「未製作 → 製作済み → ヌシ撃破 → 進化」と進む。進化すると次の段階の「未製作」になる。
// 表の最後の段階を進化したあとは「進化済み」で止まる(次の魚を足す置き場)。
// 進み具合 progress は { coins, scales: { 魚の id: 数 }, rodStage, rodStep, seen } の形。

import { DEFAULT_CONTENT, fishById } from "./fish.js";

export const ROD_STEPS = Object.freeze({
  NONE: "none", // 未製作:その段階の強い魚の鱗を貯める
  CRAFTED: "crafted", // 製作済み:ヌシに挑める
  DEFEATED: "defeated", // ヌシ撃破:進化できる
  EVOLVED: "evolved", // 進化済み:表の最後の段階でだけ使う(次の段階がない)
});

/** 数の上限。安全な整数(Number.MAX_SAFE_INTEGER)をこえないようにする(D-116)。 */
export const COUNT_MAX = Number.MAX_SAFE_INTEGER;

/** 上限つきの足し算。 */
export function addCount(a, b) {
  return Math.min(COUNT_MAX, a + b);
}

/** 持っている鱗の数。 */
export function scaleCount(progress, id) {
  return progress.scales[id] ?? 0;
}

/** 今の段階の表の行。 */
export function currentStage(progress, content = DEFAULT_CONTENT) {
  return content.stageByNumber.get(progress.rodStage);
}

/** 製作できるか(未製作で、その段階の強い魚の鱗が足りている)。 */
export function canCraft(progress, content = DEFAULT_CONTENT) {
  const s = currentStage(progress, content);
  return !!s && progress.rodStep === ROD_STEPS.NONE && scaleCount(progress, s.craft.scale) >= s.craft.count;
}

/** 製作する。できたら鱗を必要数だけ減らして「製作済み」にし、true を返す。 */
export function craftRod(progress, content = DEFAULT_CONTENT) {
  if (!canCraft(progress, content)) return false;
  const s = currentStage(progress, content);
  progress.scales[s.craft.scale] -= s.craft.count;
  progress.rodStep = ROD_STEPS.CRAFTED;
  return true;
}

/** ヌシに挑める工程か(製作済みか、ヌシ撃破)。場面の条件は fishing.js で見る。 */
export function canChallengeStep(progress) {
  return progress.rodStep === ROD_STEPS.CRAFTED || progress.rodStep === ROD_STEPS.DEFEATED;
}

/** ヌシを倒したときの工程の進み。 */
export function markBossDefeated(progress) {
  if (progress.rodStep === ROD_STEPS.CRAFTED) progress.rodStep = ROD_STEPS.DEFEATED;
}

/** 進化できるか(ヌシ撃破で、ヌシの鱗が足りている)。 */
export function canEvolve(progress, content = DEFAULT_CONTENT) {
  const s = currentStage(progress, content);
  return !!s && progress.rodStep === ROD_STEPS.DEFEATED && scaleCount(progress, s.evolve.scale) >= s.evolve.count;
}

/**
 * 進化する。ヌシの鱗を減らし、次の段階の「未製作」にする。
 * 表に次の段階がないときは「進化済み」で止まる(エラーにしない)。
 */
export function evolveRod(progress, content = DEFAULT_CONTENT) {
  if (!canEvolve(progress, content)) return false;
  const s = currentStage(progress, content);
  progress.scales[s.evolve.scale] -= s.evolve.count;
  if (content.stageByNumber.has(progress.rodStage + 1)) {
    progress.rodStage += 1;
    progress.rodStep = ROD_STEPS.NONE;
  } else {
    progress.rodStep = ROD_STEPS.EVOLVED;
  }
  return true;
}

/** 今の竿の名前。製作前は、前の段階で進化した竿(段階 1 は「はじめの釣竿」)。 */
export function rodName(progress, content = DEFAULT_CONTENT) {
  const s = currentStage(progress, content);
  if (!s) return "はじめの釣竿";
  if (progress.rodStep === ROD_STEPS.CRAFTED || progress.rodStep === ROD_STEPS.DEFEATED) {
    return `${fishById(s.craft.scale, content).name}の釣竿`;
  }
  if (progress.rodStep === ROD_STEPS.EVOLVED) return `${fishById(s.boss, content).name}の釣竿`;
  const prev = content.stageByNumber.get(progress.rodStage - 1);
  return prev ? `${fishById(prev.boss, content).name}の釣竿` : "はじめの釣竿";
}

/** 製作で作る竿の名前と、進化で作る竿の名前。 */
export function stageRodNames(stage, content = DEFAULT_CONTENT) {
  return {
    craft: `${fishById(stage.craft.scale, content).name}の釣竿`,
    evolve: `${fishById(stage.boss, content).name}の釣竿`,
  };
}

/**
 * 今の工程で次に要る鱗(画面の上に出す)。{ id, have, need } か、要るものがなければ null。
 * 未製作:その段階の強い魚の鱗。製作済み・ヌシ撃破:ヌシの鱗。
 */
export function nextNeed(progress, content = DEFAULT_CONTENT) {
  const s = currentStage(progress, content);
  if (!s) return null;
  if (progress.rodStep === ROD_STEPS.NONE) {
    return { id: s.craft.scale, have: scaleCount(progress, s.craft.scale), need: s.craft.count };
  }
  if (progress.rodStep === ROD_STEPS.CRAFTED || progress.rodStep === ROD_STEPS.DEFEATED) {
    return { id: s.evolve.scale, have: scaleCount(progress, s.evolve.scale), need: s.evolve.count };
  }
  return null;
}
