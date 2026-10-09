// @ts-check
// 保存の形(版 9:D-223・D-232・D-247・D-267・D-280・D-300・D-325・D-335・D-392・D-397)。ブラウザに保存するのは画面の役目で、ここは形の変換と点検だけを行う。
// ②-4c 土台で互換性を 1 回だけ切り、版を 1 から数え直した(古い保存データと FISH2〜FISH7 は読まない)。
//
// 中身(本文)は、英小文字と数字の 36 進数で書いた数を、記号で区切った 1 行の文字列。「~」で 15 の欄に分ける:
//   ウロコイン ~ 竿の段階.工程の番号 ~ 鱗(魚の id:数 を「,」で) ~ 釣れた魚(魚の id を「,」で)
//   ~ 引いた回数.ガチャの種.次の個体の番号 ~ 装着(種類の番号.個体の番号 を「,」で) ~ 持ち物(装備を「,」で)
//   ~ ロック(持ち物の順に、1 個 1 字で「1」ロック中・「0」ロックなし。版 2 で足した:D-247)
//   ~ 餌の所持数.餌を使うスイッチ(0/1).自動分解の設定の番号(AUTO_SCRAP_ROWS の順。版 3 で足した:D-267)
//   ~ いまいる釣り場の id(古い釣り場にいるときだけ。いちばん新しい釣り場なら空。版 4 で足した:D-280)
//   ~ 出会ったスキル(スキルの表の順の印。表の i 番目に出会っていれば 2 の i 乗を足した数。版 5 で足した:D-300)
//   ~ 釣れるクレートの判定の回数.グローブの次の個体の番号.装着中のグローブの番号(なければ空)(版 7 で足した:D-335)
//   ~ グローブの持ち物(「,」で。1 個:前の個体の番号との差.能力とレア度の番号.グレード、ロック中は最後に「.1」)
//     能力とレア度の番号 = 能力の番号 × レア度の数 + レア度の番号(glove.js の表の順)。
//   ~ 降臨:ゲージ.鱗から入れた分.キャラごとの倒したレベル(kourin.js の表の順に「,」。最後の 0 は書かない)
//     .呼んでいるキャラの番号.残りの体力.挑戦の回数.払った区切りの数(呼んでいなければ、あとの 4 つは空。版 8 で足し、版 9 で形を変えた:D-397)
//     ゲージと鱗から入れた分は、1 点 = config.kourin.unit の整数。
//   ~ お守り:付けている能力の番号(なければ空).能力ごとのレベルを表の順に「,」で(最後の 0 は書かない。charms.js の表の順)
// 装備の種類の番号 5(お守り)は、版 8 からは装備の個体を持たない(ガチャで出ない降臨専用の枠:D-392)。
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
import { AUTO_SCRAP_ROWS, effectRange, emptyGear, makeCrates, RARITY_ROWS, refundFor } from "./gear.js";
import { CHARM_ROWS, emptyCharms, isEmptyCharms } from "./charms.js";
import { emptyKourin, isEmptyKourin, KOURIN_ROWS } from "./kourin.js";
import { abilityAllows, emptyGloves, GLOVE_ABILITY_ROWS, GLOVE_RARITY_ROWS } from "./glove.js";
import { COUNT_MAX, ROD_STEPS } from "./rod.js";
import { itemLevelRange } from "./skills.js";

/** @typedef {import("./gear.js").Gear} Gear */
/** @typedef {import("./gear.js").Item} Item */

export const SAVE_VERSION = 9;

/** 工程の番号(保存に書く順。並べ替えない)。 */
export const STEP_ORDER = Object.freeze([ROD_STEPS.NONE, ROD_STEPS.CRAFTED, ROD_STEPS.DEFEATED, ROD_STEPS.EVOLVED]);

/** スキルの番号を書く文字(26 個まで)。 */
const SKILL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SEED_MAX = 4294967295;
const FIELDS = 15;

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
 * @property {string[]} [skillsSeen] 出会ったスキルの id(スキルの表の順。1 つ以上のときだけ持つ:D-300)
 * @property {import("./glove.js").GloveBag} [gloves] グローブの持ち物(既定の形でないときだけ持つ:D-335)
 * @property {KourinState} [kourin] 降臨のゲージと、呼び出したヌシ(既定の形でないときだけ持つ:D-392)
 * @property {import("./charms.js").CharmBag} [charms] お守り(何か持っているときだけ持つ:D-392)
 */

/** 降臨の状態(D-396・D-397)。 @typedef {import("./kourin.js").KourinState} KourinState */

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
 * 版 3 → 4 は、表(content)を見る(頭打ち型のスキルと、次の段階の有無)。版 7 → 8 は、数値の表(config)も見る(払い戻し)。
 * @type {Readonly<Record<number, (body: string, content: SaveContent, config: typeof DEFAULT_CONFIG) => string | null>>}
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
  // 版 4 → 5(D-300):出会ったスキルの欄を足す。持ち物の装備(装着中を含む)に付いているスキルを「出会った」にする
  // (読み替えのあとに NEW が一斉に出ないように)。
  4: (body) => {
    const parts = body.split("~");
    if (parts.length !== 10) return null;
    let mask = 0;
    const seen = new Set();
    for (const [, letter] of parts[6].matchAll(/([A-Z])[0-9a-z]+/g)) {
      const i = SKILL_LETTERS.indexOf(letter);
      if (!seen.has(i)) mask += 2 ** i;
      seen.add(i);
    }
    return [...parts, num(mask)].join("~");
  },
  // 版 5 → 6(D-325):装着の枠が 6 つになった(おもり・浮き・おまもりを装備の種類の表の最後に足した)。
  // 装着と持ち物は種類の表の番号で書くので、本文の形は同じ(新しい枠は空)。版で区切るのは、版 5 までの読み手が
  // 新しい種類の番号を読めないため(版がちがう、として断れるように)。
  5: (body) => (body.split("~").length === 11 ? body : null),
  // 版 6 → 7(D-335):グローブの欄を 2 つ足す(判定 0 回・次の番号 1・装着なし・持ち物なし)。
  6: (body) => (body.split("~").length === 11 ? `${body}~0.1.~` : null),
  // 版 7 → 8(D-392):おもりとお守りの役目を入れ替える。
  // - おもり(種類 3:印を遅くする)の装備は、取り除いて払い戻しのウロコインに換える(ロック中でも。装着中なら外す)。
  // - おまもり(種類 5:ウロコイン +%)の装備は、種類 3(おもり。版 8 ではウロコイン +%)に変える(値の範囲は同じ)。
  // - 降臨とお守りの欄を足す(ゲージ 0・呼び出しなし・お守りなし)。
  7: (body, content, config) => {
    const parts = body.split("~");
    if (parts.length !== 13) return null;
    const R = RARITY_ROWS.length;
    const crates = /** @type {any} */ (content).stages ? makeCrates(/** @type {any} */ (content), config) : [];
    const items = list(parts[6]);
    if (parts[7].length !== items.length) return null;
    let refund = 0;
    let carry = 0; // 取り除いた装備の番号の差(次の装備の差に足す)
    const kept = [];
    const locks = [];
    for (let i = 0; i < items.length; i++) {
      const m = items[i].match(/^([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)\.(.*)$/);
      const delta = m ? readNum(m[1]) : null;
      const kr = m ? readNum(m[2]) : null;
      const grade = m ? readNum(m[3]) : null;
      if (!m || delta === null || kr === null || grade === null) return null;
      const kind = Math.floor(kr / R);
      if (kind === 3) {
        refund += refundFor({ id: 0, kind: "weight", rarity: RARITY_ROWS[kr % R]?.id ?? "", grade, value: 0, skills: [] }, crates);
        carry += delta;
        continue;
      }
      const newKr = kind === 5 ? 3 * R + (kr % R) : kr;
      kept.push(`${num(delta + carry)}.${num(newKr)}.${m[3]}.${m[4]}`);
      locks.push(parts[7][i]);
      carry = 0;
    }
    const equipped = list(parts[5]).flatMap((pair) => {
      const [k, id] = pair.split(".");
      if (k === "3") return [];
      return [k === "5" ? `3.${id}` : pair];
    });
    const coins = readNum(parts[0]);
    if (coins === null) return null;
    parts[0] = num(Math.min(COUNT_MAX, coins + refund));
    parts[5] = equipped.join(",");
    parts[6] = kept.join(",");
    parts[7] = locks.join("");
    return [...parts, "0...", "."].join("~");
  },
  // 版 8 → 9(D-397):降臨の欄の形を変えた(4 キャラのレイド)。版 8 では降臨で遊べなかったので、空の形にする。
  8: (body) => {
    const parts = body.split("~");
    if (parts.length !== 15) return null;
    parts[13] = "0.0.....";
    return parts.join("~");
  },
});

/**
 * 版 version の本文を、今の版の本文にする。読めない版・形がちがうときは null。
 * @param {string} body @param {number} version @param {SaveContent} [content] @param {typeof DEFAULT_CONFIG} [config]
 */
export function upgradeSave(body, version, content = DEFAULT_CONTENT, config = DEFAULT_CONFIG) {
  if (!Number.isInteger(version) || version < 1 || version > SAVE_VERSION) return null;
  /** @type {string | null} */
  let text = body;
  for (let v = version; v < SAVE_VERSION && text !== null; v++) text = UPGRADES[v](text, content, config);
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
 * 出会ったスキルの印(表の i 番目に出会っていれば 2 の i 乗を足す:D-300)。表にない id は無視する。
 * @param {readonly string[]} ids @param {readonly { id: string }[]} skills
 */
function seenMask(ids, skills) {
  return skills.reduce((m, s, i) => (ids.includes(s.id) ? m + 2 ** i : m), 0);
}

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
    num(seenMask(progress.skillsSeen ?? [], skills)),
    ...encodeGloves(progress.gloves ?? emptyGloves()),
    encodeKourin(progress.kourin ?? emptyKourin()),
    encodeCharms(progress.charms ?? emptyCharms()),
  ].join("~");
}

/** 降臨の欄(D-397)。 @param {KourinState} k */
function encodeKourin(k) {
  const cleared = KOURIN_ROWS.map((r) => num(k.cleared[r.id] ?? 0));
  while (cleared.length > 0 && cleared[cleared.length - 1] === "0") cleared.pop();
  const raid = k.raid;
  const tail = raid ? `${num(KOURIN_ROWS.findIndex((r) => r.id === raid.char))}.${num(raid.hp)}.${num(raid.tries)}.${num(raid.paid)}` : "...";
  return `${num(k.gauge)}.${num(k.fromScales)}.${cleared.join(",")}.${tail}`;
}

/** お守りの欄(D-392)。 @param {import("./charms.js").CharmBag} bag */
function encodeCharms(bag) {
  const levels = CHARM_ROWS.map((c) => num(bag.levels[c.id] ?? 0));
  while (levels.length > 0 && levels[levels.length - 1] === "0") levels.pop();
  const eq = bag.equipped === null ? "" : num(CHARM_ROWS.findIndex((c) => c.id === bag.equipped));
  return `${eq}.${levels.join(",")}`;
}

/**
 * 降臨の欄を読む。ゲージは満タンまで、鱗から入れた分は上限までで、ゲージ以下。倒したレベルは表の数まで。
 * 呼んでいるキャラは表にあり、残りの体力は 1 以上、払った区切りは区切りの数より少ない。壊れていれば null。
 * @param {string} text @param {typeof DEFAULT_CONFIG} config @returns {KourinState | null}
 */
function decodeKourin(text, config) {
  const p = text.split(".");
  if (p.length !== 7) return null;
  const c = config.kourin;
  const gauge = readNum(p[0]);
  const fromScales = readNum(p[1]);
  if (gauge === null || fromScales === null || gauge > c.full * c.unit || fromScales > c.scaleCap * c.unit || fromScales > gauge) return null;
  const raw = list(p[2]);
  if (raw.length > KOURIN_ROWS.length || (raw.length > 0 && raw[raw.length - 1] === "0")) return null;
  /** @type {Record<string, number>} */
  const cleared = {};
  for (let i = 0; i < raw.length; i++) {
    const n = readNum(raw[i]);
    if (n === null) return null;
    if (n > 0) cleared[KOURIN_ROWS[i].id] = n;
  }
  if (p[3] === "" && p[4] === "" && p[5] === "" && p[6] === "") return { gauge, fromScales, cleared, raid: null };
  const [index, hp, tries, paid] = [p[3], p[4], p[5], p[6]].map(readNum);
  const row = index === null ? undefined : KOURIN_ROWS[index];
  if (!row || hp === null || hp < 1 || tries === null || paid === null || paid >= c.steps) return null;
  return { gauge, fromScales, cleared, raid: { char: row.id, hp, tries, paid } };
}

/**
 * お守りの欄を読む。レベルは 0 以上(上限なし:D-397)、表の数まで。付けている能力はレベル 1 以上。壊れていれば null。
 * @param {string} text @returns {import("./charms.js").CharmBag | null}
 */
function decodeCharms(text) {
  const p = text.split(".");
  if (p.length !== 2) return null;
  const raw = list(p[1]);
  if (raw.length > CHARM_ROWS.length || (raw.length > 0 && raw[raw.length - 1] === "0")) return null;
  /** @type {Record<string, number>} */
  const levels = {};
  for (let i = 0; i < raw.length; i++) {
    const n = readNum(raw[i]);
    if (n === null) return null;
    if (n > 0) levels[CHARM_ROWS[i].id] = n;
  }
  if (p[0] === "") return { levels, equipped: null };
  const index = readNum(p[0]);
  const row = index === null ? undefined : CHARM_ROWS[index];
  if (!row || !(levels[row.id] > 0)) return null;
  return { levels, equipped: row.id };
}

/** グローブの 2 つの欄(D-335)。 @param {import("./glove.js").GloveBag} bag */
function encodeGloves(bag) {
  const items = [...bag.items].sort((a, b) => a.id - b.id);
  let prev = 0;
  const text = items
    .map((g) => {
      const ar = GLOVE_ABILITY_ROWS.findIndex((a) => a.id === g.ability) * GLOVE_RARITY_ROWS.length + GLOVE_RARITY_ROWS.findIndex((r) => r.id === g.rarity);
      const out = `${num(g.id - prev)}.${num(ar)}.${num(g.grade)}${g.locked ? ".1" : ""}`;
      prev = g.id;
      return out;
    })
    .join(",");
  return [`${num(bag.rolls)}.${num(bag.nextId)}.${bag.equipped === null ? "" : num(bag.equipped)}`, text];
}

/**
 * グローブの 2 つの欄を読む。壊れた・表にない能力・レア度と能力の組み合わせ違反・グレードの範囲外・装着の番号が持ち物にない・
 * 上限をこえる、は null。
 * @param {string} head @param {string} itemText @param {SaveContent} content @param {typeof DEFAULT_CONFIG} config
 * @returns {import("./glove.js").GloveBag | null}
 */
function decodeGloves(head, itemText, content, config) {
  const h = head.split(".");
  if (h.length !== 3) return null;
  const rolls = readNum(h[0]);
  const nextId = readNum(h[1]);
  const equipped = h[2] === "" ? null : readNum(h[2]);
  if (rolls === null || nextId === null || nextId < 1 || (h[2] !== "" && equipped === null)) return null;
  /** @type {import("./glove.js").Glove[]} */
  const items = [];
  let prev = 0;
  for (const text of list(itemText)) {
    const m = text.match(/^([0-9a-z]+)\.([0-9a-z]+)\.([0-9a-z]+)(\.1)?$/);
    if (!m) return null;
    const [delta, ar, grade] = [m[1], m[2], m[3]].map(readNum);
    if (delta === null || ar === null || grade === null || delta < 1) return null;
    const ability = GLOVE_ABILITY_ROWS[Math.floor(ar / GLOVE_RARITY_ROWS.length)];
    const rarity = GLOVE_RARITY_ROWS[ar % GLOVE_RARITY_ROWS.length];
    if (!ability || !rarity || !abilityAllows(ability, rarity.id) || grade < 1 || grade > content.maxStage) return null;
    /** @type {import("./glove.js").Glove} */
    const glove = { id: prev + delta, ability: ability.id, rarity: rarity.id, grade };
    if (m[4]) glove.locked = true;
    items.push(glove);
    prev = glove.id;
  }
  if (items.length > config.glove.max || prev >= nextId) return null;
  if (equipped !== null && !items.some((g) => g.id === equipped)) return null;
  return { items, equipped, nextId, rolls };
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
  // 特別な枠(お守り)は装備の個体を持たない(D-392)。
  if (!kind || kind.special || !rarity || grade < 1 || grade > content.maxStage) return null;
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
  const [coinText, rodText, scaleText, seenText, gachaText, equipText, itemText, lockText, baitText, areaText, skillSeenText, gloveHead, gloveItems, kourinText, charmText] = parts;

  const coins = readNum(coinText);
  if (coins === null) return fail;

  const rod = rodText.split(".");
  if (rod.length !== 2) return fail;
  let stage = readNum(rod[0]);
  const stepIndex = readNum(rod[1]);
  if (stage === null || stepIndex === null || stage < 1 || stage > content.maxStage) return fail;
  let step = STEP_ORDER[stepIndex];
  if (!step) return fail;
  // 「進化済み」は、表の最後の段階でだけありうる。表に段階が足されて、次の段階ができたときは、
  // 次の段階の未製作として読む(磯の 5 段階目の進化済みは、川の段階 1 になる:D-280 と同じ考え・D-350)。
  if (step === ROD_STEPS.EVOLVED && stage !== content.maxStage) {
    if (!content.stageByNumber?.has(stage + 1)) return fail;
    stage += 1;
    step = ROD_STEPS.NONE;
  }

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

  // 出会ったスキル(D-300):表の数より大きい印は拒否する。印なので重複は起きない。表の順に並べる。
  const skills = skillTable(content);
  const mask = readNum(skillSeenText);
  if (mask === null || mask >= 2 ** skills.length) return fail;
  const skillsSeen = skills.filter((_, i) => Math.floor(mask / 2 ** i) % 2 === 1).map((s) => s.id);
  if (skillsSeen.length > 0) progress.skillsSeen = skillsSeen;

  // グローブ(D-335):既定の形(持ち物なし・装着なし・番号 1・判定 0 回)のときは持たない。
  const gloves = decodeGloves(gloveHead, gloveItems, content, config);
  if (!gloves) return fail;
  if (gloves.items.length > 0 || gloves.equipped !== null || gloves.nextId !== 1 || gloves.rolls !== 0) progress.gloves = gloves;

  // 降臨とお守り(D-392):既定の形(ゲージ 0・呼び出しなし・お守りなし)のときは持たない。
  const kourin = decodeKourin(kourinText, config);
  const charms = decodeCharms(charmText);
  if (!kourin || !charms) return fail;
  if (!isEmptyKourin(kourin)) progress.kourin = kourin;
  if (!isEmptyCharms(charms)) progress.charms = charms;
  return { ok: true, progress };
}
