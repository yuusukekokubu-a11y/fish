// 魚と段階の設定表(D-093・D-094・D-099・D-111・D-112)。
// 段階の数と魚の種類は、この表だけで決まる(データ駆動)。段階や魚を足すときは、表に行を足すだけでよい。
// - 魚:名前・区分(弱い/強い/ヌシ)・解放される段階・報酬(ウロコインと鱗)・見た目(色と大きさ)、
//   強い魚とヌシはミニゲームの設定(印の速さ・当たり範囲の幅・体力・制限時間)。
// - 段階:製作に使う鱗(その段階の強い魚の鱗)と数、ヌシ、進化に使う鱗(ヌシの鱗)と数。

export const FISH_KINDS = Object.freeze({ WEAK: "weak", STRONG: "strong", BOSS: "boss" });

const W = FISH_KINDS.WEAK;
const S = FISH_KINDS.STRONG;
const B = FISH_KINDS.BOSS;

/** 魚 1 種類。reward.scales は、釣り上げたときに落とす「その魚の鱗」の数(弱い魚は 0)。 */
export function defineFish(id, name, kind, stage, coins, scales, color, size, minigame = null) {
  return Object.freeze({
    id,
    name,
    kind,
    stage,
    reward: Object.freeze({ coins, scales }),
    color,
    size,
    minigame: minigame && Object.freeze(minigame),
  });
}

/** 段階 1 つ。craft は製作に使う鱗(魚の id)と数、evolve は進化に使う鱗と数。 */
export function defineStage(stage, craftScale, craftCount, boss, evolveCount) {
  return Object.freeze({
    stage,
    craft: Object.freeze({ scale: craftScale, count: craftCount }),
    boss,
    evolve: Object.freeze({ scale: boss, count: evolveCount }),
  });
}

export const FISH_LIST = Object.freeze([
  // 段階 1
  defineFish("aji", "アジ", W, 1, 1, 0, "#a8dadc", 22),
  defineFish("kurodai", "クロダイ", S, 1, 5, 1, "#f4a261", 34, { sweepMs: 900, zoneWidth: 0.22, hp: 20, timeLimitMs: 8000 }),
  defineFish("nushi-kurodai", "ヌシ・クロダイ", B, 1, 50, 1, "#9c4f1c", 52, { sweepMs: 800, zoneWidth: 0.19, hp: 70, timeLimitMs: 30000 }),
  // 段階 2
  defineFish("saba", "サバ", W, 2, 3, 0, "#90be6d", 24),
  defineFish("suzuki", "スズキ", S, 2, 15, 1, "#e76f51", 36, { sweepMs: 800, zoneWidth: 0.19, hp: 30, timeLimitMs: 9000 }),
  defineFish("nushi-suzuki", "ヌシ・スズキ", B, 2, 150, 1, "#9d2f17", 54, { sweepMs: 700, zoneWidth: 0.16, hp: 105, timeLimitMs: 35000 }),
  // 段階 3
  defineFish("kawahagi", "カワハギ", W, 3, 8, 0, "#f9c74f", 25),
  defineFish("buri", "ブリ", S, 3, 40, 1, "#b8c0ff", 38, { sweepMs: 700, zoneWidth: 0.16, hp: 40, timeLimitMs: 10000 }),
  defineFish("nushi-buri", "ヌシ・ブリ", B, 3, 400, 1, "#5a63c8", 56, { sweepMs: 600, zoneWidth: 0.13, hp: 140, timeLimitMs: 40000 }),
  // 段階 4
  defineFish("tachiuo", "タチウオ", W, 4, 20, 0, "#e9ecef", 28),
  defineFish("katsuo", "カツオ", S, 4, 100, 1, "#c77dff", 40, { sweepMs: 600, zoneWidth: 0.13, hp: 50, timeLimitMs: 11000 }),
  defineFish("nushi-katsuo", "ヌシ・カツオ", B, 4, 1000, 1, "#7b2cbf", 58, { sweepMs: 520, zoneWidth: 0.11, hp: 175, timeLimitMs: 45000 }),
  // 段階 5
  defineFish("hirame", "ヒラメ", W, 5, 50, 0, "#ddb892", 30),
  defineFish("maguro", "マグロ", S, 5, 250, 1, "#ef233c", 44, { sweepMs: 520, zoneWidth: 0.11, hp: 60, timeLimitMs: 12000 }),
  defineFish("nushi-maguro", "ヌシ・マグロ", B, 5, 2500, 1, "#a4161a", 60, { sweepMs: 470, zoneWidth: 0.1, hp: 210, timeLimitMs: 50000 }),
]);

export const STAGE_LIST = Object.freeze([
  defineStage(1, "kurodai", 3, "nushi-kurodai", 1),
  defineStage(2, "suzuki", 4, "nushi-suzuki", 1),
  defineStage(3, "buri", 4, "nushi-buri", 1),
  defineStage(4, "katsuo", 5, "nushi-katsuo", 1),
  defineStage(5, "maguro", 6, "nushi-maguro", 1),
]);

/** 設定表 1 組(魚と段階)。テストや将来の追加では、別の組を作って渡せる。 */
export function makeContent(fish = FISH_LIST, stages = STAGE_LIST) {
  const byId = new Map(fish.map((f) => [f.id, f]));
  const sortedStages = [...stages].sort((a, b) => a.stage - b.stage);
  return Object.freeze({
    fish,
    stages: sortedStages,
    byId,
    stageByNumber: new Map(sortedStages.map((s) => [s.stage, s])),
    maxStage: sortedStages.length > 0 ? sortedStages[sortedStages.length - 1].stage : 1,
  });
}

export const DEFAULT_CONTENT = makeContent();

/**
 * 設定表の点検(テストと、将来の追加の確かめに使う)。おかしなところの文の一覧を返す(空なら問題なし)。
 */
export function checkContent(content) {
  const problems = [];
  const ids = new Set();
  for (const f of content.fish) {
    if (ids.has(f.id)) problems.push(`id が重なっている:${f.id}`);
    ids.add(f.id);
    if (!Object.values(FISH_KINDS).includes(f.kind)) problems.push(`区分がおかしい:${f.id}`);
    if ((f.kind === W) !== (f.minigame === null)) problems.push(`ミニゲームの設定:${f.id}`);
    if (f.kind === W && f.reward.scales !== 0) problems.push(`弱い魚は鱗を落とさない:${f.id}`);
  }
  content.stages.forEach((s, i) => {
    if (s.stage !== i + 1) problems.push(`段階は 1 からの通し番号:${s.stage}`);
    const craft = content.byId.get(s.craft.scale);
    const boss = content.byId.get(s.boss);
    if (!craft || craft.kind !== S || craft.stage !== s.stage) problems.push(`製作の鱗はその段階の強い魚:${s.stage}`);
    if (!boss || boss.kind !== B || boss.stage !== s.stage) problems.push(`ヌシはその段階のヌシ:${s.stage}`);
    if (!content.fish.some((f) => f.kind === W && f.stage === s.stage)) problems.push(`弱い魚がいない:${s.stage}`);
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
  return list.filter((f) => f.stage === rodStage && f.kind !== B);
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
