// @ts-check
// クレートと装備の画面の中身(画面に触らない部分:D-139・D-162)。
// ここは数と文字を作るだけ。ボタンや演出は gear_tabs.js・gacha_fx.js が受け持つ。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144)。

import {
  effectDiff,
  effectRange,
  equippedItem,
  isEquipped,
  itemName,
  kindById,
  formatEffect,
  pullBlocker,
  rarityById,
  RARITY_ROWS,
  refundFor,
} from "../core/gear.js";
import { formatCount } from "./format.js";
import { itemSkillLines, skillLevelChanges } from "./skill_view.js";

/** @typedef {import("../core/gear.js").Item} Item */
/** @typedef {import("../core/gear.js").Crate} Crate */
/** @typedef {import("../core/gear.js").Gear} Gear */
/** @typedef {import("../core/gear.js").GachaConfig} GachaConfig */
/** @typedef {import("../core/gear.js").ContentLike} ContentLike */

/**
 * タブが読むゲームの状態(fishing.js の createGame の一部)。
 * @typedef {object} GameLike
 * @property {{ coins: number, rodStage: number, gear: Gear }} progress
 * @property {ContentLike} content
 * @property {{ gacha: GachaConfig, skills?: import("../core/skills.js").SkillConfig }} config
 */

/**
 * レア度の★(ノーマル ★、レア ★★、エピック ★★★、レジェンド ★★★★)。色だけに頼らない(D-154)。
 * @param {string} rarityId
 */
export function rarityStars(rarityId) {
  const index = RARITY_ROWS.findIndex((r) => r.id === rarityId);
  return "★".repeat(Math.max(1, index + 1));
}

/** 引けない理由の短い文(画面に出す)。 */
export const PULL_MESSAGES = Object.freeze({
  count: "引ける回数がちがいます",
  locked: "まだ引けません",
  seed: "準備中です",
  coins: "ウロコインが足りません",
  space: "持ち物がいっぱいです。装備の画面で分解してください",
});

/** 千分率を「22%」「6.5%」の形に。 @param {number} rate */
export function formatRate(rate) {
  return `${Math.round(rate) / 10}%`;
}

/**
 * クレートタブの 1 枚(段階の新しい順に並べる)。解放済みのクレートだけ。
 * @param {GameLike} game @param {Crate[]} crates
 */
export function crateCards(game, crates) {
  const { progress, content, config } = game;
  return crates
    .filter((c) => progress.rodStage >= c.stage)
    .sort((a, b) => b.stage - a.stage)
    .map((crate) => ({
      crate,
      name: crate.name,
      price: { one: formatCount(crate.price), ten: formatCount(crate.price * 10) },
      blockers: {
        one: pullBlocker(progress, crate, 1, config.gacha),
        ten: pullBlocker(progress, crate, 10, config.gacha),
      },
      rates: crate.rarities.map((r) => ({
        id: r.id,
        name: r.name,
        stars: rarityStars(r.id),
        color: r.color,
        rate: formatRate(r.rate),
        // そのレア度に付くスキルの数(D-207)。
        skills: r.skillCount ?? 0,
        skillsText: (r.skillCount ?? 0) === 0 ? "スキルなし" : `スキル ${r.skillCount} つ`,
      })),
      kinds: content.equipKinds.map((k) => {
        const low = effectRange(k, crate.rarities[0], crate.grade, config.gacha.gradeGrowth);
        const high = effectRange(k, crate.rarities[crate.rarities.length - 1], crate.grade, config.gacha.gradeGrowth);
        return { id: k.id, name: k.name, range: formatRange(k, low.min, high.max) };
      }),
    }));
}

/**
 * 基本効果の範囲の文(例:「制限時間 +0.5〜+3.2 秒」)。
 * @param {import("../core/gear.js").EquipKind} kind @param {number} min @param {number} max
 */
export function formatRange(kind, min, max) {
  /** @param {number} v */
  const n = (v) => Math.round((v / kind.display.scale) * 1000) / 1000;
  return `${kind.display.label} +${n(min)}〜+${n(max)}${kind.display.unit}`;
}

/** 持ち物の数。 @param {GameLike} game */
export function inventoryLabel(game) {
  return `持ち物 ${game.progress.gear.items.length} / ${game.config.gacha.inventoryMax}`;
}

/** 持ち物の空き(「あと 12 個」)。 @param {GameLike} game */
export function inventorySpaceLabel(game) {
  const left = Math.max(0, game.config.gacha.inventoryMax - game.progress.gear.items.length);
  return left === 0 ? "持ち物がいっぱいです" : `持ち物 あと ${left} 個`;
}

/** 差(+/−)の文。 @param {import("../core/gear.js").EquipKind} kind @param {number} diff */
export function formatDiff(kind, diff) {
  if (diff === 0) return "±0";
  const n = Math.round((diff / kind.display.scale) * 1000) / 1000;
  return `${diff > 0 ? "+" : "−"}${Math.abs(n)}${kind.display.unit}`;
}

/**
 * 装備 1 個の見せ方。better は、いま付けている同じ種類の装備より基本効果が高いとき(▲)。
 * skillChanges は、付けた(装着中なら外した)ときのスキルレベルの変化(例:「会心率 Lv2→Lv3」)。
 * @param {GameLike} game @param {Item} item @param {Crate[]} crates
 */
export function itemView(game, item, crates) {
  const { content, progress } = game;
  const kind = kindById(item.kind, content.equipKinds);
  const rarity = rarityById(item.rarity, RARITY_ROWS);
  const diff = effectDiff(progress.gear, item);
  const equipped = isEquipped(progress.gear, item.id);
  return {
    id: item.id,
    name: itemName(item, content),
    kindName: kind ? kind.name : item.kind,
    rarityId: item.rarity,
    rarity: rarity ? rarity.name : item.rarity,
    stars: rarityStars(item.rarity),
    kind: item.kind,
    color: rarity ? rarity.color : "#ffffff",
    effect: kind ? formatEffect(kind, item.value) : String(item.value),
    grade: item.grade,
    equipped,
    better: !equipped && diff > 0,
    diff: kind ? formatDiff(kind, diff) : String(diff),
    diffSign: Math.sign(diff),
    refund: refundFor(item, crates),
    // スキルの欄(1 個に最大 3 行。名前とポイント:D-179)。
    skills: itemSkillLines(item, content.skills),
    skillChanges: skillLevelChanges(game, item),
  };
}

/** レア度の並び(高いほど大きい)。 @param {string} id */
function rarityOrder(id) {
  return RARITY_ROWS.findIndex((r) => r.id === id);
}

/**
 * 持ち物の一覧。sort は "rarity"(レア度の高い順、同じなら効果の大きい順)か "new"(新しい順)。
 * kind を渡すと、その種類だけに絞り込む(null ならすべて)。
 * @param {GameLike} game @param {Crate[]} crates @param {"rarity" | "new"} sort @param {string | null} [kind]
 */
export function inventoryRows(game, crates, sort, kind = null) {
  const items = game.progress.gear.items.filter((it) => kind === null || it.kind === kind);
  if (sort === "rarity") {
    items.sort((a, b) => rarityOrder(b.rarity) - rarityOrder(a.rarity) || b.grade - a.grade || b.value - a.value || b.id - a.id);
  } else {
    items.sort((a, b) => b.id - a.id);
  }
  return items.map((it) => itemView(game, it, crates));
}

/** 装着の 3 枠(種類の表の順)。 @param {GameLike} game @param {Crate[]} crates */
export function slotRows(game, crates) {
  return game.content.equipKinds.map((kind) => {
    const item = equippedItem(game.progress.gear, kind.id);
    return { kind: kind.id, kindName: kind.name, item: item ? itemView(game, item, crates) : null };
  });
}

/**
 * まとめて分解の一覧(レア度ごとに、何個・いくら戻るか。装着中は除く)。
 * @param {GameLike} game @param {Crate[]} crates
 */
export function bulkDismantleRows(game, crates) {
  return RARITY_ROWS.map((r) => {
    const preview = bulkDismantlePreview(game, crates, r.id);
    return { id: r.id, name: r.name, stars: rarityStars(r.id), color: r.color, ...preview };
  });
}

/**
 * まとめて分解の見込み(装着中を除く)。{ count, coins }。
 * @param {GameLike} game @param {Crate[]} crates @param {string} rarityId
 */
export function bulkDismantlePreview(game, crates, rarityId) {
  const targets = game.progress.gear.items.filter((it) => it.rarity === rarityId && !isEquipped(game.progress.gear, it.id));
  return { count: targets.length, coins: targets.reduce((s, it) => s + refundFor(it, crates), 0) };
}

/**
 * 引いた結果の一覧の見せ方。一番良いレア度(best)を強調する。▲ は引く前の装着と比べる。
 * @param {GameLike} game @param {Item[]} items @param {Crate[]} crates
 */
export function pullResultView(game, items, crates) {
  const views = items.map((it) => itemView(game, it, crates));
  const best = views.reduce((b, v) => (rarityOrder(v.rarityId) > rarityOrder(b.rarityId) ? v : b), views[0]);
  return { items: views, best: best ? best.rarityId : "normal" };
}
