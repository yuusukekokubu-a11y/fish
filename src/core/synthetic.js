// @ts-check
// 限界の確かめ用の、大きな魚の表(D-204・D-233)。段階 n まで、段階ごとに 弱い魚・強い魚・ヌシ を 1 匹ずつ作る。
// 数値は本番と同じ式(formula.js)から作る。本番の表(fish.js の FISH_ROWS)は変えない。
// テストと、?debug&stages=n のときのデバッグだけで使う。

import { DEFAULT_CONFIG } from "./config.js";
import { defineFish, FISH_KINDS, makeContent } from "./fish.js";

/** 作れる段階の数の上限(確かめるのは 100 まで)。 */
export const SYNTHETIC_MAX_STAGES = 200;

const KIND_NAMES = Object.freeze({ weak: "弱い魚", strong: "強い魚", boss: "ヌシ" });
const KIND_COLORS = Object.freeze({ weak: "#a8dadc", strong: "#f4a261", boss: "#9c4f1c" });
const KIND_SIZES = Object.freeze({ weak: 22, strong: 36, boss: 54 });

/**
 * 段階 1〜n の魚の表の行(段階ごとに 3 匹。id は「s12-strong」の形、名前は「強い魚 12」の形)。
 * @param {number} stages
 */
export function syntheticFishRows(stages) {
  const n = Math.max(1, Math.min(SYNTHETIC_MAX_STAGES, Math.floor(stages)));
  /** @type {{ id: string, name: string, kind: string, stage: number, color: string, size: number }[]} */
  const rows = [];
  for (let g = 1; g <= n; g++) {
    for (const kind of [FISH_KINDS.WEAK, FISH_KINDS.STRONG, FISH_KINDS.BOSS]) {
      const k = /** @type {"weak" | "strong" | "boss"} */ (kind);
      rows.push({ id: `s${g}-${k}`, name: `${KIND_NAMES[k]} ${g}`, kind: k, stage: g, color: KIND_COLORS[k], size: KIND_SIZES[k] });
    }
  }
  return rows;
}

/**
 * 段階 1〜n の設定表 1 組(魚 3n 種類)。
 * @param {number} stages @param {object} [formula]
 */
export function syntheticContent(stages, formula = DEFAULT_CONFIG.formula) {
  return makeContent(syntheticFishRows(stages).map((r) => defineFish(r, formula)));
}
