// スキル(スキルレベル制)と追加クリティカルのテスト(②-4b の受け入れ条件 2・3・4・5・6・10)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { critStages, DEFAULT_CRIT_RULES, hitDamage } from "../src/core/combat.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { makeContent } from "../src/core/fish.js";
import {
  createGame,
  currentMarker,
  drawCast,
  evolveGameRod,
  PHASES,
  refreshCombat,
  tap,
  triggeredStats,
  update,
} from "../src/core/fishing.js";
import { emptyGear, EQUIP_KIND_ROWS, makeCrates, pullCrate } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { createRng } from "../src/core/rng.js";
import {
  applySkillsToCombat,
  formatSkillEffect,
  levelRange,
  maxLevel,
  scaledReward,
  scaledWait,
  SKILL_ROWS,
  skillStates,
} from "../src/core/skills.js";
import { hookJust, progressAt } from "./helpers.js";

const SK = DEFAULT_CONFIG.skills;
const LIMITS = DEFAULT_CONFIG.combatLimits;
const byId = (id) => SKILL_ROWS.find((s) => s.id === id);

/** スキル(id → ポイント)を 1 つの装備に付けて装着した進み具合。 */
function gearWith(skillPoints, extra = {}) {
  const skills = Object.entries(skillPoints).map(([id, level]) => ({ id, level }));
  const item = { id: 1, kind: "reel", rarity: "legend", grade: 5, value: 8, skills };
  return { ...emptyGear(), items: [item], equipped: {}, seed: 1, nextId: 2, ...extra };
}
/** レベル L の装備のスキル(完全レベル制:D-195。前はポイントだった)。 */
const pts = (level) => level;

test("スキルは 20 個:数値型 10 個(成長型 6・頭打ち型 4。目利きはない)、条件発動型 8 個、ゲージ系 2 個(芯・縁)。貫通と連撃・貫は表の末尾(D-236)", () => {
  assert.deepEqual(
    SKILL_ROWS.map((s) => [s.name, s.type]),
    [
      ["強打", "growth"],
      ["会心率", "growth"],
      ["会心威力", "growth"],
      ["粘り", "growth"],
      ["豊漁", "growth"],
      ["俊敏", "capped"],
      ["見極め", "capped"],
      ["名人技", "capped"],
      ["回復の軽減", "capped"],
      ["連撃・攻", "growth"],
      ["連撃・心", "growth"],
      ["先手", "growth"],
      ["ジャスト・ブースト", "growth"],
      ["とどめ", "growth"],
      ["勢い", "growth"],
      ["先制", "growth"],
      ["芯", "growth"],
      ["縁", "growth"],
      ["貫通", "growth"],
      ["連撃・貫", "growth"],
    ],
  );
  assert.equal(new Set(SKILL_ROWS.map((s) => s.id)).size, 20);
  assert.ok(SKILL_ROWS.slice(9, 18).every((s) => s.target.kind === "trigger"));
  assert.deepEqual(SKILL_ROWS[18].target, { kind: "combat", stat: "penetration", op: "add" });
  assert.deepEqual(SKILL_ROWS[19].target, { kind: "trigger", when: "combo", effect: "penetration" });
  assert.ok(!SKILL_ROWS.some((s) => s.id === "appraisal"), "目利きはない");
});

test("レベル:装着中の装備のレベルの合計。最大で止まり、こえた分は無駄", () => {
  const at = (levels) => {
    const items = levels.map((level, i) => ({ id: i + 1, kind: ["reel", "line", "lure"][i], rarity: "legend", grade: 1, value: 0, skills: [{ id: "power", level }] }));
    return skillStates({ items, equipped: Object.fromEntries(items.map((it) => [it.kind, it.id])) }, 1, SK).power;
  };
  assert.deepEqual(at([1]), { total: 1, level: 1, max: 3 });
  assert.deepEqual(at([1, 2]), { total: 3, level: 3, max: 3 }, "最大ちょうど");
  assert.deepEqual(at([2, 2]), { total: 4, level: 3, max: 3 }, "こえた分は無駄");
  assert.deepEqual(at([2, 2, 2]), { total: 6, level: 3, max: 3 });
});

test("成長型の最大は竿の段階で伸び(段階 1・5・6)、頭打ち型は Lv3", () => {
  const growth = byId("power");
  assert.deepEqual([1, 5, 6].map((s) => maxLevel(growth, s, SK)), [3, 7, 8]);
  for (const s of [1, 5, 6]) assert.equal(maxLevel(byId("agility"), s, SK), 3);
  // 竿を進化すると、最大が伸びて、余っていたレベルが効くようになる。
  const game = createGame(1, { progress: progressAt(1, ROD_STEPS.DEFEATED, { scales: { "nushi-kurodai": 1 }, gear: gearWith({ power: 100 }, { equipped: { reel: 1 } }) }) });
  assert.deepEqual(game.skills.power, { total: 100, level: 3, max: 3 });
  assert.equal(evolveGameRod(game), true);
  assert.deepEqual(game.skills.power, { total: 100, level: 4, max: 4 });
});

test("レベルは装着中の装備だけ、同じスキルは足し合わせる", () => {
  const gear = {
    ...emptyGear(),
    items: [
      { id: 1, kind: "reel", rarity: "rare", grade: 1, value: 2, skills: [{ id: "power", level: 1 }] },
      { id: 2, kind: "line", rarity: "rare", grade: 1, value: 500, skills: [{ id: "power", level: 1 }] },
      { id: 3, kind: "lure", rarity: "rare", grade: 1, value: 2, skills: [{ id: "power", level: 9 }] },
    ],
    equipped: { reel: 1, line: 2 },
  };
  assert.deepEqual(skillStates(gear, 1, SK).power, { total: 2, level: 2, max: 3 });
});

/** スキル id をレベル L にしたときの戦闘の数値の表と倍率。 */
function withLevel(id, level, rodStage = 6) {
  const game = createGame(1, { progress: progressAt(rodStage, ROD_STEPS.NONE, { gear: gearWith({ [id]: pts(level) }, { equipped: { reel: 1 } }) }) });
  // リールの基本効果(+8)を除いて比べるため、リールなしの表も作る。
  return game;
}

test("効果の反映:20 個のスキルの、レベル 0〜最大(条件発動型は戦闘の数値の表を変えず、条件ごとの量だけ)", () => {
  const base = createGame(1, { progress: progressAt(6, ROD_STEPS.NONE, { gear: gearWith({}, { equipped: { reel: 1 } }) }) });
  for (const skill of SKILL_ROWS) {
    const max = maxLevel(skill, 6, SK);
    for (let level = 0; level <= max; level++) {
      const g = withLevel(skill.id, level);
      assert.equal(g.skills[skill.id].level, level, skill.id);
      const c = g.combat;
      const b = base.combat;
      switch (skill.id) {
        case "power":
          assert.equal(c.damage, b.damage + 2 * level);
          break;
        case "crit-rate":
          assert.ok(Math.abs(c.critChance - (b.critChance + 0.15 * level)) < 1e-9);
          break;
        case "crit-power":
          assert.ok(Math.abs(c.critMultiplier - (b.critMultiplier + 0.1 * level)) < 1e-9, "1 レベル +0.1(D-239)");
          break;
        case "penetration":
          assert.ok(Math.abs(c.penetration - (b.penetration + 0.1 * level)) < 1e-9, "1 レベル +10%");
          break;
        case "tenacity":
          assert.equal(c.timeLimitBonusMs, b.timeLimitBonusMs + 1000 * level);
          break;
        case "fortune":
          assert.ok(Math.abs(g.rates.coins - (1 + 0.1 * level)) < 1e-9);
          break;
        case "agility":
          assert.ok(Math.abs(g.rates.wait - (1 - 0.1 * level)) < 1e-9);
          break;
        case "insight":
          assert.equal(c.hook.normal.successMs, b.hook.normal.successMs + 100 * level);
          assert.equal(c.hook.strong.successMs, b.hook.strong.successMs + 100 * level);
          break;
        case "mastery":
          assert.equal(c.hook.normal.justMs, b.hook.normal.justMs + 40 * level);
          assert.equal(c.hook.strong.justMs, b.hook.strong.justMs + 40 * level);
          break;
        case "recovery":
          assert.equal(c.missHeal, [10, 7, 3, 0][level], "Lv3 で回復 0");
          break;
        default: {
          // 条件発動型:表は変えず、条件ごとの効果の量に入る。
          const t = /** @type {any} */ (skill.target);
          assert.equal(t.kind, "trigger", skill.id);
          assert.deepEqual(c, b, skill.id);
          const amount = g.triggers[t.when]?.[t.effect] ?? 0;
          assert.ok(Math.abs(amount - skill.perLevel * level) < 1e-9, skill.id);
        }
      }
      // ほかの項目は変わらない(基本の表の項目の数で確かめる)。
      if (level === 0) assert.deepEqual(c, b);
    }
  }
  assert.equal(formatSkillEffect(byId("crit-rate"), 2), "会心率 +30%");
  assert.equal(formatSkillEffect(byId("agility"), 3), "待ち時間 −30%");
  assert.equal(formatSkillEffect(byId("tenacity"), 4), "制限時間 +4 秒");
});

test("豊漁:ウロコインに倍率を掛け、端数は四捨五入(持ち越しはない:D-196)。鱗は増えない。魚の乱数は使わない", () => {
  assert.equal(scaledReward(5, 1.1), 6, "5.5 → 6(四捨五入)");
  assert.equal(scaledReward(5, 1.3), 7, "6.5 → 7");
  assert.equal(scaledReward(1, 1.1), 1, "1.1 → 1(持ち越さない)");
  assert.equal(scaledReward(10, 1.2), 12);
  assert.equal(scaledReward(5, 1), 5, "倍率 1 は前と同じ");
  // 遊んで確かめる:豊漁 Lv3 で、魚の並びは同じ、ウロコインは 1.3 倍前後。
  const play = (gear) => {
    const g = createGame(4, { progress: progressAt(3, ROD_STEPS.NONE, { gear }) });
    for (let t = 0; t < 600000; t += 16) {
      update(g, 16);
      if (g.phase === PHASES.BITE && hookJust(g)) tap(g);
      else if (g.phase === PHASES.MINIGAME) {
        const z = g.fight.zone;
        if (Math.abs(currentMarker(g) - (z.start + z.end) / 2) < 0.02) tap(g);
      }
    }
    return g;
  };
  const plain = play(gearWith({}, { equipped: { reel: 1 } }));
  const rich = play(gearWith({ fortune: pts(3) }, { equipped: { reel: 1 } }));
  assert.deepEqual(rich.results.map((r) => r.fishId), plain.results.map((r) => r.fishId));
  const ratio = rich.progress.coins / plain.progress.coins;
  assert.ok(ratio > 1.25 && ratio < 1.35, `${ratio}`);
  const scaleSum = (g) => Object.values(g.progress.scales).reduce((a, b) => a + b, 0);
  assert.equal(scaleSum(rich), scaleSum(plain), "鱗は増えない");
  assert.equal(rich.rewardCarry, undefined, "端数の持ち越しの仕組みはない");
});

test("俊敏:引いた待ち時間に倍率を掛け(下限 1 秒)、引く値と魚の並びは変わらない", () => {
  assert.equal(scaledWait(5000, 0.7, 1000), 3500);
  assert.equal(scaledWait(1200, 0.7, 1000), 1000, "下限");
  assert.equal(scaledWait(5000, 1, 1000), 5000);
  const plain = createGame(9, { progress: progressAt(2, ROD_STEPS.NONE, { gear: gearWith({}, { equipped: { reel: 1 } }) }) });
  const fast = createGame(9, { progress: progressAt(2, ROD_STEPS.NONE, { gear: gearWith({ agility: pts(3) }, { equipped: { reel: 1 } }) }) });
  // 引いた値は同じ。待つ時間だけが 0.7 倍。
  assert.equal(fast.cast.waitMs, plain.cast.waitMs);
  update(plain, plain.config.castMs);
  update(fast, fast.config.castMs);
  let tp = 0;
  let tf = 0;
  while (plain.phase === PHASES.WAITING) (update(plain, 1), (tp += 1));
  while (fast.phase === PHASES.WAITING) (update(fast, 1), (tf += 1));
  assert.ok(Math.abs(tf - Math.max(1000, tp * 0.7)) <= 2, `${tf} / ${tp}`);
  // 魚の系統の乱数の並び(drawCast)は、スキルに関係なく同じ。
  const a = createRng(5);
  const b = createRng(5);
  for (let i = 0; i < 50; i++) assert.deepEqual(drawCast(a, DEFAULT_CONFIG, 3), drawCast(b, DEFAULT_CONFIG, 3));
});

test("追加クリティカル:100% 以下は前と同じ、120% は 1 段 80%・2 段 20%、250% は 2 段 50%・3 段 50%", () => {
  const stats = (c) => ({ ...DEFAULT_CONFIG.combat, critChance: c });
  // 100% 以下:段数は「乱数 < 確率」なら 1、そうでなければ 0(前の判定と同じ)。
  const rng = createRng(1);
  for (let i = 0; i < 2000; i++) {
    const roll = rng();
    for (const c of [0, 0.1, 0.55, 1]) assert.equal(critStages({ roll, stats: stats(c) }, DEFAULT_CRIT_RULES), roll < c ? 1 : 0);
  }
  const share = (c) => {
    const r = createRng(7);
    const counts = {};
    for (let i = 0; i < 20000; i++) {
      const s = critStages({ roll: r(), stats: stats(c) }, DEFAULT_CRIT_RULES);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / 20000) * 100]));
  };
  const s120 = share(1.2);
  assert.deepEqual(Object.keys(s120).sort(), ["1", "2"]);
  assert.ok(Math.abs(s120[1] - 80) <= 2 && Math.abs(s120[2] - 20) <= 2, JSON.stringify(s120));
  const s250 = share(2.5);
  assert.deepEqual(Object.keys(s250).sort(), ["2", "3"]);
  assert.ok(Math.abs(s250[2] - 50) <= 2 && Math.abs(s250[3] - 50) <= 2, JSON.stringify(s250));
});

test("追加クリティカルのダメージは倍率の段数乗。安全上限(段数・総倍率・ダメージ)が働く", () => {
  const s = { ...DEFAULT_CONFIG.combat, damage: 10, critMultiplier: 2 };
  assert.deepEqual([0, 1, 2, 3].map((n) => hitDamage(s, n, LIMITS)), [10, 20, 40, 80]);
  assert.equal(hitDamage(s, true), 20, "前の形(true)も 1 段");
  assert.equal(critStages({ roll: 0, stats: { critChance: 1e9 } }, DEFAULT_CRIT_RULES, LIMITS.maxCritStages), LIMITS.maxCritStages);
  const huge = { damage: 1000000, critMultiplier: 100 };
  assert.equal(hitDamage(huge, 20, LIMITS), LIMITS.maxHitDamage);
  assert.ok(hitDamage({ damage: 1, critMultiplier: 100 }, 20, LIMITS) <= LIMITS.maxCritTotalMultiplier);
});

test("戦いの中:会心率 115% だと、当たりは 1 段か 2 段。当たりのたびに乱数 1 回(前と同じ回数)", () => {
  const gear = gearWith({ "crit-rate": pts(7) }, { equipped: { reel: 1 } });
  const game = createGame(3, { progress: progressAt(9, ROD_STEPS.NONE, { gear }), content: makeContent() });
  // 段階 9 は表にないので、最大は段階で計算する(2 + 9 = 11)。会心率 10% + 105%(Lv7)= 115%。
  assert.ok(Math.abs(game.combat.critChance - 1.15) < 1e-9);
  // 乱数の回数:当たりの数と、クリティカルの系統から引いた数が同じ(fight の critRng の呼び出しを数える)。
  for (let t = 0; t < 600000 && game.phase !== PHASES.MINIGAME; t += 5) {
    update(game, 5);
    if (game.phase === PHASES.BITE && game.cast.kind === "strong" && game.phaseMs >= 1100) tap(game);
  }
  let calls = 0;
  const orig = game.fight.critRng;
  game.fight.critRng = () => ((calls += 1), orig());
  const stages = new Set();
  let hits = 0;
  while (game.phase === PHASES.MINIGAME) {
    const z = game.fight.zone;
    if (Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02) {
      const r = tap(game);
      hits += 1;
      stages.add(r.critStages);
      assert.ok(r.critStages === 1 || r.critStages === 2);
    }
    update(game, 2);
  }
  assert.equal(calls, hits);
});

test("安全:どんなスキルの組み合わせ・ポイントでも、戦いは必ず終わり、値は範囲の中", () => {
  const rng = createRng(11);
  for (let trial = 0; trial < 60; trial++) {
    const points = Object.fromEntries(SKILL_ROWS.map((s) => [s.id, Math.floor(rng() * 200)]));
    const base = gearWith(points);
    // ルアー(命中範囲)も、とても大きな値まで混ぜる。
    const lure = { id: 2, kind: "lure", rarity: "legend", grade: 5, value: Math.floor(rng() * 5000), skills: [] };
    const gear = { ...base, items: [...base.items, lure], equipped: { reel: 1, lure: 2 }, nextId: 3 };
    const game = createGame(trial, { progress: progressAt(1 + (trial % 6), ROD_STEPS.NONE, { gear }), content: makeContent() });
    const c = game.combat;
    assert.ok(c.damage >= 1 && c.missHeal >= 0 && c.critChance >= 0 && c.critMultiplier >= 1);
    for (const ring of [c.hook.normal, c.hook.strong]) {
      assert.ok(ring.successMs <= ring.ringMs - LIMITS.minHookEarlyMs, "成功帯は輪の中");
      assert.ok(ring.justMs <= ring.successMs, "ジャスト帯は成功帯以下");
    }
    assert.ok(game.rates.wait >= 0);
    let t = 0;
    const r = createRng(trial);
    while (game.results.length < 3 && t < 900000) {
      update(game, 16);
      t += 16;
      if (game.phase === PHASES.WAITING) assert.ok(game.phaseMs <= Math.max(DEFAULT_CONFIG.skills.minWaitMs, game.cast.waitMs) + 16);
      if (game.phase === PHASES.BITE && r() < 0.2) tap(game);
      if (game.phase === PHASES.MINIGAME) {
        assert.ok(game.fight.timeLimitMs >= LIMITS.minTimeLimitMs);
        const width = game.fight.zone.end - game.fight.zone.start;
        assert.ok(width <= Math.max(LIMITS.maxZoneWidth, game.cast.minigame.zoneWidth) + 1e-9 && width >= 0.1 - 1e-9, "命中範囲は上限と下限の中");
        assert.ok(game.fight.zone.start >= 0 && game.fight.zone.end <= 1);
        const { stats } = triggeredStats(game);
        assert.ok(stats.damage >= 1 && stats.damage <= LIMITS.maxDamage && stats.critChance <= LIMITS.maxCritChance);
        if (r() < 0.1) {
          const res = tap(game);
          if (res?.action === "hit") assert.ok(res.damage >= 1 && res.damage <= LIMITS.maxHitDamage);
        }
      }
      if (game.phase === PHASES.RESTING) tap(game);
    }
    assert.ok(game.results.length >= 3, `組み合わせ ${trial} で進まない`);
  }
});

test("データ駆動:既にある戦闘の数値を使うスキルを表に 1 行足すと、抽選・計算に加わる", () => {
  const heal = {
    id: "heal-up",
    name: "回復増",
    type: "growth",
    target: { kind: "combat", stat: "missHeal", op: "add" },
    perLevel: 5,
    display: { label: "外したときの回復", scale: 1, unit: "", sign: "+" },
    description: "テスト用。",
  };
  const skills = [...SKILL_ROWS, heal];
  const content = makeContent(undefined, undefined, undefined, skills);
  const crates = makeCrates(content, DEFAULT_CONFIG);
  const p = progressAt(5, ROD_STEPS.NONE, { coins: 1e12, gear: { ...emptyGear(), seed: 3 } });
  for (let i = 0; i < 10; i++) pullCrate(p, crates[4], 10, content.equipKinds, DEFAULT_CONFIG.gacha, { skills, config: SK });
  const item = p.gear.items.find((it) => it.skills.some((s) => s.id === "heal-up"));
  assert.ok(item, "抽選に加わる");
  p.gear.equipped[item.kind] = item.id;
  const game = createGame(1, { content, progress: p });
  const level = game.skills["heal-up"].level;
  assert.ok(level >= 1);
  assert.equal(game.combat.missHeal, 10 + 5 * level);
  assert.deepEqual(applySkillsToCombat({ missHeal: 10 }, { "heal-up": { total: 2, level: 2, max: 9 } }, skills), { missHeal: 20 });
});

test("装備 1 個のレベルの範囲:レア度とグレードで大きく、少し重なる。最大のレベルの装備 3 個で段階の最大に届く", () => {
  assert.deepEqual(levelRange("legend", 1, SK), { min: 1, max: 2 }, "序盤の高レアで Lv1〜2");
  assert.deepEqual(levelRange("rare", 1, SK), { min: 1, max: 1 });
  assert.deepEqual(levelRange("legend", 5, SK), { min: 2, max: 4 });
  assert.deepEqual(levelRange("epic", 5, SK), { min: 1, max: 2 });
  assert.deepEqual(levelRange("rare", 5, SK), { min: 1, max: 2 });
  assert.ok(levelRange("legend", 3, SK).max > levelRange("rare", 3, SK).max);
  assert.ok(levelRange("legend", 5, SK).min <= levelRange("epic", 5, SK).max, "重なる");
  for (const stage of [1, 2, 3, 4, 5, 6]) {
    const max = maxLevel(byId("power"), stage, SK);
    assert.ok(3 * levelRange("legend", stage, SK).max >= max, `段階 ${stage}:最大のレベルの装備 3 個で届く`);
  }
  // 頭打ち型(Lv3)は、良い装備 2 個(段階 5 のレジェンドの上限 4)で届く。
  assert.ok(levelRange("legend", 5, SK).max * 2 >= 3);
});

test("refreshCombat を呼ばない限り、装備を外しても前の表のまま(画面が呼ぶ)", () => {
  const game = createGame(1, { progress: progressAt(5, ROD_STEPS.NONE, { gear: gearWith({ power: pts(2) }, { equipped: { reel: 1 } }) }) });
  const before = game.combat.damage;
  delete game.progress.gear.equipped.reel;
  assert.equal(game.combat.damage, before);
  refreshCombat(game);
  assert.equal(game.combat.damage, 10);
});
