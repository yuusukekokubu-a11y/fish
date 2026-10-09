// @ts-check
// お守り(降臨専用の枠:D-392)。ガチャでは出ない。降臨ヌシを討伐すると、表から自分で 1 つ選んで授かる(持っていればレベル +1)。
// - 表は釣り場の数と関係のない、少ない種類(釣り場を足しても増やさない)。行は並べ替えない(保存が表の番号を使う)。
// - 降臨の 4 キャラと 1 対 1(D-396)。レベル n のキャラを倒すと、そのキャラのお守りがレベル n になる(上限なし)。
// - 効果 = 上限 cap × L ÷(L + config.kourin.charmK)。scope が "boss" のものは、ヌシ戦と降臨だけに効く。
// - 効くのは、付けている 1 つだけ(D-397)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/**
 * お守りの能力の行。
 * @typedef {object} CharmRow
 * @property {string} id 保存とコードに使う名前
 * @property {string} name 画面に出す名前
 * @property {string} description 何に効くか(画面に出す)
 * @property {number} cap 効果の上限(割合)
 * @property {"all" | "boss"} scope どの戦いに効くか(all:どの戦いにも、boss:ヌシ戦と降臨だけ)
 */

/** お守りの表(並べ替えない。足すときは最後に)。 @type {readonly CharmRow[]} */
export const CHARM_ROWS = Object.freeze([
  Object.freeze({ id: "shizume", name: "静めの守り", description: "印の動きを遅くする", cap: 0.4, scope: "all" }),
  Object.freeze({ id: "toki", name: "刻の守り", description: "ヌシ戦と降臨の制限時間を延ばす", cap: 0.6, scope: "boss" }),
  Object.freeze({ id: "yaburi", name: "破りの守り", description: "ヌシと降臨へのダメージを上げる", cap: 0.5, scope: "boss" }),
  Object.freeze({ id: "yawaragi", name: "和らぎの守り", description: "ヌシと降臨のくせを弱める", cap: 0.6, scope: "boss" }),
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

/**
 * お守りの効果(割合)。上限 × L ÷(L + k)。レベル 0 以下なら 0。
 * @param {CharmRow} row @param {number} level @param {number} k
 */
export function charmValue(row, level, k) {
  return level > 0 ? (row.cap * level) / (level + k) : 0;
}

/**
 * 付けているお守りの効果。付けていなければ null。
 * @param {CharmBag | undefined} bag @param {number} k
 * @returns {{ id: string, level: number, value: number, scope: "all" | "boss" } | null}
 */
export function activeCharm(bag, k) {
  if (!bag || bag.equipped === null) return null;
  const row = charmById(bag.equipped);
  const level = bag.levels[bag.equipped] ?? 0;
  if (!row || !(level > 0)) return null;
  return { id: row.id, level, value: charmValue(row, level, k), scope: row.scope };
}

/**
 * ヌシ戦と降臨(boss が true)で、付けているお守り id の効果。効かなければ 0。
 * @param {CharmBag | undefined} bag @param {string} id @param {boolean} boss @param {number} k
 */
export function charmEffect(bag, id, boss, k) {
  const a = activeCharm(bag, k);
  if (!a || a.id !== id || (a.scope === "boss" && !boss)) return 0;
  return a.value;
}

/**
 * お守りを付ける(持っているものだけ)。null で外す。付けられたら true。
 * @param {CharmBag} bag @param {string | null} id
 */
export function equipCharm(bag, id) {
  if (id !== null && !(bag.levels[id] > 0)) return false;
  bag.equipped = id;
  return true;
}
