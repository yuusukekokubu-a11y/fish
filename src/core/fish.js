// 魚と段階の設定表(D-093・D-094・D-099・D-111・D-112)。
// 段階の数と魚の種類は、この表だけで決まる(データ駆動)。段階や魚を足すときは、表に行を足すだけでよい。
// - 魚:名前・区分(弱い/強い/ヌシ)・解放される段階・報酬(ウロコインと鱗)・見た目(色と大きさ)、
//   強い魚とヌシはミニゲームの設定(印の速さ・命中範囲の幅・体力・制限時間)。
// - 段階:製作に使う鱗(その段階の強い魚の鱗)と数、ヌシ、進化に使う鱗(ヌシの鱗)と数。

import { EQUIP_KIND_ROWS } from "./gear.js";
import { SKILL_ROWS } from "./skills.js";

export const FISH_KINDS = Object.freeze({ WEAK: "weak", STRONG: "strong", BOSS: "boss" });

/**
 * 魚 1 種類を、表の 1 行(項目名つき)から作る(D-136)。
 * 行の項目:
 * - id:小文字の英数字とハイフン。保存の鱗のキーになるので、あとから変えない。
 * - name:画面に出す名前。kind:"weak"(弱い魚)・"strong"(強い魚)・"boss"(ヌシ)。stage:解放される段階。
 * - coins:釣り上げたときのウロコイン。scales:釣り上げたときに落とす「その魚の鱗」の数(弱い魚は 0)。
 * - color・size:見た目(色と大きさ)。
 * - minigame:強い魚とヌシだけ。{ sweepMs(印が端から端まで), zoneWidth(命中範囲の幅), hp(体力), timeLimitMs(制限時間) }。
 * 中では、報酬を reward: { coins, scales } にまとめた形で持つ。
 */
export function defineFish({ id, name, kind, stage, coins, scales, color, size, minigame = null }) {
  return Object.freeze({
    id,
    name,
    kind,
    stage,
    reward: Object.freeze({ coins, scales }),
    color,
    size,
    minigame: minigame && Object.freeze({ ...minigame }),
  });
}

/**
 * 段階 1 つを、表の 1 行(項目名つき)から作る(D-136)。
 * 行の項目:stage(段階)、craft: { scale(製作に使う鱗の魚の id), count(数) }、boss(ヌシの id)、
 * evolve: { count(進化に使うヌシの鱗の数) }。進化に使う鱗は、いつもその段階のヌシの鱗。
 */
export function defineStage({ stage, craft, boss, evolve }) {
  return Object.freeze({
    stage,
    craft: Object.freeze({ scale: craft.scale, count: craft.count }),
    boss,
    evolve: Object.freeze({ scale: boss, count: evolve.count }),
  });
}

/** 魚の表(段階の順)。足すときは 1 行足す(DESIGN の「段階や魚を足す手順」)。 */
export const FISH_ROWS = Object.freeze([
  // 段階 1
  { id: "aji", name: "アジ", kind: "weak", stage: 1, coins: 1, scales: 0, color: "#a8dadc", size: 22 },
  {
    id: "kurodai", name: "クロダイ", kind: "strong", stage: 1, coins: 5, scales: 1, color: "#f4a261", size: 34,
    minigame: { sweepMs: 900, zoneWidth: 0.22, hp: 20, timeLimitMs: 8000 },
  },
  {
    id: "nushi-kurodai", name: "ヌシ・クロダイ", kind: "boss", stage: 1, coins: 50, scales: 1, color: "#9c4f1c", size: 52,
    minigame: { sweepMs: 800, zoneWidth: 0.19, hp: 70, timeLimitMs: 30000 },
  },
  // 段階 2
  { id: "saba", name: "サバ", kind: "weak", stage: 2, coins: 3, scales: 0, color: "#90be6d", size: 24 },
  {
    id: "suzuki", name: "スズキ", kind: "strong", stage: 2, coins: 15, scales: 1, color: "#e76f51", size: 36,
    minigame: { sweepMs: 800, zoneWidth: 0.19, hp: 30, timeLimitMs: 9000 },
  },
  {
    id: "nushi-suzuki", name: "ヌシ・スズキ", kind: "boss", stage: 2, coins: 150, scales: 1, color: "#9d2f17", size: 54,
    minigame: { sweepMs: 700, zoneWidth: 0.16, hp: 105, timeLimitMs: 35000 },
  },
  // 段階 3
  { id: "kawahagi", name: "カワハギ", kind: "weak", stage: 3, coins: 8, scales: 0, color: "#f9c74f", size: 25 },
  {
    id: "buri", name: "ブリ", kind: "strong", stage: 3, coins: 40, scales: 1, color: "#b8c0ff", size: 38,
    minigame: { sweepMs: 700, zoneWidth: 0.16, hp: 40, timeLimitMs: 10000 },
  },
  {
    id: "nushi-buri", name: "ヌシ・ブリ", kind: "boss", stage: 3, coins: 400, scales: 1, color: "#5a63c8", size: 56,
    minigame: { sweepMs: 600, zoneWidth: 0.13, hp: 140, timeLimitMs: 40000 },
  },
  // 段階 4
  { id: "tachiuo", name: "タチウオ", kind: "weak", stage: 4, coins: 20, scales: 0, color: "#e9ecef", size: 28 },
  {
    id: "katsuo", name: "カツオ", kind: "strong", stage: 4, coins: 100, scales: 1, color: "#c77dff", size: 40,
    minigame: { sweepMs: 600, zoneWidth: 0.13, hp: 50, timeLimitMs: 11000 },
  },
  {
    id: "nushi-katsuo", name: "ヌシ・カツオ", kind: "boss", stage: 4, coins: 1000, scales: 1, color: "#7b2cbf", size: 58,
    minigame: { sweepMs: 520, zoneWidth: 0.11, hp: 175, timeLimitMs: 45000 },
  },
  // 段階 5
  { id: "hirame", name: "ヒラメ", kind: "weak", stage: 5, coins: 50, scales: 0, color: "#ddb892", size: 30 },
  {
    id: "maguro", name: "マグロ", kind: "strong", stage: 5, coins: 250, scales: 1, color: "#ef233c", size: 44,
    minigame: { sweepMs: 520, zoneWidth: 0.11, hp: 60, timeLimitMs: 12000 },
  },
  {
    id: "nushi-maguro", name: "ヌシ・マグロ", kind: "boss", stage: 5, coins: 2500, scales: 1, color: "#a4161a", size: 60,
    minigame: { sweepMs: 470, zoneWidth: 0.1, hp: 210, timeLimitMs: 50000 },
  },
]);

/** 段階の表。足すときは 1 行足す。 */
export const STAGE_ROWS = Object.freeze([
  { stage: 1, craft: { scale: "kurodai", count: 3 }, boss: "nushi-kurodai", evolve: { count: 1 } },
  { stage: 2, craft: { scale: "suzuki", count: 4 }, boss: "nushi-suzuki", evolve: { count: 1 } },
  { stage: 3, craft: { scale: "buri", count: 4 }, boss: "nushi-buri", evolve: { count: 1 } },
  { stage: 4, craft: { scale: "katsuo", count: 5 }, boss: "nushi-katsuo", evolve: { count: 1 } },
  { stage: 5, craft: { scale: "maguro", count: 6 }, boss: "nushi-maguro", evolve: { count: 1 } },
]);

export const FISH_LIST = Object.freeze(FISH_ROWS.map(defineFish));
export const STAGE_LIST = Object.freeze(STAGE_ROWS.map(defineStage));

/**
 * 設定表 1 組(魚と段階と装備の種類とスキル)。テストや将来の追加では、別の組を作って渡せる。
 * クレートは段階の表から作る(gear.js の makeCrates)。
 */
export function makeContent(fish = FISH_LIST, stages = STAGE_LIST, equipKinds = EQUIP_KIND_ROWS, skills = SKILL_ROWS) {
  const byId = new Map(fish.map((f) => [f.id, f]));
  const sortedStages = [...stages].sort((a, b) => a.stage - b.stage);
  return Object.freeze({
    fish,
    stages: sortedStages,
    byId,
    stageByNumber: new Map(sortedStages.map((s) => [s.stage, s])),
    maxStage: sortedStages.length > 0 ? sortedStages[sortedStages.length - 1].stage : 1,
    equipKinds,
    skills,
  });
}

export const DEFAULT_CONTENT = makeContent();

// 魚の id の形(小文字の英数字とハイフン、40 字まで)。保存の点検でも使う。
export const FISH_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MINIGAME_KEYS = ["sweepMs", "zoneWidth", "hp", "timeLimitMs"];
const isCountAtLeast = (n, min) => Number.isSafeInteger(n) && n >= min;

/**
 * 設定表の点検(テストと、将来の追加の確かめに使う)。おかしなところの文の一覧を返す(空なら問題なし)。
 */
export function checkContent(content) {
  const problems = [];
  const ids = new Set();
  for (const f of content.fish) {
    if (typeof f.id !== "string" || !FISH_ID_PATTERN.test(f.id)) problems.push(`id の形がおかしい:${f.id}`);
    if (ids.has(f.id)) problems.push(`id が重なっている:${f.id}`);
    ids.add(f.id);
    if (typeof f.name !== "string" || f.name === "") problems.push(`名前がない:${f.id}`);
    if (!Object.values(FISH_KINDS).includes(f.kind)) problems.push(`区分がおかしい:${f.id}`);
    if (!isCountAtLeast(f.stage, 1) || !content.stageByNumber.has(f.stage)) problems.push(`段階が表にない:${f.id}`);
    if (!isCountAtLeast(f.reward.coins, 0) || !isCountAtLeast(f.reward.scales, 0)) problems.push(`報酬の数がおかしい:${f.id}`);
    if (typeof f.color !== "string" || !(f.size > 0)) problems.push(`見た目の設定:${f.id}`);
    if ((f.kind === FISH_KINDS.WEAK) !== (f.minigame === null)) problems.push(`ミニゲームの設定:${f.id}`);
    if (f.minigame && !MINIGAME_KEYS.every((k) => Number.isFinite(f.minigame[k]) && f.minigame[k] > 0)) {
      problems.push(`ミニゲームの数がおかしい:${f.id}`);
    }
    if (f.kind === FISH_KINDS.WEAK && f.reward.scales !== 0) problems.push(`弱い魚は鱗を落とさない:${f.id}`);
    if (f.kind !== FISH_KINDS.WEAK && f.reward.scales < 1) problems.push(`強い魚とヌシは鱗を落とす:${f.id}`);
  }
  content.stages.forEach((s, i) => {
    if (s.stage !== i + 1) problems.push(`段階は 1 からの通し番号:${s.stage}`);
    const craft = content.byId.get(s.craft.scale);
    const boss = content.byId.get(s.boss);
    if (!craft || craft.kind !== FISH_KINDS.STRONG || craft.stage !== s.stage) problems.push(`製作の鱗はその段階の強い魚:${s.stage}`);
    if (!boss || boss.kind !== FISH_KINDS.BOSS || boss.stage !== s.stage) problems.push(`ヌシはその段階のヌシ:${s.stage}`);
    if (!isCountAtLeast(s.craft.count, 1) || !isCountAtLeast(s.evolve.count, 1)) problems.push(`製作と進化の数は 1 以上:${s.stage}`);
    if (!content.fish.some((f) => f.kind === FISH_KINDS.WEAK && f.stage === s.stage)) problems.push(`弱い魚がいない:${s.stage}`);
  });
  return problems;
}

/** id から魚を探す。ないときは undefined。 */
export function fishById(id, content = DEFAULT_CONTENT) {
  return content.byId.get(id);
}

/** 鱗の名前(例:クロダイの鱗)。 */
export function scaleName(id, content = DEFAULT_CONTENT) {
  const f = fishById(id, content);
  return f ? `${f.name}の鱗` : `${id}の鱗`;
}

/** 竿の段階 rodStage で釣れる、区分 kind の魚(段階の小さい順)。ヌシはランダムには出ない。 */
export function availableFish(rodStage, kind, list = FISH_LIST) {
  return list.filter((f) => f.kind === kind && f.stage <= rodStage).sort((a, b) => a.stage - b.stage);
}

/** 竿の段階 rodStage で新しく釣れるようになる魚(ヌシを除く)。 */
export function fishUnlockedAt(rodStage, list = FISH_LIST) {
  return list.filter((f) => f.stage === rodStage && f.kind !== FISH_KINDS.BOSS);
}

/** 抽選の重み:新しい魚ほど出やすい。段階が 1 上がるごとに 2 倍(D-046)。 */
export function fishWeight(f) {
  return 2 ** (f.stage - 1);
}

/**
 * 0 以上 1 未満の数 v で、候補から重みづけで 1 匹選ぶ。
 * 乱数は呼ぶ側が渡す(ここでは乱数を引かない)。
 */
export function pickWeighted(candidates, v) {
  const total = candidates.reduce((sum, f) => sum + fishWeight(f), 0);
  let target = v * total;
  for (const f of candidates) {
    target -= fishWeight(f);
    if (target < 0) return f;
  }
  return candidates[candidates.length - 1];
}

/**
 * ミニゲームの重さを、限界(最小幅・速さの上限)の中に収める(D-036・D-048)。
 * 体力と制限時間はそのまま使う。
 */
export function effectiveMinigame(f, limits) {
  if (!f.minigame) return null;
  return {
    sweepMs: Math.max(limits.minSweepMs, f.minigame.sweepMs),
    zoneWidth: Math.max(limits.minZoneWidth, f.minigame.zoneWidth),
    hp: f.minigame.hp,
    timeLimitMs: f.minigame.timeLimitMs,
  };
}
