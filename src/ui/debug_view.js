// @ts-check
// デバッグ画面の中身(画面に触らない部分:D-214・D-219〜D-222)。?debug のときだけ使う。
// - 保存場所は本番と分ける(save_store.js の DEBUG_SAVE_KEY)。本番の保存データは読みも書きもしない。
// - 決められる項目・プリセットは表で決める(DEBUG_FIELDS・DEBUG_PRESETS)。範囲の外は範囲の中に直す。
// - すぐ戦う:ヌシ戦と同じく、シードと回数から作る別の乱数で魚を用意する(魚の系統は引かない:D-115・D-220)。
// 計算本体(src/core)は変えない。JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { normalizeArea } from "../core/areas.js";
import { stageLabel } from "./area_view.js";
import { baitCount, refundBait, setBait } from "../core/bait.js";
import { DEFAULT_CONFIG } from "../core/config.js";
import { DEFAULT_CONTENT } from "../core/fish.js";
import { growthMaxLevel } from "../core/formula.js";
import { currentHookTiming, FISH_KINDS, HOOK_GRADES, makeBossCast, PHASES, refreshCombat, tap } from "../core/fishing.js";
import { BASE_KIND_IDS, effectRange, EQUIP_KIND_ROWS, kindById, RARITY_ROWS, rarityById } from "../core/gear.js";
import { abilityAllows, abilityById, equipGlove, gloveRarityById } from "../core/glove.js";
import { ensureGloveBag } from "../core/glove_play.js";
import { COUNT_MAX, ROD_STEPS } from "../core/rod.js";
import { parseSave } from "../core/savecode.js";
import { SKILL_ROWS } from "../core/skills.js";
import { noteSkillsSeen } from "../core/skills_seen.js";

/** @typedef {import("../core/gear.js").Item} Item */

/**
 * デバッグのデータを読むときの数値の表。装備のスキルのレベルを、そのスキルの最大まで許す(D-219)。
 * 装備 1 個のレベルの上限 =(2 + グレード)。本番の点検(DEFAULT_CONFIG)は変えない。
 */
export const DEBUG_READ_CONFIG = Object.freeze({
  ...DEFAULT_CONFIG,
  skills: Object.freeze({
    ...DEFAULT_CONFIG.skills,
    levelRarityMultiplier: Object.freeze({ normal: 3, rare: 3, epic: 3, legend: 3 }),
    levelMinRatio: 0,
  }),
});

/** 装備 1 個に付けられるスキルのレベルの上限(デバッグ:D-219)。 @param {number} grade */
export function debugLevelMax(grade) {
  return growthMaxLevel(grade, DEFAULT_CONFIG.skills);
}

/**
 * デバッグの保存の文字列を読む。壊れている・形がちがうときは、初めの状態。
 * @param {string | null} text @param {any} [content] @returns {any}
 */
export function parseDebugSave(text, content = DEFAULT_CONTENT) {
  return parseSave(text, content, /** @type {any} */ (DEBUG_READ_CONFIG));
}

/** 整数にして、min〜max の中に直す。数でなければ null(受け付けない)。 @param {unknown} v @param {number} min @param {number} max */
export function clampInt(v, min, max) {
  const n = typeof v === "number" ? v : Number(v);
  if (typeof v === "string" && v.trim() === "") return null;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** ウロコインと鱗の上限(保存の点検の「安全な整数」より十分小さい数)。 */
export const DEBUG_COUNT_MAX = 999999999;

/**
 * 決められる項目 1 つ。
 * @typedef {object} DebugField
 * @property {string} id
 * @property {string} label
 * @property {number} min
 * @property {number} max
 * @property {(p: any) => number} get
 * @property {(p: any, v: number) => void} set
 */

/** 竿の工程(数で選ぶ:0 未製作・1 製作済み・2 ヌシ撃破・3 進化済み)。 */
export const ROD_STEP_ORDER = Object.freeze([ROD_STEPS.NONE, ROD_STEPS.CRAFTED, ROD_STEPS.DEFEATED, ROD_STEPS.EVOLVED]);
export const ROD_STEP_NAMES = Object.freeze(["未製作", "製作済み", "ヌシ撃破", "進化済み"]);

/**
 * 決められる項目の表(D-214)。鱗は、鱗を落とす魚(強い魚とヌシ)ごとに魚の表から作る。
 * @param {any} [content] @returns {DebugField[]}
 */
export function debugFields(content = DEFAULT_CONTENT) {
  /** @type {DebugField[]} */
  const fields = [
    { id: "coins", label: "ウロコイン", min: 0, max: DEBUG_COUNT_MAX, get: (p) => p.coins, set: (p, v) => (p.coins = v) },
    {
      id: "rodStage",
      label: "竿の段階",
      min: 1,
      max: content.maxStage,
      get: (p) => p.rodStage,
      set: (p, v) => {
        // 段階が変わったら、残りの餌を前の段階の価格で払い戻す(進化と同じ:D-263・D-269)。
        if (v !== p.rodStage) refundBait(p, p.rodStage, COUNT_MAX);
        p.rodStage = v;
        // 「進化済み」は最後の段階でだけありうる(保存の点検と同じ)。
        if (p.rodStep === ROD_STEPS.EVOLVED && v !== content.maxStage) p.rodStep = ROD_STEPS.DEFEATED;
        // いまいる釣り場は、新しい段階で行ける釣り場にそろえる(D-273)。
        normalizeArea(p, content);
      },
    },
    {
      id: "rodStep",
      label: `竿の工程(${ROD_STEP_NAMES.map((n, i) => `${i} ${n}`).join("・")})`,
      min: 0,
      max: ROD_STEP_ORDER.length - 1,
      get: (p) => Math.max(0, ROD_STEP_ORDER.indexOf(p.rodStep)),
      set: (p, v) => {
        const step = ROD_STEP_ORDER[v];
        p.rodStep = step === ROD_STEPS.EVOLVED && p.rodStage !== content.maxStage ? ROD_STEPS.DEFEATED : step;
      },
    },
    // 餌の所持数(D-263)。上限は config.bait.max。
    { id: "bait", label: "餌の所持数", min: 0, max: DEFAULT_CONFIG.bait.max, get: (p) => baitCount(p), set: (p, v) => setBait(p, v) },
  ];
  for (const fish of content.fish) {
    if (!(fish.reward.scales > 0)) continue;
    fields.push({
      id: `scale:${fish.id}`,
      label: `${fish.name}の鱗`,
      min: 0,
      max: DEBUG_COUNT_MAX,
      get: (p) => p.scales[fish.id] ?? 0,
      set: (p, v) => {
        if (v === 0) delete p.scales[fish.id];
        else p.scales[fish.id] = v;
      },
    });
  }
  return fields;
}

/**
 * 項目を決める。範囲の外は範囲の中に直す。数でなければ受け付けない。
 * @param {any} game @param {string} id @param {unknown} value @returns {{ ok: boolean, value?: number }}
 */
export function setDebugField(game, id, value) {
  const field = debugFields(game.content).find((f) => f.id === id);
  if (!field) return { ok: false };
  const v = clampInt(value, field.min, field.max);
  if (v === null) return { ok: false };
  field.set(game.progress, v);
  refreshCombat(game);
  return { ok: true, value: field.get(game.progress) };
}

/**
 * 作る装備の指定。value は "min" | "max" | "mid" か数(範囲の中に直す)。skills は最大 3 個(レア度の数まで)。
 * @typedef {object} ItemSpec
 * @property {string} kind
 * @property {string} rarity
 * @property {number} grade
 * @property {"min" | "max" | "mid" | number} value
 * @property {{ id: string, level: number }[]} skills
 * @property {boolean} [equip] すぐ装着する
 * @property {boolean} [lock] ロックして作る(D-246)
 */

/**
 * 装備の指定を点検して、作る装備の形にする。おかしければ { ok: false, error }。
 * @param {any} game @param {ItemSpec} spec
 */
export function buildDebugItem(game, spec) {
  const kinds = game.content.equipKinds ?? EQUIP_KIND_ROWS;
  const kind = kindById(spec.kind, kinds);
  const rarity = rarityById(spec.rarity);
  if (!kind || !rarity) return { ok: false, error: "種類かレア度がちがいます" };
  const grade = clampInt(spec.grade, 1, game.content.maxStage);
  if (grade === null) return { ok: false, error: "グレードがちがいます" };
  const range = effectRange(kind, rarity, grade, game.config.gacha.gradeGrowth);
  let value;
  if (spec.value === "min") value = range.min;
  else if (spec.value === "max") value = range.max;
  else if (spec.value === "mid") value = Math.round((range.min + range.max) / 2 / kind.step) * kind.step;
  else value = clampInt(spec.value, range.min, range.max);
  if (value === null) return { ok: false, error: "値がちがいます" };
  value = Math.min(range.max, Math.max(range.min, value));
  const skills = game.content.skills ?? SKILL_ROWS;
  const levelMax = debugLevelMax(grade);
  /** @type {{ id: string, level: number }[]} */
  const own = [];
  for (const s of spec.skills) {
    if (!skills.some((/** @type {{ id: string }} */ r) => r.id === s.id) || own.some((x) => x.id === s.id)) continue;
    // 頭打ち型は Lv1 まで(D-279)。
    const capped = skills.find((/** @type {{ id: string, type?: string }} */ r) => r.id === s.id)?.type === "capped";
    const level = clampInt(s.level, 1, capped ? 1 : levelMax);
    if (level !== null) own.push({ id: s.id, level });
  }
  if (own.length > rarity.skillCount) {
    return { ok: false, error: `${rarity.name}に付けられるスキルは ${rarity.skillCount} 個までです` };
  }
  return { ok: true, item: { kind: kind.id, rarity: rarity.id, grade, value, skills: own } };
}

/**
 * 装備を作って持ち物に足す(すぐ装着もできる)。持ち物がいっぱいなら足さない。
 * @param {any} game @param {ItemSpec} spec @returns {{ ok: true, item: Item } | { ok: false, error: string }}
 */
export function addDebugItem(game, spec) {
  const built = buildDebugItem(game, spec);
  if (!built.ok || !built.item) return { ok: false, error: built.error ?? "作れません" };
  const gear = game.progress.gear;
  if (gear.items.length >= game.config.gacha.inventoryMax) return { ok: false, error: "持ち物がいっぱいです" };
  /** @type {Item} */
  const item = { id: gear.nextId, ...built.item };
  if (spec.lock) item.locked = true;
  gear.nextId += 1;
  gear.items.push(item);
  // デバッグで作った装備のスキルも「出会った」にする(デバッグの保存にだけ入る:D-300)。
  noteSkillsSeen(game.progress, [item], game.content.skills ?? SKILL_ROWS);
  if (spec.equip) gear.equipped[item.kind] = item.id;
  refreshCombat(game);
  return { ok: true, item };
}

/**
 * プリセット(よく試す装備の組み合わせ:D-214)。skills のスキルを、糸・リール・ルアーの順に 3 個ずつ付け(ほかの枠には作らない:D-327)、
 * レジェンド・最後の段階のグレード・値は最大・レベルは最大で作って装着する。stage が "max" なら竿も最後の段階にする。
 * @typedef {{ id: string, name: string, skills: string[], stage?: "max", note: string }} DebugPreset
 */

/** @type {readonly DebugPreset[]} */
export const DEBUG_PRESETS = Object.freeze([
  { id: "combo", name: "連撃", skills: ["combo-power", "combo-crit", "finisher"], note: "連撃・攻・連撃・心・とどめ" },
  { id: "first", name: "先手とジャスト", skills: ["first-hit", "just-boost", "momentum", "first-strike"], note: "先手・ジャスト・ブースト・勢い・先制" },
  { id: "gauge", name: "芯と縁", skills: ["core", "edge"], note: "芯・縁" },
  { id: "extra-crit", name: "追加クリティカル", skills: ["crit-rate", "crit-power"], stage: "max", note: "会心率が 100% をこえる(竿を最後の段階にする)" },
  {
    id: "best",
    name: "最強の装備",
    skills: ["power", "crit-rate", "crit-power", "tenacity", "fortune", "agility", "insight", "mastery", "recovery"],
    note: "数値型のスキル 9 個を最大で(貫通は除く)",
  },
  { id: "pen", name: "貫通", skills: ["penetration", "combo-pen", "power", "crit-rate", "crit-power", "core"], note: "貫通・連撃・貫・強打・会心率・会心威力・芯(D-236)" },
]);

/**
 * プリセットを当てる。装備を 3 個作って装着する(前の装着は外れるだけで、持ち物には残る)。
 * @param {any} game @param {string} id @returns {{ ok: boolean, error?: string }}
 */
export function applyPreset(game, id) {
  const preset = DEBUG_PRESETS.find((p) => p.id === id);
  if (!preset) return { ok: false, error: "プリセットがありません" };
  // プリセットは、糸・リール・ルアーの 3 枠だけに作る(おもり・浮き・おまもりは作らない:D-327)。
  const kinds = (game.content.equipKinds ?? EQUIP_KIND_ROWS).filter((/** @type {{ id: string }} */ k) => BASE_KIND_IDS.includes(k.id));
  const gear = game.progress.gear;
  if (game.config.gacha.inventoryMax - gear.items.length < kinds.length) {
    return { ok: false, error: `持ち物の空きが ${kinds.length} 個要ります` };
  }
  if (preset.stage === "max") setDebugField(game, "rodStage", game.content.maxStage);
  const grade = game.content.maxStage;
  const top = RARITY_ROWS[RARITY_ROWS.length - 1];
  const per = Math.max(1, Math.ceil(preset.skills.length / kinds.length));
  kinds.forEach((/** @type {{ id: string }} */ kind, /** @type {number} */ i) => {
    const skills = preset.skills.slice(i * per, i * per + per).map((sid) => ({ id: sid, level: debugLevelMax(grade) }));
    addDebugItem(game, { kind: kind.id, rarity: top.id, grade, value: "max", skills: skills.slice(0, top.skillCount), equip: true });
  });
  return { ok: true };
}

/**
 * グローブを作る(?debug のときだけ:D-334)。能力・レア度・グレードを点検して、持ち物に足す(すぐ装着もできる)。
 * 自動合わせはレジェンドだけ。保管がいっぱいなら作らない。
 * @param {any} game @param {{ ability: string, rarity: string, grade: number, equip?: boolean, lock?: boolean }} spec
 * @returns {{ ok: true, glove: import("../core/glove.js").Glove } | { ok: false, error: string }}
 */
export function addDebugGlove(game, spec) {
  const ability = abilityById(spec.ability);
  if (!ability || !gloveRarityById(spec.rarity)) return { ok: false, error: "能力かレア度がちがいます" };
  if (!abilityAllows(ability, spec.rarity)) return { ok: false, error: `${ability.name}は、そのレア度では出ません` };
  const grade = clampInt(spec.grade, 1, game.content.maxStage);
  if (grade === null) return { ok: false, error: "グレードがちがいます" };
  const bag = ensureGloveBag(game.progress);
  if (bag.items.length >= game.config.glove.max) return { ok: false, error: "グローブの保管がいっぱいです" };
  /** @type {import("../core/glove.js").Glove} */
  const glove = { id: bag.nextId, ability: ability.id, rarity: spec.rarity, grade };
  if (spec.lock) glove.locked = true;
  bag.nextId += 1;
  bag.items.push(glove);
  if (spec.equip) equipGlove(bag, glove.id);
  return { ok: true, glove };
}

/** すぐ戦う相手の候補(強い魚とヌシ)。 @param {any} [content] */
export function quickFightTargets(content = DEFAULT_CONTENT) {
  return content.fish
    .filter((/** @type {{ kind: string }} */ f) => f.kind === FISH_KINDS.STRONG || f.kind === FISH_KINDS.BOSS)
    .map((/** @type {{ id: string, name: string, stage: number, kind: string }} */ f) => ({
      id: f.id,
      label: `${f.name}(${stageLabel(content, f.stage)}・${f.kind === FISH_KINDS.BOSS ? "ヌシ" : "強い魚"})`,
    }));
}

/** すぐ戦うの乱数の種を、ヌシ戦の種とずらすための数。 */
const QUICK_SEED_SALT = 0x6a09e667;

/**
 * すぐ戦う(D-220)。待っていた魚は取っておき(ヌシ戦と同じ)、選んだ魚の「!」を出して、
 * 選んだ合わせの結果(成功・ジャスト)のときにタップしたことにする。戦いのあとは、待っていた魚から釣りに戻る。
 * 魚の系統の乱数は引かない。投げる・待つ・休みのときだけ始められる。
 * @param {any} game @param {string} fishId @param {"good" | "just"} grade
 * @returns {{ ok: boolean, error?: string, hook?: { grade: string, strike?: any } }}
 */
export function startQuickFight(game, fishId, grade) {
  const okPhase = game.phase === PHASES.CASTING || game.phase === PHASES.WAITING || game.phase === PHASES.RESTING;
  if (!okPhase || game.pendingCast) return { ok: false, error: "今は始められません(投げる・待つの間に押してください)" };
  const fish = game.content.byId.get(fishId);
  if (!fish || (fish.kind !== FISH_KINDS.STRONG && fish.kind !== FISH_KINDS.BOSS)) return { ok: false, error: "その魚とは戦えません" };
  game.debugFights = (game.debugFights ?? 0) + 1;
  const cast = makeBossCast(fish, game.config, (game.seed ^ QUICK_SEED_SALT) >>> 0, game.debugFights);
  game.pendingCast = game.cast;
  game.cast = { ...cast, kind: fish.kind };
  game.fight = null;
  game.hookGrade = null;
  game.phase = PHASES.BITE;
  const timing = currentHookTiming(game);
  // 成功:成功の幅の始まり(ジャストの前)。ジャストの前に幅がなければ、ジャストのあと。
  if (grade === HOOK_GRADES.JUST) game.phaseMs = timing.justStart;
  else game.phaseMs = timing.successStart < timing.justStart ? timing.successStart : timing.justEnd;
  const result = tap(game);
  // 強い魚のジャストなら、初撃が入る(体力以上なら、その場で釣り上げ:D-256)。hook は画面の演出に使う。
  return result && result.action === "hook" ? { ok: true, hook: /** @type {any} */ (result) } : { ok: false, error: "始められませんでした" };
}
