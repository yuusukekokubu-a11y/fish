// 防御と貫通のテスト(②-4c 防御の条件 1・7・8・11:D-235・D-236・D-255・D-260)。いまの魚の表は防御 0(D-380)なので、
// 仕組みは、決めた魚にだけ防御を付けた表(helpers.js の withDefense)で確かめる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { defendedDamage, effectiveDefense, effectiveStats } from "../src/core/combat.js";
import { DEFAULT_CONTENT, FISH_KINDS } from "../src/core/fish.js";
import { createGame, PHASES, tap, update } from "../src/core/fishing.js";
import { fishDefense, softCurve } from "../src/core/formula.js";
import { emptyGear } from "../src/core/gear.js";
import { decodeSaveCode, encodeSaveCode } from "../src/core/savecode.js";
import { maxLevel, SKILL_ROWS } from "../src/core/skills.js";
import { startQuickFight } from "../src/ui/debug_view.js";
import { defenseBadge } from "../src/ui/fight_view.js";
import { nextLevelText } from "../src/ui/skill_view.js";
import { progressAt, withDefense } from "./helpers.js";

const byId = (id) => SKILL_ROWS.find((s) => s.id === id);

test("防御の計算:実効防御 0%・50%・99%・100%・150% で決めたとおり(最小 1、100% 以上はいつも 1)", () => {
  assert.equal(defendedDamage(40, 0), 40);
  assert.equal(defendedDamage(40, 0.5), 20);
  assert.equal(defendedDamage(40, 0.99), 1, "40 × 0.01 = 0.4 → 最小 1");
  assert.equal(defendedDamage(1000, 0.99), 10);
  assert.equal(defendedDamage(1000000, 1), 1);
  assert.equal(defendedDamage(1000000, 1.5), 1);
  assert.equal(defendedDamage(33, 0.5), 17, "16.5 → 四捨五入で 17");
  // 実効防御 = 防御 − 貫通(下限 0)。
  assert.equal(effectiveDefense(0.8, 0.3), 0.5);
  assert.equal(effectiveDefense(0.8, 2), 0);
  assert.equal(effectiveDefense(1.05, 0), 1.05);
});

/** 段階 g の魚 fishId と、合わせ成功で戦いを始める(装備 items)。 */
function fightWith(g, fishId, items = [], combat = undefined, content = undefined) {
  const own = items.map((it, i) => ({ ...it, id: i + 1 }));
  const gear = { ...emptyGear(), seed: 1, items: own, equipped: Object.fromEntries(own.map((it) => [it.kind, it.id])), nextId: own.length + 1 };
  const game = createGame(3, { content, combat, progress: progressAt(g, "none", { gear }) });
  assert.equal(startQuickFight(game, fishId, "good").ok, true);
  return game;
}

/** 印が命中範囲の真ん中に来るまで進めて、タップする。 */
function hitCenter(game) {
  for (let i = 0; i < 5000 && game.phase === PHASES.MINIGAME; i++) {
    const z = game.fight.zone;
    const s = game.cast.minigame.sweepMs;
    const t = game.phaseMs % (2 * s);
    const p = t <= s ? t / s : 2 - t / s;
    if (Math.abs(p - (z.start + z.end) / 2) < 0.004) return tap(game);
    update(game, 1);
  }
  throw new Error("真ん中に来ない");
}

test("クリティカルの段数を重ねても、実効防御 100% 以上なら 1。貫通で実効防御が下がる", () => {
  // いまの魚の表は防御 0(D-380)なので、5 体目のヌシに防御 105% を付けた表で確かめる(仕組みは残してある)。
  const plain = DEFAULT_CONTENT.fish.find((f) => f.kind === FISH_KINDS.BOSS && f.stage === 5);
  const content = withDefense(DEFAULT_CONTENT, { [plain.id]: 1.05 });
  const boss = content.byId.get(plain.id);
  const strongCrit = { ...DEFAULT_CONFIG.combat, damage: 500, critChance: 5, critMultiplier: 3 };
  let game = fightWith(5, boss.id, [], strongCrit, content);
  let r = hitCenter(game);
  assert.ok(r.critStages >= 2, `段数 ${r.critStages}(会心率 500% は逓減で約 223%)`);
  assert.deepEqual([r.damage, r.effDefense >= 1, r.defended], [1, true, true]);
  // 貫通 Lv7(0.7。逓減の始まりちょうど)で、実効防御 1.05 − 0.7 = 0.35。
  const pen = { kind: "reel", rarity: "legend", grade: 5, value: 8, skills: [{ id: "penetration", level: 4 }] };
  const pen2 = { kind: "line", rarity: "legend", grade: 5, value: 3840, skills: [{ id: "penetration", level: 3 }] };
  game = fightWith(5, boss.id, [pen, pen2], { ...DEFAULT_CONFIG.combat, critChance: 0 }, content);
  r = hitCenter(game);
  assert.ok(Math.abs(r.effDefense - (boss.minigame.defense - 0.7)) < 1e-9, `実効防御 ${r.effDefense}`);
  assert.equal(r.damage, Math.max(1, Math.round(r.rawDamage * (1 - r.effDefense))));
});

test("防御は、いまはどの魚も 0%(D-380:川からの「防御の壁」のくせとして戻す)。弱い魚はミニゲームがない", () => {
  for (const f of DEFAULT_CONTENT.fish) {
    if (f.kind === FISH_KINDS.WEAK) assert.equal(f.minigame, null);
    else assert.equal(f.minigame.defense, 0, f.id);
  }
  for (let g = 1; g <= 100; g++) for (const kind of /** @type {const} */ (["weak", "strong", "boss"])) assert.equal(fishDefense(kind, g), 0);
});

test("連撃・貫:連撃の段数ごとに貫通を足す(最大 10 段、ミスで 0 に戻る)", () => {
  const plain = DEFAULT_CONTENT.fish.find((f) => f.kind === FISH_KINDS.BOSS && f.stage === 4);
  const content = withDefense(DEFAULT_CONTENT, { [plain.id]: 0.8 });
  const boss = content.byId.get(plain.id);
  const item = { kind: "reel", rarity: "legend", grade: 5, value: 8, skills: [{ id: "combo-pen", level: 4 }] };
  const game = fightWith(5, boss.id, [item], { ...DEFAULT_CONFIG.combat, critChance: 0 }, content);
  const effs = [];
  for (let i = 0; i < 3 && game.phase === PHASES.MINIGAME; i++) effs.push(hitCenter(game).effDefense);
  // 段数 0・1・2 で、貫通 0・0.04・0.08。
  assert.ok(Math.abs(effs[0] - boss.minigame.defense) < 1e-9);
  assert.ok(Math.abs(effs[1] - (boss.minigame.defense - 0.04)) < 1e-9, String(effs));
  assert.ok(Math.abs(effs[2] - (boss.minigame.defense - 0.08)) < 1e-9, String(effs));
  assert.equal(game.triggers.combo.penetration, 0.04);
});

test("会心率・倍率・貫通・ジャスト倍率の合計の逓減:knee までは そのまま、こえた分は log で緩やか(上限なし)", () => {
  const f = DEFAULT_CONFIG.formula;
  assert.equal(softCurve(1.15, f.critChanceCurve), 1.15);
  assert.ok(softCurve(2, f.critChanceCurve) < 2 && softCurve(2, f.critChanceCurve) > 1.15);
  assert.ok(softCurve(1000, f.critChanceCurve) > softCurve(100, f.critChanceCurve), "増え続ける");
  const s = effectiveStats({ critChance: 0.5, critMultiplier: 1.6, penetration: 0.3, justMultiplier: 5 }, f);
  assert.deepEqual([s.critChance, s.critMultiplier, s.penetration, s.justMultiplier], [0.5, 1.6, 0.3, 5], "knee より下は同じ");
  // knee:会心の倍率 1.65(1.3 + 0.05 × 7:D-255)、ジャスト倍率 5.1(3 + 0.3 × 7:D-257)。
  assert.deepEqual([f.critMultiplierCurve.knee, f.justMultiplierCurve.knee], [1.65, 5.1]);
});

test("画面:防御の表示(貫通があれば実効防御、100% 以上は目立たせる)と、次のレベルでの増分", () => {
  assert.equal(defenseBadge({ cast: { minigame: { defense: 0 } }, config: DEFAULT_CONFIG }), null);
  const base = { config: DEFAULT_CONFIG, fight: { combo: 0 }, triggers: {} };
  assert.deepEqual(defenseBadge({ ...base, cast: { minigame: { defense: 0.8 } }, combat: { penetration: 0 } }), { text: "防御 80%", high: false, effective: 0.8 });
  assert.deepEqual(defenseBadge({ ...base, cast: { minigame: { defense: 0.8 } }, combat: { penetration: 0.5 } }), { text: "防御 80% → 30%", high: false, effective: 0.3 });
  // 実効防御 100% 以上:「ダメージ 1」を出す。スキルの名前(貫通)は出さない(D-302)。
  assert.deepEqual(defenseBadge({ ...base, cast: { minigame: { defense: 1.05 } }, combat: { penetration: 0 } }), { text: "防御 105%・ダメージ 1", high: true, effective: 1.05 });
  assert.equal(defenseBadge({ ...base, cast: { minigame: { defense: 1.5 } }, combat: { penetration: 0.3 } }).text, "防御 150% → 120%・ダメージ 1");
  for (const pen of [0, 0.3, 0.5]) assert.doesNotMatch(defenseBadge({ ...base, cast: { minigame: { defense: 1.2 } }, combat: { penetration: pen } }).text, /貫通|連撃/);
  // 次のレベルでの増分。会心率 Lv5→6 は +15%、Lv7→8 から逓減(増え方が少し緩やか)。
  assert.equal(nextLevelText(byId("crit-rate"), 5, 7), "Lv5→6:会心率 +15%");
  assert.equal(nextLevelText(byId("crit-rate"), 7, 9), "Lv7→8:会心率 +13.12%(増え方が少し緩やかです)");
  assert.equal(nextLevelText(byId("power"), 3, 7), "Lv3→4:通常ダメージ +2");
  assert.equal(nextLevelText(byId("crit-rate"), 7, 7), null, "最大なら出さない");
  assert.equal(maxLevel(byId("penetration"), 5, DEFAULT_CONFIG.skills), 7, "貫通の最大は 2 + 段階");
});

test("保存:貫通と連撃・貫の装備も、版を上げずにセーブコードで往復する(番号は表の末尾)", () => {
  const item = { id: 1, kind: "reel", rarity: "legend", grade: 5, value: 8, skills: [{ id: "penetration", level: 4 }, { id: "combo-pen", level: 3 }, { id: "power", level: 2 }] };
  const p = progressAt(5, "none", { gear: { ...emptyGear(), seed: 7, items: [item], equipped: { reel: 1 }, nextId: 2 } });
  const code = encodeSaveCode(p);
  assert.match(code, /S4T3A2/, "貫通は S、連撃・貫は T(表の 19・20 番目)");
  assert.deepEqual(decodeSaveCode(code), { ok: true, progress: p });
});
