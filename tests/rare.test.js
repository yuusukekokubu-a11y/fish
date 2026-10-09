// 珍しい魚(D-406)のテスト:出る割合・出る魚・図鑑の見え方・釣れたときの帯。
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCast } from "../src/core/casts.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT, FISH_LIST } from "../src/core/fish.js";
import { dexView } from "../src/ui/dex_view.js";
import { addRareEffects, createEffects } from "../src/ui/effects.js";
import { progressAt } from "./helpers.js";

/** 弱い魚の u を等間隔に並べて、出た魚を数える(釣り場 港・竿の段階 rodStage)。 */
function countWeak(rodStage, n = 20000) {
  const s = DEFAULT_CONFIG.strongChance;
  const counts = new Map();
  for (let i = 0; i < n; i += 1) {
    const u = s + ((i + 0.5) / n) * (1 - s);
    const cast = resolveCast({ waitMs: 1000, u, seedValue: null, strongChance: s }, DEFAULT_CONFIG, FISH_LIST, { min: 1, max: rodStage });
    counts.set(cast.fish.id, (counts.get(cast.fish.id) ?? 0) + 1);
  }
  return counts;
}

test("珍しい魚は弱い魚の投の 1%。釣り場で釣れる段階の珍しい魚だけが、等分で出る", () => {
  const early = countWeak(1);
  assert.equal(early.get("gold-aji"), 200, "竿の段階 1 ではゴールデンアジだけ(1%)");
  assert.equal(early.get("gold-saba"), undefined);
  const later = countWeak(5);
  assert.equal(later.get("gold-aji"), 100);
  assert.equal(later.get("gold-saba"), 100);
  // 同じ段階の弱い魚 2 種類は、段階の重みを半分ずつ。
  assert.ok(Math.abs(later.get("aji") - later.get("haze")) <= 1, "端数で 1 ずれるだけ");
});

test("珍しい魚のウロコインは弱い魚の 15 倍、鱗は落とさない", () => {
  const gold = DEFAULT_CONTENT.fish.find((f) => f.id === "gold-aji");
  const aji = DEFAULT_CONTENT.fish.find((f) => f.id === "aji");
  assert.equal(gold.reward.coins, Math.round(aji.reward.coins * 15 * 100) / 100);
  assert.equal(gold.reward.scales, 0);
});

test("図鑑:珍しい魚は釣る前から「???(珍しい魚)」、釣ると ★ つきの金色の名前", () => {
  const before = dexView({ game: { progress: progressAt(1), content: DEFAULT_CONTENT } });
  const rows = before.sections.flatMap((s) => s.rows);
  assert.ok(rows.some((r) => r.label === "???(珍しい魚)"));
  const after = dexView({ game: { progress: progressAt(1, "none", { seen: ["gold-aji"] }), content: DEFAULT_CONTENT } });
  const row = after.sections.flatMap((s) => s.rows).find((r) => r.label.startsWith("★ゴールデンアジ"));
  assert.equal(row?.tone, "gold");
  assert.ok(row.detail.some(([k, v]) => k === "釣れる場所" && v.endsWith("の珍しい魚")));
});

test("釣れたときの帯:「珍しい魚!」。はじめて・新しい冠は前後に足す", () => {
  const e = createEffects();
  addRareEffects(e, { rare: true }, 0);
  assert.equal(e.banner.text, "珍しい魚!");
  addRareEffects(e, { rare: true, firstCatch: true, size: { newCrown: "gold" } }, 0);
  assert.equal(e.banner.text, "はじめて!・珍しい魚!・金冠!");
  assert.ok(e.particles.length > 0);
});
