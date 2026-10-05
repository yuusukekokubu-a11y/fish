// 竿の強化(D-033・D-041・D-047)。素材を使って、確実に段階を上げる。

/** 今の段階から 1 つ上げるのに必要な素材の数。上限のときは null。 */
export function upgradeCost(rodStage, rodConfig) {
  if (rodStage >= rodConfig.maxStage) return null;
  return rodConfig.upgradeCosts[rodStage - 1];
}

/** 強化できるか(上限でなく、素材が足りている)。 */
export function canUpgrade(progress, rodConfig) {
  const cost = upgradeCost(progress.rodStage, rodConfig);
  return cost !== null && progress.material >= cost;
}

/** 強化する。できたら素材を減らして段階を上げ、true を返す。できなければ何も変えず false。 */
export function upgradeRod(progress, rodConfig) {
  if (!canUpgrade(progress, rodConfig)) return false;
  progress.material -= upgradeCost(progress.rodStage, rodConfig);
  progress.rodStage += 1;
  return true;
}
