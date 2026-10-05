// 魚の設定表(D-034・D-045)。1 種類ごとに、名前・区分・釣れるようになる竿の段階・報酬・
// ミニゲームの重さ(強い魚だけ)・見た目(色と大きさ)を持つ。
// 段階 1 の 2 種類は、Issue #4 の「普通の魚」「強い魚」と同じ設定。

export const FISH_KINDS = Object.freeze({ NORMAL: "normal", STRONG: "strong" });

const N = FISH_KINDS.NORMAL;
const S = FISH_KINDS.STRONG;

function fish(id, name, kind, stage, coins, material, color, size, minigame = null) {
  return Object.freeze({
    id,
    name,
    kind,
    stage,
    reward: Object.freeze({ coins, material }),
    color,
    size,
    minigame: minigame && Object.freeze(minigame),
  });
}

export const FISH_LIST = Object.freeze([
  fish("aji", "アジ", N, 1, 1, 1, "#a8dadc", 22),
  fish("kurodai", "クロダイ", S, 1, 5, 3, "#f4a261", 34, { sweepMs: 900, zoneWidth: 0.22 }),
  fish("saba", "サバ", N, 2, 3, 2, "#90be6d", 24),
  fish("suzuki", "スズキ", S, 2, 15, 6, "#e76f51", 36, { sweepMs: 800, zoneWidth: 0.19 }),
  fish("kawahagi", "カワハギ", N, 3, 8, 4, "#f9c74f", 25),
  fish("buri", "ブリ", S, 3, 40, 12, "#b8c0ff", 38, { sweepMs: 700, zoneWidth: 0.16 }),
  fish("tachiuo", "タチウオ", N, 4, 20, 8, "#e9ecef", 28),
  fish("katsuo", "カツオ", S, 4, 100, 24, "#c77dff", 40, { sweepMs: 600, zoneWidth: 0.13 }),
  fish("hirame", "ヒラメ", N, 5, 50, 16, "#ddb892", 30),
  fish("maguro", "マグロ", S, 5, 250, 48, "#ef233c", 44, { sweepMs: 520, zoneWidth: 0.11 }),
]);

const BY_ID = new Map(FISH_LIST.map((f) => [f.id, f]));

/** id から魚を探す。ないときは undefined。 */
export function fishById(id) {
  return BY_ID.get(id);
}

/** 竿の段階 rodStage で釣れる、区分 kind の魚(段階の小さい順)。 */
export function availableFish(rodStage, kind, list = FISH_LIST) {
  return list.filter((f) => f.kind === kind && f.stage <= rodStage).sort((a, b) => a.stage - b.stage);
}

/** 竿の段階 rodStage で新しく釣れるようになる魚。 */
export function fishUnlockedAt(rodStage, list = FISH_LIST) {
  return list.filter((f) => f.stage === rodStage);
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

/** ミニゲームの重さを、限界(最小幅・速さの上限)の中に収める(D-036・D-048)。 */
export function effectiveMinigame(f, limits) {
  if (!f.minigame) return null;
  return {
    sweepMs: Math.max(limits.minSweepMs, f.minigame.sweepMs),
    zoneWidth: Math.max(limits.minZoneWidth, f.minigame.zoneWidth),
  };
}
