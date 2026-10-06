// @ts-check
// 保存の形(版 1:D-223・D-232)。ブラウザに保存するのは画面の役目で、ここは形の変換と点検だけを行う。
// ②-4c 土台で互換性を 1 回だけ切り、版を 1 から数え直した(古い保存データと FISH2〜FISH7 は読まない)。
//
// 中身(本文)は、英小文字と数字の 36 進数で書いた数を、記号で区切った 1 行の文字列。「~」で 7 つの欄に分ける:
//   ウロコイン ~ 竿の段階.工程の番号 ~ 鱗(魚の id:数 を「,」で) ~ 釣れた魚(魚の id を「,」で)
//   ~ 引いた回数.ガチャの種.次の個体の番号 ~ 装着(種類の番号.個体の番号 を「,」で) ~ 持ち物(装備を「,」で)
// 装備 1 個:前の個体の番号との差.種類とレア度の番号.グレード.基本効果の値 のあとに、スキルを「英大文字 1 字(スキルの番号)+ レベル」で並べる。
//   例:「1.b.5.2s」+「B7C7D7」。種類とレア度の番号 = 種類の番号 × レア度の数 + レア度の番号。
// - 魚は id で書く(D-228)。鱗は持っているもの(1 以上)だけを書く。
// - 装備の種類・レア度・スキルは表の番号で書く(表の行は並べ替えない。スキルは 26 個まで:足すときは版を上げる)。
// - 点検:壊れた・切れた・範囲外・表にない魚の id や工程・重複・装着の番号が持ち物にない、を含むものは拒否する。
// 版を足すときは、SAVE_VERSION を上げ、「前の版 → 新しい版」の読み替えの関数を足す。
// tests/fixtures/compat_v1.json(互換の正解データ)が、いつまでも読めて同じ結果になることをテストで守る(DESIGN)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "./config.js";
import { DEFAULT_CONTENT } from "./fish.js";
import { effectRange, emptyGear, RARITY_ROWS } from "./gear.js";
import { COUNT_MAX, ROD_STEPS } from "./rod.js";
import { levelRange } from "./skills.js";

/** @typedef {import("./gear.js").Gear} Gear */
/** @typedef {import("./gear.js").Item} Item */

export const SAVE_VERSION = 1;

/** 工程の番号(保存に書く順。並べ替えない)。 */
export const STEP_ORDER = Object.freeze([ROD_STEPS.NONE, ROD_STEPS.CRAFTED, ROD_STEPS.DEFEATED, ROD_STEPS.EVOLVED]);

/** スキルの番号を書く文字(26 個まで)。 */
const SKILL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SEED_MAX = 4294967295;
const FIELDS = 7;

/**
 * 進み具合。
 * @typedef {object} Progress
 * @property {number} coins
 * @property {Record<string, number>} scales 魚の id ごとの鱗の数
 * @property {number} rodStage 竿の段階(通し番号)
 * @property {string} rodStep 工程
 * @property {string[]} seen 一度でも釣れた魚の id
 * @property {Gear} gear
 */

/**
 * 読むときに使う表(魚・装備の種類・スキル)。
 * @typedef {{ fish: readonly { id: string }[], byId: Map<string, unknown>, maxStage: number,
 *   equipKinds: readonly import("./gear.js").EquipKind[], skills?: readonly { id: string }[] }} SaveContent
 */

/** 初めて遊ぶときの進み具合。 @returns {Progress} */
export function initialProgress() {
  return { coins: 0, scales: {}, rodStage: 1, rodStep: ROD_STEPS.NONE, seen: [], gear: emptyGear() };
}

/** @param {number} n */
const num = (n) => n.toString(36);

/**
 * 36 進数の数を読む。形がちがう(先頭の 0・記号・大きすぎ)ときは null。
 * @param {string} text @returns {number | null}
 */
function readNum(text) {
  if (!/^[0-9a-z]{1,11}$/.test(text)) return null;
  const n = parseInt(text, 36);
  return Number.isSafeInteger(n) && n <= COUNT_MAX && num(n) === text ? n : null;
}

/** @param {SaveContent} content */
const skillTable = (content) => content.skills ?? [];

/**
 * 進み具合を、保存の本文(版 1)にする。
 * @param {Progress} progress @param {SaveContent} [content]
 */
export function encodeSave(progress, content = DEFAULT_CONTENT) {
  const gear = progress.gear ?? emptyGear();
  const kinds = content.equipKinds;
  const skills = skillTable(content);
  if (skills.length > SKILL_LETTERS.length) throw new Error("スキルが 26 個をこえた:保存の版を上げる");
  const scales = Object.entries(progress.scales)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id}:${num(n)}`)
    .join(",");
  const items = [...gear.items].sort((a, b) => a.id - b.id);
  let prev = 0;
  const itemText = items
    .map((it) => {
      const kr = kinds.findIndex((k) => k.id === it.kind) * RARITY_ROWS.length + RARITY_ROWS.findIndex((r) => r.id === it.rarity);
      const sk = it.skills.map((s) => `${SKILL_LETTERS[skills.findIndex((x) => x.id === s.id)]}${num(s.level)}`).join("");
      const text = `${num(it.id - prev)}.${num(kr)}.${num(it.grade)}.${num(it.value)}${sk}`;
      prev = it.id;
      return text;
    })
    .join(",");
  const equipped = Object.entries(gear.equipped)
    .map(([kind, id]) => `${num(kinds.findIndex((k) => k.id === kind))}.${num(id)}`)
    .join(",");
  return [
    num(progress.coins),
    `${num(progress.rodStage)}.${num(STEP_ORDER.indexOf(/** @type {any} */ (progress.rodStep)))}`,
    scales,
    progress.seen.join(","),
    `${num(gear.draws)}.${gear.seed === null ? "" : num(gear.seed)}.${num(gear.nextId)}`,
    equipped,
    itemText,
  ].join("~");
}

/** 「,」で区切った一覧(空なら空の配列)。 @param {string} text */
const list = (text) => (text === "" ? [] : text.split(","));

/**
 * 装備 1 個を読む。
 * @param {string} text @param {number} prev @param {SaveContent} content @param {typeof DEFAULT_CONFIG} config
 * @returns {Item | null}
 */
function readItem(text, prev, content, config) {
  const m = text.match(/^([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)((?:[A-Z][0-9a-z]+)*)$/);
  if (!m) return null;
  const [delta, kr, grade, value] = [m[1], m[2], m[3], m[4]].map(readNum);
  if (delta === null || kr === null || grade === null || value === null || delta < 1) return null;
  const kind = content.equipKinds[Math.floor(kr / RARITY_ROWS.length)];
  const rarity = RARITY_ROWS[kr % RARITY_ROWS.length];
  if (!kind || !rarity || grade < 1 || grade > content.maxStage) return null;
  const range = effectRange(kind, rarity, grade, config.gacha.gradeGrowth);
  if (value < range.min || value > range.max) return null;
  const skills = skillTable(content);
  const levels = levelRange(rarity.id, grade, config.skills);
  /** @type {{ id: string, level: number }[]} */
  const own = [];
  for (const [, letter, lv] of m[5].matchAll(/([A-Z])([0-9a-z]+)/g)) {
    const skill = skills[SKILL_LETTERS.indexOf(letter)];
    const level = readNum(lv);
    if (!skill || own.some((s) => s.id === skill.id) || level === null || level < levels.min || level > levels.max) return null;
    own.push({ id: skill.id, level });
  }
  // スキルの数はレア度の数まで(ノーマル 0 〜 レジェンド 3)。
  if (own.length > (rarity.skillCount ?? 0)) return null;
  return { id: prev + delta, kind: kind.id, rarity: rarity.id, grade, value, skills: own };
}

/**
 * 保存の本文(版 1)を点検して、進み具合を取り出す。成功:{ ok: true, progress }。失敗:{ ok: false }。
 * @param {string} body @param {SaveContent} [content] @param {typeof DEFAULT_CONFIG} [config]
 * @returns {{ ok: true, progress: Progress } | { ok: false }}
 */
export function decodeSave(body, content = DEFAULT_CONTENT, config = DEFAULT_CONFIG) {
  const fail = /** @type {{ ok: false }} */ ({ ok: false });
  if (typeof body !== "string") return fail;
  const parts = body.split("~");
  if (parts.length !== FIELDS) return fail;
  const [coinText, rodText, scaleText, seenText, gachaText, equipText, itemText] = parts;

  const coins = readNum(coinText);
  if (coins === null) return fail;

  const rod = rodText.split(".");
  if (rod.length !== 2) return fail;
  const stage = readNum(rod[0]);
  const stepIndex = readNum(rod[1]);
  if (stage === null || stepIndex === null || stage < 1 || stage > content.maxStage) return fail;
  const step = STEP_ORDER[stepIndex];
  // 「進化済み」は、表の最後の段階でだけありうる。
  if (!step || (step === ROD_STEPS.EVOLVED && stage !== content.maxStage)) return fail;

  /** @type {Record<string, number>} */
  const scales = {};
  for (const pair of list(scaleText)) {
    const m = pair.match(/^([a-z0-9-]+):([0-9a-z]+)$/);
    const n = m ? readNum(m[2]) : null;
    if (!m || n === null || n < 1 || !content.byId.has(m[1]) || m[1] in scales) return fail;
    scales[m[1]] = n;
  }

  const seen = list(seenText);
  if (new Set(seen).size !== seen.length || !seen.every((id) => content.byId.has(id))) return fail;

  const gacha = gachaText.split(".");
  if (gacha.length !== 3) return fail;
  const draws = readNum(gacha[0]);
  const seed = gacha[1] === "" ? null : readNum(gacha[1]);
  const nextId = readNum(gacha[2]);
  if (draws === null || nextId === null || nextId < 1 || (gacha[1] !== "" && (seed === null || seed > SEED_MAX))) return fail;

  /** @type {Item[]} */
  const items = [];
  let prev = 0;
  for (const text of list(itemText)) {
    const item = readItem(text, prev, content, config);
    if (!item) return fail;
    items.push(item);
    prev = item.id;
  }
  if (items.length > config.gacha.inventoryMax || prev >= nextId) return fail;

  /** @type {Record<string, number>} */
  const equipped = {};
  for (const pair of list(equipText)) {
    const [k, i, extra] = pair.split(".");
    const kindIndex = readNum(k ?? "");
    const itemId = readNum(i ?? "");
    const kind = kindIndex === null ? undefined : content.equipKinds[kindIndex];
    const item = items.find((it) => it.id === itemId);
    // 装着の番号は持ち物にあり、枠と種類がそろい、同じ枠は 1 回だけ。
    if (extra !== undefined || !kind || !item || item.kind !== kind.id || kind.id in equipped) return fail;
    equipped[kind.id] = item.id;
  }

  return {
    ok: true,
    progress: { coins, scales, rodStage: stage, rodStep: step, seen, gear: { items, equipped, draws, seed, nextId } },
  };
}
