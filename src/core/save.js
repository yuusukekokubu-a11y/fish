// 保存の形式(D-065・D-104・D-117・D-143)。ブラウザに保存するのは UI の役目で、ここは形の変換と点検だけを行う。
// 版 7 の形(版 5・6 と同じ形。版 6 でルアーの値の意味が、版 7 でスキルの数がポイントからレベルに変わった:D-188・D-199):
//   { version: 7, progress: { coins, scales: { 魚の id: 数 }, rod: { stage, step }, seen: [魚の id, ...],
//     gear: { items: [[…]], equipped: [[…]], draws, seed, nextId } } }
//   装備は表の番号の短い配列で書く(D-171・D-178。形は gear_save.js)。
// 装備とガチャのまとまり(gear)の点検は gear_save.js にある。
// 古い版は、版ごとの小さな関数(MIGRATIONS)で 1 つずつ新しい版に読み替える。版を足すときは、
// SAVE_VERSION を上げ、「前の版 → 新しい版」の関数を 1 つ足す。
// 魚や段階が増えても形は変わらない(鱗は魚の id をキーにした表)。表にない魚の鱗や id は、
// 消さずに持ち続ける(画面では使わない)。

import { DEFAULT_CONFIG } from "./config.js";
import { DEFAULT_CONTENT, FISH_ID_PATTERN as ID_PATTERN } from "./fish.js";
import { emptyGear } from "./gear.js";
import {
  LEGACY_SKILL_IDS,
  legacyKinds,
  legacyPointsRange,
  migratedGear,
  packGear,
  pointsToLevels,
  readGear,
  readGearV4,
  remapLures,
} from "./gear_save.js";
import { levelRange } from "./skills.js";
import { COUNT_MAX, ROD_STEPS } from "./rod.js";

export const SAVE_VERSION = 7;
export const SAVE_KEY = "fish:save";

// 鱗の表の大きさの上限(壊れたデータで大きくなりすぎないように)。
const MAX_SCALE_KINDS = 1000;

/** 初めて遊ぶときの進み具合。 */
export function initialProgress() {
  return { coins: 0, scales: {}, rodStage: 1, rodStep: ROD_STEPS.NONE, seen: [], gear: emptyGear() };
}

/** 進み具合を、保存する形(版 7)にする。装備の番号は content の表の並び。 */
export function toSaveData(progress, content = DEFAULT_CONTENT) {
  return {
    version: SAVE_VERSION,
    progress: {
      coins: progress.coins,
      scales: { ...progress.scales },
      rod: { stage: progress.rodStage, step: progress.rodStep },
      seen: [...progress.seen],
      gear: packGear(progress.gear ?? emptyGear(), content),
    },
  };
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= COUNT_MAX;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 版ごとの読み替え。キーは「元の版」、値は「1 つ新しい版の形」を返す関数。
 * 形がおかしくて読み替えられないときは null を返す。
 */
export const MIGRATIONS = Object.freeze({
  // 版 1 → 版 2:進み具合を progress の下に入れる。
  1: (data) => {
    const { coins, material, rodStage, seen } = data;
    return { version: 2, progress: { coins, material, rodStage, seen } };
  },
  // 版 2 → 版 3:前の素材は、同じ数のウロコインに換えて足す(損をしないように)。
  // 竿の段階 n は、段階 n の「未製作」にする。鱗は 0 から。
  2: (data) => {
    if (!isPlainObject(data.progress)) return null;
    const { coins, material, rodStage, seen } = data.progress;
    if (!isCount(coins) || !isCount(material)) return null;
    return {
      version: 3,
      progress: {
        coins: Math.min(COUNT_MAX, coins + material),
        scales: {},
        rod: { stage: rodStage, step: ROD_STEPS.NONE },
        seen,
      },
    };
  },
  // 版 3 → 版 4:空の持ち物、引いた回数 0。ガチャの種は、画面がデータを読んだときに決める(D-141)。
  3: (data) => {
    if (!isPlainObject(data.progress)) return null;
    return { version: 4, progress: { ...data.progress, gear: migratedGear() } };
  },
  // 版 4 → 版 5:装備を表の番号の短い配列にする。旧装備はスキルなしのまま(D-172)。
  // 版 4 の形の点検もここで行う(おかしければ null)。
  4: (data, content, config) => {
    if (!isPlainObject(data.progress)) return null;
    const gear = readGearV4(data.progress.gear, legacyRules(content, config));
    if (!gear) return null;
    return { version: 5, progress: { ...data.progress, gear: packGear(gear, legacyTables(content)) } };
  },
  // 版 5 → 版 6:ルアーの値の意味が変わる(外したあとの次の当たり → 命中範囲 +n%:D-181)。
  // 前の範囲で点検してから、同じレア度・グレードの範囲の中での位置を保って読み替える(D-188)。
  5: (data, content, config) => {
    if (!isPlainObject(data.progress)) return null;
    const gear = readGear(data.progress.gear, legacyRules(content, config));
    if (!gear) return null;
    const remapped = remapLures(gear, content.equipKinds, config.gacha.gradeGrowth);
    return { version: 6, progress: { ...data.progress, gear: packGear(remapped, legacyTables(content)) } };
  },
  // 版 6 → 版 7:スキルのポイントをレベルにする(÷4 を四捨五入、最低 1)。目利きは取り除く(D-195・D-196)。
  6: (data, content, config) => {
    if (!isPlainObject(data.progress)) return null;
    const gear = readGear(data.progress.gear, { ...gearRules(content, config), skills: LEGACY_SKILL_IDS, skillRange: legacyPointsRange });
    if (!gear) return null;
    const leveled = pointsToLevels(gear, content.skills, config.skills);
    return { version: 7, progress: { ...data.progress, gear: packGear(leveled, content) } };
  },
});

/** 版 6 までの番号の並び(スキルの表は目利きを含む前のもの)。 */
function legacyTables(content) {
  return { equipKinds: content.equipKinds, skills: LEGACY_SKILL_IDS };
}

/** 版 5 までのデータの点検に使う表と数値(ルアーの値の範囲と、スキルの表とポイントの範囲が前のもの)。 */
function legacyRules(content, config) {
  return { ...gearRules(content, config), equipKinds: legacyKinds(content.equipKinds), skills: LEGACY_SKILL_IDS, skillRange: legacyPointsRange };
}

/** 装備の点検に使う表と数値。 */
function gearRules(content, config) {
  return {
    equipKinds: content.equipKinds,
    skills: content.skills,
    maxStage: content.maxStage,
    inventoryMax: config.gacha.inventoryMax,
    gradeGrowth: config.gacha.gradeGrowth,
    skillRange: (/** @type {string} */ rarityId, /** @type {number} */ grade) => levelRange(rarityId, grade, config.skills),
  };
}

/** 古い版を、今の版の形まで順に読み替える。知らない版や読み替えられないときは null。 */
export function migrate(data, content = DEFAULT_CONTENT, config = DEFAULT_CONFIG) {
  let current = data;
  while (isPlainObject(current) && current.version !== SAVE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) return null;
    current = step(current, content, config);
  }
  return isPlainObject(current) ? current : null;
}

function readScales(scales) {
  if (!isPlainObject(scales)) return null;
  const entries = Object.entries(scales);
  if (entries.length > MAX_SCALE_KINDS) return null;
  for (const [id, n] of entries) {
    if (!ID_PATTERN.test(id) || !isCount(n)) return null;
  }
  return Object.fromEntries(entries);
}

/**
 * 保存の形(オブジェクト)を点検して、進み具合を取り出す。
 * 成功:{ ok: true, progress }。失敗:{ ok: false, error: "version" | "content" }。
 */
export function readSaveData(data, content = DEFAULT_CONTENT, config = DEFAULT_CONFIG) {
  if (!isPlainObject(data)) return { ok: false, error: "content" };
  const known = MIGRATIONS[data.version] || data.version === SAVE_VERSION;
  if (!known) return { ok: false, error: "version" };
  const current = migrate(data, content, config);
  if (!current || !isPlainObject(current.progress)) return { ok: false, error: "content" };
  const { coins, scales, rod, seen, gear } = current.progress;
  if (!isCount(coins)) return { ok: false, error: "content" };
  const ownScales = readScales(scales);
  if (!ownScales) return { ok: false, error: "content" };
  if (!isPlainObject(rod)) return { ok: false, error: "content" };
  const { stage, step } = rod;
  if (!Number.isSafeInteger(stage) || stage < 1 || stage > content.maxStage) return { ok: false, error: "content" };
  if (!Object.values(ROD_STEPS).includes(step)) return { ok: false, error: "content" };
  // 「進化済み」は、表の最後の段階でだけありうる。
  if (step === ROD_STEPS.EVOLVED && stage !== content.maxStage) return { ok: false, error: "content" };
  if (!Array.isArray(seen) || !seen.every((id) => typeof id === "string" && ID_PATTERN.test(id))) {
    return { ok: false, error: "content" };
  }
  const ownGear = readGear(gear, gearRules(content, config));
  if (!ownGear) return { ok: false, error: "content" };
  return {
    ok: true,
    progress: { coins, scales: ownScales, rodStage: stage, rodStep: step, seen: [...new Set(seen)], gear: ownGear },
  };
}

/**
 * ブラウザに保存された文字列を読む。壊れている・形がちがう・版がちがうときは、初めの状態を返す。
 * エラーは投げない。
 */
export function parseSave(text, content = DEFAULT_CONTENT) {
  if (typeof text !== "string" || text === "") return initialProgress();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return initialProgress();
  }
  const result = readSaveData(data, content);
  return result.ok ? result.progress : initialProgress();
}
