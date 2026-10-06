// @ts-check
// 戦闘の画面の小さな表示(D-191)。連撃の段数と、いま効いている条件発動型の短い名前を作る(画面に触らない)。
// 説明の文章は置かず、短い名前だけ。条件発動型のスキルを持っていない条件は出さない。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/** 条件の短い名前(スキルの表の when と同じ名前)。 */
export const TRIGGER_LABELS = Object.freeze({
  combo: "連撃",
  firstHit: "先手",
  just: "ジャスト",
  afterCrit: "勢い",
  fullHp: "先制",
  lowHp: "とどめ",
});

/**
 * ゲージに重ねる芯・縁の帯(D-197・D-209)。芯か縁のスキルを付けているときだけ、その帯の割合を返す(付けていなければ null)。
 * 割合は、命中範囲の中心からの距離(端が 1)。芯は coreRatio 以下、縁は edgeRatio 以上。
 * @param {{ triggers?: Record<string, any>, config: { skills: { coreRatio: number, edgeRatio: number } } } | null} game
 * @returns {{ core: number | null, edge: number | null } | null}
 */
export function gaugeBands(game) {
  const t = game?.triggers ?? {};
  if (!game || (!t.core && !t.edge)) return null;
  const { coreRatio, edgeRatio } = game.config.skills;
  return { core: t.core ? coreRatio : null, edge: t.edge ? edgeRatio : null };
}

/**
 * 戦闘中の表示。combo は「連撃 ×3」の文(2 段以上のときだけ)、labels は次の命中で効く条件の名前。
 * @param {{ fight: any, triggers?: Record<string, any>, config: { skills: { comboMax: number, lowHpRatio: number } } } | null} game
 * @returns {{ combo: string | null, labels: string[] }}
 */
export function fightBadges(game) {
  const fight = game?.fight;
  if (!fight) return { combo: null, labels: [] };
  const t = game.triggers ?? {};
  const { comboMax, lowHpRatio } = game.config.skills;
  const n = Math.min(fight.combo ?? 0, comboMax);
  /** @type {string[]} */
  const labels = [];
  const boosts = /** @type {{ id: string }[]} */ (fight.boosts ?? []);
  if (boosts.some((b) => b.id === "first-hit")) labels.push(TRIGGER_LABELS.firstHit);
  if (boosts.some((b) => b.id === "momentum")) labels.push(TRIGGER_LABELS.afterCrit);
  if (t.fullHp && fight.hp >= fight.maxHp && fight.hits === 0) labels.push(TRIGGER_LABELS.fullHp);
  if (t.lowHp && fight.hp <= fight.maxHp * lowHpRatio) labels.push(TRIGGER_LABELS.lowHp);
  return { combo: n >= 2 ? `連撃 ×${n}` : null, labels };
}
