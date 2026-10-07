// @ts-check
// グローブの見せ方(D-332〜D-334)。数と文字を作るだけで、画面の部品には触らない(テストで確かめられるように)。
// - 持ち物のカードと詳細:能力の名前と一文の説明、効果の大きさ、レア度(色と★)、グレードと対応段階(例:「磯 段階 3 まで」)。
// - 付け替えの差:能力・効果の大きさ・対応段階の違いを 1 行で。
// - ステータス:装着中のグローブの能力と効果(付けていなければ出さない)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { makeCrates } from "../core/gear.js";
import { abilityById, coverLimit, equippedGlove, gloveEffectText, gloveName, gloveRarityById, gloveRefund, GLOVE_RARITY_ROWS } from "../core/glove.js";
import { gloveBag, retryStockView } from "../core/glove_play.js";
import { stageLabel } from "./area_view.js";

/** @typedef {import("../core/glove.js").Glove} Glove */
/** @typedef {import("../core/glove.js").GloveBag} GloveBag */

/** レア度の★(ノーマル 1 〜 レジェンド 4)。 @param {string} rarityId */
function stars(rarityId) {
  return "★".repeat(Math.max(1, GLOVE_RARITY_ROWS.findIndex((r) => r.id === rarityId) + 1));
}

/**
 * 対応段階の文(例:「磯 段階 3 まで」)。いまある最後の段階をこえるときは「全部の段階(g=13 まで)」。
 * @param {any} content @param {Glove} glove
 */
export function coverText(content, glove) {
  const limit = coverLimit(glove);
  if (limit >= content.maxStage) return limit === content.maxStage ? `${stageLabel(content, limit)} まで` : `全部の段階(g=${limit} まで)`;
  return `${stageLabel(content, limit)} まで`;
}

/** グローブの持ち物(なければ空)。 @param {any} game @returns {GloveBag} */
function bagOf(game) {
  return gloveBag(game.progress) ?? { items: [], equipped: null, nextId: 1, rolls: 0 };
}

/**
 * グローブ 1 個の見せ方。
 * @param {any} game @param {Glove} glove @param {readonly { grade: number, price: number }[]} crates
 */
export function gloveView(game, glove, crates) {
  const ability = abilityById(glove.ability);
  const rarity = gloveRarityById(glove.rarity);
  const bag = bagOf(game);
  return {
    id: glove.id,
    name: gloveName(glove),
    abilityName: ability?.name ?? glove.ability,
    abilityText: ability?.text ?? "",
    effect: gloveEffectText(glove),
    rarityId: glove.rarity,
    rarity: rarity?.name ?? glove.rarity,
    stars: stars(glove.rarity),
    color: rarity?.color ?? "#ffffff",
    grade: glove.grade,
    cover: coverText(game.content, glove),
    equipped: bag.equipped === glove.id,
    locked: Boolean(glove.locked),
    refund: gloveRefund(glove, crates),
  };
}

/** レア度の並び(高いほど大きい)。 @param {string} id */
const rarityOrder = (id) => GLOVE_RARITY_ROWS.findIndex((r) => r.id === id);

/**
 * グローブの持ち物の一覧(装着中が先、そのあとレア度の高い順、新しい順)。
 * @param {any} game @param {readonly { grade: number, price: number }[]} [crates]
 */
export function gloveRows(game, crates = makeCrates(game.content, game.config)) {
  const bag = bagOf(game);
  return [...bag.items]
    .sort((a, b) => Number(b.id === bag.equipped) - Number(a.id === bag.equipped) || rarityOrder(b.rarity) - rarityOrder(a.rarity) || b.id - a.id)
    .map((g) => gloveView(game, g, crates));
}

/** 持ち物の数(「グローブ 3 / 20」)と、いっぱいか。 @param {any} game */
export function gloveSpace(game) {
  const n = bagOf(game).items.length;
  const max = game.config.glove.max;
  return { label: `グローブ ${n} / ${max}`, full: n >= max };
}

/**
 * 付け替えの差(1 行)。装着中がない・同じものなら null。
 * 例:「付け替えると 保険 → かすり・戦闘ごとに 1 回 → 外側 +20%・ダメージ 50%・磯 段階 2 まで → 磯 段階 4 まで」。
 * @param {any} game @param {Glove} glove
 */
export function gloveSwapText(game, glove) {
  const worn = equippedGlove(bagOf(game));
  if (!worn || worn.id === glove.id) return null;
  /** @type {string[]} */
  const parts = [];
  const from = abilityById(worn.ability)?.name ?? worn.ability;
  const to = abilityById(glove.ability)?.name ?? glove.ability;
  parts.push(from === to ? `能力は同じ(${to})` : `${from} → ${to}`);
  const fe = gloveEffectText(worn);
  const te = gloveEffectText(glove);
  if (fe !== te) parts.push(`${fe} → ${te}`);
  const fc = coverText(game.content, worn);
  const tc = coverText(game.content, glove);
  if (fc !== tc) parts.push(`${fc} → ${tc}`);
  return `付け替えると ${parts.join("・")}`;
}

/**
 * ステータスの「グローブ」の行(付けていなければ空)。
 * @param {any} game
 * @returns {{ label: string, value: string, detail: [string, string][] }[]}
 */
export function gloveStatusRows(game) {
  const worn = equippedGlove(bagOf(game));
  if (!worn) return [];
  const ability = abilityById(worn.ability);
  /** @type {[string, string][]} */
  const detail = [
    ["説明", ability?.text ?? ""],
    ["効果", gloveEffectText(worn)],
    ["レア度とグレード", `${stars(worn.rarity)} ${gloveRarityById(worn.rarity)?.name ?? worn.rarity}・G${worn.grade}`],
    ["対応", coverText(game.content, worn)],
  ];
  const stock = retryStockView(game);
  if (stock) detail.push(["ストック", `${stock.stock} / ${stock.max}`]);
  return [{ label: ability?.name ?? worn.ability, value: gloveEffectText(worn), detail }];
}

/**
 * 開封の演出に渡す形(gacha_fx.js の playPull と同じ形)。
 * @param {any} game @param {Glove} glove
 */
export function glovePullView(game, glove) {
  const v = gloveView(game, glove, makeCrates(game.content, game.config));
  return {
    best: v.rarityId,
    items: [
      {
        color: v.color,
        rarityId: v.rarityId,
        stars: v.stars,
        rarity: v.rarity,
        better: false,
        name: v.name,
        effect: v.effect,
        note: `G${v.grade}・${v.cover}`,
        skills: /** @type {{ text: string }[]} */ ([]),
      },
    ],
  };
}

/** 釣りの画面の小さな表示:仕切り直しのストック(「仕切り直し 2/4」)。付けていなければ null。 @param {any} game */
export function retryLabel(game) {
  const s = retryStockView(game);
  return s ? `仕切り直し ${s.stock}/${s.max}` : null;
}
