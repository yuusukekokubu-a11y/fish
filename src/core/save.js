// @ts-check
// 保存の形(版 4:D-223・D-232・D-247・D-267・D-280)。ブラウザに保存するのは画面の役目で、ここは形の変換と点検だけを行う。
// ②-4c 土台で互換性を 1 回だけ切り、版を 1 から数え直した(古い保存データと FISH2〜FISH7 は読まない)。
//
// 中身(本文)は、英小文字と数字の 36 進数で書いた数を、記号で区切った 1 行の文字列。「~」で 10 の欄に分ける:
//   ウロコイン ~ 竿の段階.工程の番号 ~ 鱗(魚の id:数 を「,」で) ~ 釣れた魚(魚の id を「,」で)
//   ~ 引いた回数.ガチャの種.次の個体の番号 ~ 装着(種類の番号.個体の番号 を「,」で) ~ 持ち物(装備を「,」で)
//   ~ ロック(持ち物の順に、1 個 1 字で「1」ロック中・「0」ロックなし。版 2 で足した:D-247)
//   ~ 餌の所持数.餌を使うスイッチ(0/1).自動分解の設定の番号(AUTO_SCRAP_ROWS の順。版 3 で足した:D-267)
//   ~ いまいる釣り場の id(古い釣り場にいるときだけ。いちばん新しい釣り場なら空。版 4 で足した:D-280)
// 装備 1 個:前の個体の番号との差.種類とレア度の番号.グレード.基本効果の値 のあとに、スキルを「英大文字 1 字(スキルの番号)+ レベル」で並べる。
//   例:「1.b.5.2s」+「B7C7D7」。種類とレア度の番号 = 種類の番号 × レア度の数 + レア度の番号。
// - 魚は id で書く(D-228)。鱗は持っているもの(1 以上)だけを書く。
// - 装備の種類・レア度・スキルは表の番号で書く(表の行は並べ替えない。スキルは 26 個まで:足すときは版を上げる)。
// - 点検:壊れた・切れた・範囲外・表にない魚の id や工程・重複・装着の番号が持ち物にない、を含むものは拒否する。
// 版を足すときは、SAVE_VERSION を上げ、「前の版 → 新しい版」の読み替えの関数を UPGRADES に足す(本文の文字列を 1 版だけ進める)。
// 古い版の本文は、読み替えを順に通して今の版にしてから点検する。書くのは今の版だけ。
// tests/fixtures/compat_v1.json(互換の正解データ)が、いつまでも読めて同じ結果になることをテストで守る(DESIGN)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "./config.js";
import { DEFAULT_CONTENT } from "./fish.js";
import { AUTO_SCRAP_ROWS, effectRange, emptyGear, RARITY_ROWS } from "./gear.js";
import { COUNT_MAX, ROD_STEPS } from "./rod.js";
import { itemLevelRange } from "./skills.js";

/** @typedef {import("./gear.js").Gear} Gear */
/** @typedef {import("./gear.js").Item} Item */

export const SAVE_VERSION = 4;

/** 工程の番号(保存に書く順。並べ替えない)。 */
export const STEP_ORDER = Object.freeze([ROD_STEPS.NONE, ROD_STEPS.CRAFTED, ROD_STEPS.DEFEATED, ROD_STEPS.EVOLVED]);

/** スキルの番号を書く文字(26 個まで)。 */
const SKILL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SEED_MAX = 4294967295;
const FIELDS = 10;

/**
 * 進み具合。
 * @typedef {object} Progress
 * @property {number} coins
 * @property {Record<string, number>} scales 魚の id ごとの鱗の数
 * @property {number} rodStage 竿の段階(通し番号)
 * @property {string} rodStep 工程
 * @property {string[]} seen 一度でも釣れた魚の id
 * @property {Gear} gear
 * @property {number} [bait] 餌の所持数(1 以上のときだけ持つ:D-263・D-269)
 * @property {boolean} [useBait] 餌を使うスイッチ(入っているときだけ持つ)
 * @property {string} [autoScrap] 自動分解の設定(オフでないときだけ持つ:D-266)
 * @property {string} [area] いまいる釣り場の id(古い釣り場にいるときだけ持つ:D-280)
 */

/**
 * 読むときに使う表(魚・装備の種類・スキル)。
 * @typedef {{ fish: readonly { id: string }[], byId: Map<string, unknown>, maxStage: number,
 *   equipKinds: readonly import("./gear.js").EquipKind[], skills?: readonly { id: string, type?: string }[],
 *   areas?: readonly import("./areas.js").AreaRow[], stageByNumber?: Map<number, unknown> }} SaveContent
 */

/** 「,」で区切った一覧(空なら空の配列)。 @param {string} text */
const list = (text) => (text === "" ? [] : text.split(","));

/**
 * 読み替えの関数(D-247)。UPGRADES[v] は、版 v の本文を版 v + 1 の本文にする。形がちがえば null。
 * 中身の点検は、今の版になってから decodeSave が行う。
 * 版 3 → 4 だけは、表(content)を見る(頭打ち型のスキルと、次の段階の有無)。
 * @type {Readonly<Record<number, (body: string, content: SaveContent) => string | null>>}
 */
export const UPGRADES = Object.freeze({
  // 版 1 → 2:ロックの欄を足す(全てロックなし)。
  1: (body) => {
    const parts = body.split("~");
    if (parts.length !== 7) return null;
    return [...parts, "0".repeat(list(parts[6]).length)].join("~");
  },
  // 版 2 → 3:餌と自動分解の欄を足す(餌 0・スイッチはオフ・自動分解はオフ:D-267)。
  2: (body) => {
    const parts = body.split("~");
    if (parts.length !== 8) return null;
    return [...parts, "0.0.0"].join("~");
  },
  // 版 3 → 4(D-280):いまいる釣り場の欄を足す(空 = 竿の段階が属する釣り場)。
  // 頭打ち型のスキルは Lv1 に丸める(D-279)。表の最後で「進化済み」だった竿は、表に次の段階があれば、その段階の未製作にする
  // (港の 5 段階目の進化は、いまは磯の解放になる:D-273)。
  3: (body, content) => {
    const parts = body.split("~");
    if (parts.length !== 9) return null;
    const rod = parts[1].split(".");
    const stage = readNum(rod[0] ?? "");
    if (rod.length === 2 && rod[1] === "3" && stage !== null && content.stageByNumber?.has(stage + 1)) parts[1] = `${num(stage + 1)}.0`;
    const skills = skillTable(content);
    parts[6] = parts[6].replace(/([A-Z])([0-9a-z]+)/g, (m, letter) => (skills[SKILL_LETTERS.indexOf(letter)]?.type === "capped" ? `${letter}1` : m));
    return [...parts, ""].join("~");
  },
});

/**
 * 版 version の本文を、今の版の本文にする。読めない版・形がちがうときは null。
 * @param {string} body @param {number} version @param {SaveContent} [content]
 */
export function upgradeSave(body, version, content = DEFAULT_CONTENT) {
  if (!Number.isInteger(version) || version < 1 || version > SAVE_VERSION) return null;
  /** @type {string | null} */
  let text = body;
  for (let v = version; v < SAVE_VERSION && text !== null; v++) text = UPGRADES[v](text, content);
  return text;
}

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
 * 進み具合を、保存の本文(今の版)にする。
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
    items.map((it) => (it.locked ? "1" : "0")).join(""),
    `${num(progress.bait ?? 0)}.${progress.useBait ? 1 : 0}.${num(Math.max(0, AUTO_SCRAP_ROWS.findIndex((r) => r.id === (progress.autoScrap ?? "off"))))}`,
    progress.area ?? "",
  ].join("~");
}

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
  /** @type {{ id: string, level: number }[]} */
  const own = [];
  for (const [, letter, lv] of m[5].matchAll(/([A-Z])([0-9a-z]+)/g)) {
    const skill = skills[SKILL_LETTERS.indexOf(letter)];
    const level = readNum(lv);
    // 頭打ち型は Lv1 だけ(D-279)。成長型は、レア度とグレードの範囲の中。
    const levels = itemLevelRange(skill, rarity.id, grade, config.skills);
    if (!skill || own.some((s) => s.id === skill.id) || level === null || level < levels.min || level > levels.max) return null;
    own.push({ id: skill.id, level });
  }
  // スキルの数はレア度の数まで(ノーマル 0 〜 レジェンド 3)。
  if (own.length > (rarity.skillCount ?? 0)) return null;
  return { id: prev + delta, kind: kind.id, rarity: rarity.id, grade, value, skills: own };
}

/**
 * 保存の本文(今の版。古い版は upgradeSave を通してから)を点検して、進み具合を取り出す。成功:{ ok: true, progress }。失敗:{ ok: false }。
 * @param {string} body @param {SaveContent} [content] @param {typeof DEFAULT_CONFIG} [config]
 * @returns {{ ok: true, progress: Progress } | { ok: false }}
 */
export function decodeSave(body, content = DEFAULT_CONTENT, config = DEFAULT_CONFIG) {
  const fail = /** @type {{ ok: false }} */ ({ ok: false });
  if (typeof body !== "string") return fail;
  const parts = body.split("~");
  if (parts.length !== FIELDS) return fail;
  const [coinText, rodText, scaleText, seenText, gachaText, equipText, itemText, lockText, baitText, areaText] = parts;

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
  // ロック:持ち物と同じ数の「0」「1」だけ。ロック中のときだけ locked: true を持つ(D-247)。
  if (!/^[01]*$/.test(lockText) || lockText.length !== items.length) return fail;
  items.forEach((it, i) => {
    if (lockText[i] === "1") it.locked = true;
  });

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

  // 餌と自動分解(D-267):所持数は 0〜上限、スイッチは 0 か 1、設定は表の番号。既定の値は欄を持たない(D-269)。
  const bait = baitText.split(".");
  if (bait.length !== 3) return fail;
  const baitCount = readNum(bait[0]);
  const scrapIndex = readNum(bait[2]);
  const scrap = scrapIndex === null ? undefined : AUTO_SCRAP_ROWS[scrapIndex];
  if (baitCount === null || baitCount > config.bait.max || (bait[1] !== "0" && bait[1] !== "1") || !scrap) return fail;

  /** @type {Progress} */
  const progress = { coins, scales, rodStage: stage, rodStep: step, seen, gear: { items, equipped, draws, seed, nextId } };
  if (baitCount > 0) progress.bait = baitCount;
  if (bait[1] === "1") progress.useBait = true;
  if (scrap.id !== "off") progress.autoScrap = scrap.id;

  // いまいる釣り場(D-280):空か、表にあり、解放済み(最初の段階が竿の段階以下)の釣り場。
  // いちばん新しい釣り場なら欄を持たない(書くときも空にする)。
  if (areaText !== "") {
    const areas = content.areas ?? [];
    const area = areas.find((a) => a.id === areaText);
    if (!area || area.firstStage > stage) return fail;
    const newest = areas.find((a) => stage >= a.firstStage && stage < a.firstStage + a.stages);
    if (area !== newest) progress.area = area.id;
  }
  return { ok: true, progress };
}
