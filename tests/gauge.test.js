// ゲージ系スキル(芯・縁)のテスト(②-4b3 の条件 5・6、D-197)。
// 命中範囲を中心からの距離で 芯・通常・縁 に分け、境界の値で判定と効果を確かめる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { challengeBoss, createGame, PHASES, tap, zoneBand } from "../src/core/fishing.js";
import { emptyGear } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { progressAt } from "./helpers.js";

const SK = DEFAULT_CONFIG.skills;
const noCrit = { ...DEFAULT_CONFIG.combat, critChance: 0 };

/** スキル(id → レベル)を付けて、段階 1 のヌシ戦を始める。 */
function bossFight(levels, combat = noCrit, extraItems = []) {
  const skills = Object.entries(levels).map(([id, level]) => ({ id, level }));
  const items = [{ id: 1, kind: "reel", rarity: "legend", grade: 1, value: 0, skills }, ...extraItems];
  const equipped = Object.fromEntries(items.map((it) => [it.kind, it.id]));
  const game = createGame(5, { combat, progress: progressAt(1, ROD_STEPS.CRAFTED, { gear: { ...emptyGear(), seed: 1, items, equipped, nextId: 9 } }) });
  assert.equal(challengeBoss(game), true);
  return game;
}

/** 印を位置 pos に置いてタップする(往復の行きの半分で、時間を合わせる)。 */
function tapAt(game, pos) {
  game.phaseMs = pos * game.cast.minigame.sweepMs;
  return tap(game);
}

const ZONE = { start: 0.4, end: 0.6 };

test("帯の判定:芯は中心からの距離 0.3 以下(ちょうどを含む)、縁は 0.75 以上(ちょうどと範囲の端を含む)、外はミス", () => {
  assert.equal(SK.coreRatio, 0.3);
  assert.equal(SK.edgeRatio, 0.75);
  const band = (p) => zoneBand(p, ZONE, SK);
  assert.equal(band(0.5), "core");
  assert.equal(band(0.53), "core", "芯の端ちょうど");
  assert.equal(band(0.47), "core");
  assert.equal(band(0.5301), "normal");
  assert.equal(band(0.5749), "normal");
  assert.equal(band(0.575), "edge", "縁の始まりちょうど");
  assert.equal(band(0.425), "edge");
  assert.equal(band(0.6), "edge", "命中範囲の端ちょうど");
  assert.equal(band(0.4), "edge");
  assert.equal(band(0.6001), null, "外はミス");
  assert.equal(band(0.3999), null);
});

test("帯は命中範囲の幅に比例する(ルアーで広がると帯も広がる)。芯はふつうの魚の最小の幅でも画面の 3% 以上。芯と縁は重ならず、通常が残る", () => {
  const wide = { start: 0.35, end: 0.65 }; // 幅 0.3(1.5 倍)
  assert.equal(zoneBand(0.545, wide, SK), "core", "0.045 / 0.15 = 0.3");
  assert.equal(zoneBand(0.5451, wide, SK), "normal");
  assert.equal(zoneBand(0.6125, wide, SK), "edge", "0.1125 / 0.15 = 0.75");
  // 芯の幅 = 命中範囲の幅 × 芯の割合。最小の幅(10%)でも 3%。
  // ふつうの魚の最小の幅(式の下限 10%)で 3% 以上。くせ「狭い命中範囲」のヌシ(6%)は、芯も狭くなる(難しさのくせ:D-381)。
  assert.ok(DEFAULT_CONFIG.formula.zoneMin * SK.coreRatio >= 0.03 - 1e-12);
  assert.ok(SK.coreRatio < SK.edgeRatio, "重ならない");
  assert.ok(SK.edgeRatio - SK.coreRatio > 0.3, "通常の帯が残る");
  const tiny = { start: 0.45, end: 0.55 };
  assert.equal(zoneBand(0.5 + 0.05 * 0.5, tiny, SK), "normal", "狭くても通常が残る");
});

test("芯:芯で命中したときだけ、その命中の会心率 +10% × Lv。通常の帯・縁では変わらない。100% をこえると追加クリティカル", () => {
  const game = bossFight({ core: 2 }, { ...noCrit, critChance: 0.9 });
  game.fight.zone = { ...ZONE };
  // 乱数 0.95:会心率 90% ならクリティカルなし。芯で +20% → 110% → 1 段は必ず、0.95 < 0.1 ではないので 1 段。
  game.fight.critRng = () => 0.95;
  const core = tapAt(game, 0.5);
  assert.equal(core.band, "core");
  assert.equal(core.critStages, 1);
  assert.ok(core.triggers.includes("core"));
  game.fight.zone = { ...ZONE };
  game.fight.critRng = () => 0.95;
  const normal = tapAt(game, 0.56);
  assert.equal(normal.band, "normal");
  assert.equal(normal.critStages, 0, "通常の帯では会心率は 90% のまま");
  // 追加クリティカル:芯で 0.9 + 0.2 = 1.1、乱数 0.05 < 0.1 → 2 段。
  game.fight.zone = { ...ZONE };
  game.fight.critRng = () => 0.05;
  assert.equal(tapAt(game, 0.5).critStages, 2);
});

test("縁:縁で命中したときだけ、ダメージ +20% × Lv。芯・通常では変わらない。ミスは変わらない(回復と連撃のリセット)", () => {
  const game = bossFight({ edge: 3, "combo-power": 1 });
  game.fight.critRng = () => 0.99;
  game.fight.zone = { ...ZONE };
  const edge = tapAt(game, 0.59);
  assert.equal(edge.band, "edge");
  assert.equal(edge.damage, 16, "10 × 1.6");
  game.fight.zone = { ...ZONE };
  const normal = tapAt(game, 0.45);
  assert.equal(normal.band, "normal");
  assert.equal(normal.damage, 11, "連撃 1 段で +1、縁はなし");
  game.fight.zone = { ...ZONE };
  assert.equal(tapAt(game, 0.5).damage, 12, "芯でも縁は効かない(連撃 2 段)");
  game.fight.zone = { ...ZONE };
  const hp = game.fight.hp;
  const miss = tapAt(game, 0.2);
  assert.equal(miss.action, "miss");
  assert.equal(game.fight.hp, Math.min(game.fight.maxHp, hp + 10));
  assert.equal(game.fight.combo, 0);
});

test("計算の順:基本(表 + 連撃・攻)→(1 + とどめ + 縁)を掛けて四捨五入 → クリティカル。芯の会心率で乱数は増えない", () => {
  const game = bossFight({ edge: 2, finisher: 1, "combo-power": 1 }, { ...noCrit, critChance: 1, critMultiplier: 1.5 });
  game.fight.hp = 10;
  game.fight.combo = 2;
  game.fight.zone = { ...ZONE };
  game.fight.critRng = () => 0.5;
  // (10 + 2) × (1 + 0.15 + 0.4) = 18.6 → 19、クリティカル 1 段 × 1.5 = 28.5 → 29(倍率は逓減の始まり 1.65 より下:D-255)。
  assert.equal(tapAt(game, 0.6).damage, 29);
  // 乱数の回数:芯・縁があっても、命中 1 回につき 1 回。
  const g2 = bossFight({ core: 3, edge: 3 }, DEFAULT_CONFIG.combat);
  let calls = 0;
  const orig = g2.fight.critRng;
  g2.fight.critRng = () => ((calls += 1), orig());
  let hits = 0;
  for (const p of [0.5, 0.59, 0.55, 0.5, 0.41, 0.5, 0.5, 0.5]) {
    if (g2.phase !== PHASES.MINIGAME) break;
    g2.fight.zone = { ...ZONE };
    if (tapAt(g2, p).action === "hit") hits += 1;
  }
  assert.ok(hits > 0);
  assert.equal(calls, hits);
});

test("画面:ゲージの帯は芯・縁のスキルを付けたときだけ。命中したときの「芯」「縁」。ステータスの帯の幅", async () => {
  const { gaugeBands } = await import("../src/ui/fight_view.js");
  const { bandLabel } = await import("../src/ui/effects.js");
  const { statusView } = await import("../src/ui/screen_views.js");
  assert.equal(gaugeBands(bossFight({})), null, "付けていないときは今のゲージのまま");
  assert.deepEqual(gaugeBands(bossFight({ core: 1 })), { core: 0.3, edge: null });
  assert.deepEqual(gaugeBands(bossFight({ core: 1, edge: 2 })), { core: 0.3, edge: 0.75 });
  assert.deepEqual(bandLabel({ band: "core", triggers: ["core"] }), { text: "芯", color: "#52d68a" });
  assert.deepEqual(bandLabel({ band: "edge", triggers: ["edge"] }), { text: "際", color: "#e9c46a" });
  assert.equal(bandLabel({ band: "core", triggers: [] }), null, "スキルがなければ出さない");
  assert.equal(bandLabel({ band: "normal", triggers: [] }), null);
  const game = bossFight({ core: 2, edge: 1 });
  const cond = statusView({ game }).sections.find((s) => s.title === "条件つき");
  const byLabel = Object.fromEntries(cond.rows.map((r) => [r.label, r]));
  assert.deepEqual(byLabel["芯打ち"].detail, [
    ["条件つき", "芯で命中すると会心率 +20%"],
    ["芯の帯", "命中範囲の真ん中 30%"],
    ["芯の帯(クロダイ)", "ゲージの 6.6%"],
  ]);
  assert.deepEqual(byLabel["際打ち"].detail, [
    ["条件つき", "際で命中するとダメージ +20%"],
    ["際の帯", "命中範囲の両端 25%"],
    ["際の帯(クロダイ)", "ゲージの 5.5%"],
  ]);
});
