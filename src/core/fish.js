// 魚と段階の設定表(D-093・D-094・D-111・D-224・D-225・D-228)。
// 段階の数と魚の種類は、この表だけで決まる(データ駆動)。段階や魚を足すときは、表に行を足すだけでよい。
// - 魚の表は、id・名前・区分(弱い/強い/ヌシ)・解放される段階(通し番号 g)・見た目(色と大きさ)だけを持つ。
// - 数値(報酬・鱗の数・ミニゲームの設定・製作と進化の数)は、通し番号 g の式(formula.js)から作る。表に手書きの数を置かない。
// - 段階の表は、魚の表から作る(製作はその段階の強い魚の鱗、進化はその段階のヌシの鱗)。

import { AREA_ROWS, checkAreas, makeAreas } from "./areas.js";
import { DEFAULT_CONFIG } from "./config.js";
import { craftCount, evolveCount, fishCoins, fishMinigame, fishScales } from "./formula.js";
import { EQUIP_KIND_ROWS } from "./gear.js";
import { SKILL_ROWS } from "./skills.js";

export const FISH_KINDS = Object.freeze({ WEAK: "weak", STRONG: "strong", BOSS: "boss" });

/**
 * 魚 1 種類を、表の 1 行(項目名つき)と式から作る(D-136・D-225)。
 * 行の項目:
 * - id:小文字の英数字とハイフン。保存は id で持つので、名前を変えても変えない(D-228)。
 * - name:画面に出す名前。kind:"weak"(弱い魚)・"strong"(強い魚)・"boss"(ヌシ)。stage:解放される段階(通し番号 g)。
 * - color・size:見た目(色と大きさ)。
 * 式から作るもの:reward: { coins, scales }(ウロコインと、落とす「その魚の鱗」の数。弱い魚は 0)、
 * minigame(強い魚とヌシだけ):{ sweepMs(印が端から端まで), zoneWidth(命中範囲の幅), hp(体力), timeLimitMs(制限時間) }。
 * @param {{ id: string, name: string, kind: string, stage: number, color: string, size: number }} row
 * @param {object} [formula] 式の数(config.formula)
 */
export function defineFish({ id, name, kind, stage, color, size }, formula = DEFAULT_CONFIG.formula) {
  const known = Object.values(FISH_KINDS).includes(kind) && Number.isSafeInteger(stage) && stage >= 1;
  return Object.freeze({
    id,
    name,
    kind,
    stage,
    reward: Object.freeze(known ? { coins: fishCoins(kind, stage, formula), scales: fishScales(kind, stage, formula) } : { coins: 0, scales: 0 }),
    color,
    size,
    minigame: known && kind !== FISH_KINDS.WEAK ? Object.freeze(fishMinigame(kind, stage, formula)) : null,
  });
}

/**
 * 段階の表を、魚の表から作る。段階 g の製作は、その段階の強い魚の鱗、進化は、その段階のヌシの鱗。数は式から。
 * 段階は 1 から、ヌシのいる段階の通し番号まで。
 * @param {readonly { id: string, kind: string, stage: number }[]} fish @param {object} [formula]
 */
export function stagesFromFish(fish, formula = DEFAULT_CONFIG.formula) {
  const bosses = fish.filter((f) => f.kind === FISH_KINDS.BOSS);
  const last = bosses.reduce((n, f) => Math.max(n, f.stage), 0);
  return Array.from({ length: last }, (_, i) => {
    const stage = i + 1;
    const strong = fish.find((f) => f.kind === FISH_KINDS.STRONG && f.stage === stage);
    const boss = fish.find((f) => f.kind === FISH_KINDS.BOSS && f.stage === stage);
    return Object.freeze({
      stage,
      craft: Object.freeze({ scale: strong?.id ?? "", count: craftCount(stage, formula) }),
      boss: boss?.id ?? "",
      evolve: Object.freeze({ scale: boss?.id ?? "", count: evolveCount(stage, formula) }),
    });
  });
}

/**
 * 魚の表(釣り場ごと・段階の順:港 g=1〜5、磯 g=6〜10。D-277)。足すときは 1 行足す(DESIGN の「段階や魚を足す手順」)。
 * 釣り場は段階(通し番号 g)で決まる(areas.js の釣り場の表)。数値は式から作る。
 */
export const FISH_ROWS = Object.freeze([
  // 段階 1
  { id: "aji", name: "アジ", kind: "weak", stage: 1, color: "#a8dadc", size: 22 },
  { id: "kurodai", name: "クロダイ", kind: "strong", stage: 1, color: "#f4a261", size: 34 },
  { id: "nushi-kurodai", name: "ヌシ・クロダイ", kind: "boss", stage: 1, color: "#9c4f1c", size: 52 },
  // 段階 2
  { id: "iwashi", name: "イワシ", kind: "weak", stage: 2, color: "#bcd4e6", size: 20 },
  { id: "suzuki", name: "スズキ", kind: "strong", stage: 2, color: "#e76f51", size: 36 },
  { id: "nushi-suzuki", name: "ヌシ・スズキ", kind: "boss", stage: 2, color: "#9d2f17", size: 54 },
  // 段階 3
  { id: "saba", name: "サバ", kind: "weak", stage: 3, color: "#90be6d", size: 24 },
  { id: "hirame", name: "ヒラメ", kind: "strong", stage: 3, color: "#ddb892", size: 38 },
  { id: "nushi-hirame", name: "ヌシ・ヒラメ", kind: "boss", stage: 3, color: "#8a6a3f", size: 56 },
  // 段階 4
  { id: "kisu", name: "キス", kind: "weak", stage: 4, color: "#f1e3c8", size: 24 },
  { id: "warasa", name: "ワラサ", kind: "strong", stage: 4, color: "#b8c0ff", size: 40 },
  { id: "nushi-warasa", name: "ヌシ・ワラサ", kind: "boss", stage: 4, color: "#5a63c8", size: 58 },
  // 段階 5
  { id: "kawahagi", name: "カワハギ", kind: "weak", stage: 5, color: "#f9c74f", size: 26 },
  { id: "buri", name: "ブリ", kind: "strong", stage: 5, color: "#7b8cde", size: 44 },
  { id: "nushi-buri", name: "ヌシ・ブリ", kind: "boss", stage: 5, color: "#2f3e9e", size: 60 },
  // 磯 段階 1(g=6)
  { id: "bera", name: "ベラ", kind: "weak", stage: 6, color: "#f28482", size: 22 },
  { id: "mejina", name: "メジナ", kind: "strong", stage: 6, color: "#457b9d", size: 36 },
  { id: "nushi-mejina", name: "ヌシ・メジナ", kind: "boss", stage: 6, color: "#1d3557", size: 54 },
  // 磯 段階 2(g=7)
  { id: "kasago", name: "カサゴ", kind: "weak", stage: 7, color: "#e76f51", size: 24 },
  { id: "ishidai", name: "イシダイ", kind: "strong", stage: 7, color: "#d9d9d9", size: 38 },
  { id: "nushi-ishidai", name: "ヌシ・イシダイ", kind: "boss", stage: 7, color: "#495057", size: 56 },
  // 磯 段階 3(g=8)
  { id: "mebaru", name: "メバル", kind: "weak", stage: 8, color: "#8d99ae", size: 24 },
  { id: "budai", name: "ブダイ", kind: "strong", stage: 8, color: "#80b918", size: 40 },
  { id: "nushi-budai", name: "ヌシ・ブダイ", kind: "boss", stage: 8, color: "#2b9348", size: 58 },
  // 磯 段階 4(g=9)
  { id: "ainame", name: "アイナメ", kind: "weak", stage: 9, color: "#bc8a5f", size: 26 },
  { id: "ishigakidai", name: "イシガキダイ", kind: "strong", stage: 9, color: "#c9ada7", size: 42 },
  { id: "nushi-ishigakidai", name: "ヌシ・イシガキダイ", kind: "boss", stage: 9, color: "#6d597a", size: 60 },
  // 磯 段階 5(g=10)
  { id: "soi", name: "ソイ", kind: "weak", stage: 10, color: "#6c757d", size: 26 },
  { id: "kue", name: "クエ", kind: "strong", stage: 10, color: "#a68a64", size: 46 },
  { id: "nushi-kue", name: "ヌシ・クエ", kind: "boss", stage: 10, color: "#582f0e", size: 62 },
]);

export const FISH_LIST = Object.freeze(FISH_ROWS.map((r) => defineFish(r)));
export const STAGE_LIST = Object.freeze(stagesFromFish(FISH_LIST));

/**
 * 設定表 1 組(魚と段階と装備の種類とスキルと釣り場)。テストや将来の追加では、別の組を作って渡せる。
 * 段階は魚の表から作る。クレートは段階の表から作る(gear.js の makeCrates)。釣り場は釣り場の表から、
 * 最後の段階までを覆うように作る(表にない段階には自動で作る:areas.js の makeAreas)。
 */
export function makeContent(fish = FISH_LIST, stages = stagesFromFish(fish), equipKinds = EQUIP_KIND_ROWS, skills = SKILL_ROWS, areaRows = AREA_ROWS) {
  const byId = new Map(fish.map((f) => [f.id, f]));
  const sortedStages = [...stages].sort((a, b) => a.stage - b.stage);
  const maxStage = sortedStages.length > 0 ? sortedStages[sortedStages.length - 1].stage : 1;
  return Object.freeze({
    areas: makeAreas(areaRows, maxStage),
    fish,
    stages: sortedStages,
    byId,
    stageByNumber: new Map(sortedStages.map((s) => [s.stage, s])),
    maxStage,
    equipKinds,
    skills,
  });
}

export const DEFAULT_CONTENT = makeContent();

// 魚の id の形(小文字の英数字とハイフン、40 字まで)。保存の点検でも使う。
export const FISH_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MINIGAME_KEYS = ["sweepMs", "zoneWidth", "hp", "timeLimitMs"];
const FISH_KEYS = "id,name,kind,stage,reward,color,size,minigame";
const isCountAtLeast = (n, min) => Number.isSafeInteger(n) && n >= min;

/**
 * 設定表の点検(テストと、将来の追加の確かめに使う)。おかしなところの文の一覧を返す(空なら問題なし)。
 */
export function checkContent(content) {
  const problems = [];
  const ids = new Set();
  for (const f of content.fish) {
    if (Object.keys(f).join(",") !== FISH_KEYS) problems.push(`魚の項目がちがう:${f.id}`);
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
    if (f.minigame && !(Number.isFinite(f.minigame.defense) && f.minigame.defense >= 0)) problems.push(`防御がおかしい:${f.id}`);
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
  problems.push(...checkAreas(content.areas, content.maxStage));
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

/**
 * 段階 min〜max で釣れる、区分 kind の魚(段階の小さい順)。ヌシはランダムには出ない。
 * 釣り場の中だけにするときは、min に釣り場の最初の段階を渡す(D-275)。min を省くと段階 1 から。
 */
export function availableFish(max, kind, list = FISH_LIST, min = 1) {
  return list.filter((f) => f.kind === kind && f.stage >= min && f.stage <= max).sort((a, b) => a.stage - b.stage);
}

/** 竿の段階 rodStage で新しく釣れるようになる魚(ヌシを除く)。 */
export function fishUnlockedAt(rodStage, list = FISH_LIST) {
  return list.filter((f) => f.stage === rodStage && f.kind !== FISH_KINDS.BOSS);
}

/**
 * 抽選の重み:新しい魚ほど出やすい。段階が 1 上がるごとに 2 倍(D-046)。
 * 釣り場の中の位置で数える(first は釣り場の最初の段階。位置 1 の重みが 1:D-275)。
 */
export function fishWeight(f, first = 1) {
  return 2 ** (f.stage - first);
}

/**
 * 0 以上 1 未満の数 v で、候補から重みづけで 1 匹選ぶ(first は釣り場の最初の段階)。
 * 乱数は呼ぶ側が渡す(ここでは乱数を引かない)。
 */
export function pickWeighted(candidates, v, first = 1) {
  const total = candidates.reduce((sum, f) => sum + fishWeight(f, first), 0);
  let target = v * total;
  for (const f of candidates) {
    target -= fishWeight(f, first);
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
    defense: f.minigame.defense ?? 0,
  };
}
