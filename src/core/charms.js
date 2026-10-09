// @ts-check
// お守り(降臨専用の枠:D-392)。ガチャでは出ない。降臨ヌシを討伐すると、表から自分で 1 つ選んで授かる(持っていればレベル +1)。
// - 表は釣り場の数と関係のない、少ない種類(釣り場を足しても増やさない)。行は並べ替えない(保存が表の番号を使う)。
// - レベルの上限は、倒した降臨ヌシの段階まで(討伐のときに決める)。
// - 効果の大きさは、降臨の本体を作るとき(数値の見通しのあと)に決める。ここでは名前と説明だけ。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/**
 * お守りの能力の行。
 * @typedef {object} CharmRow
 * @property {string} id 保存とコードに使う名前
 * @property {string} name 画面に出す名前
 * @property {string} description 何に効くか(画面に出す)
 */

/** お守りの表(並べ替えない。足すときは最後に)。 @type {readonly CharmRow[]} */
export const CHARM_ROWS = Object.freeze([
  Object.freeze({ id: "shizume", name: "静めの守り", description: "印の動きを遅くする" }),
  Object.freeze({ id: "toki", name: "刻の守り", description: "ヌシ戦の制限時間を延ばす" }),
  Object.freeze({ id: "yaburi", name: "破りの守り", description: "ヌシへのダメージを上げる" }),
  Object.freeze({ id: "yawaragi", name: "和らぎの守り", description: "ヌシのくせを弱める" }),
]);

/**
 * お守りの持ち物:能力ごとのレベル(1 以上だけ)と、付けている能力(なければ null)。
 * @typedef {{ levels: Record<string, number>, equipped: string | null }} CharmBag
 */

/** 何も持っていないお守りの持ち物。 @returns {CharmBag} */
export function emptyCharms() {
  return { levels: {}, equipped: null };
}

/** 何も持っていない形か(保存で欄を持たないため)。 @param {CharmBag} bag */
export function isEmptyCharms(bag) {
  return bag.equipped === null && Object.values(bag.levels).every((n) => !(n > 0));
}

/** 表の行(なければ undefined)。 @param {string} id */
export function charmById(id) {
  return CHARM_ROWS.find((c) => c.id === id);
}
