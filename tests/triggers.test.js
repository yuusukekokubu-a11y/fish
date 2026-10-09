// 条件発動型のスキル(連撃・攻、連撃・心、先手、ジャスト・ブースト、とどめ、勢い、先制)のテスト(②-4b2 の条件 3・4)。
// 境界の値で、条件と効果を確かめる。上乗せは戦闘が終わると消え、止めても保持される。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { challengeBoss, createGame, currentMarker, PHASES, tap, triggeredStats, update } from "../src/core/fishing.js";
import { emptyGear } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { advance, createSession, setPaused, tapSession } from "../src/ui/session.js";
import { NO_DEFENSE_CONTENT, progressAt } from "./helpers.js";

const noCrit = { ...DEFAULT_CONFIG.combat, critChance: 0 };

/** スキル(id → レベル)を付けたリールを装着した進み具合(段階 5。最大 Lv7)。 */
function progressWith(levels, stage = 5) {
  const skills = Object.entries(levels).map(([id, level]) => ({ id, level }));
  const item = { id: 1, kind: "reel", rarity: "legend", grade: 1, value: 0, skills };
  return progressAt(stage, ROD_STEPS.CRAFTED, { gear: { ...emptyGear(), seed: 1, items: [item], equipped: { reel: 1 }, nextId: 2 } });
}

/** 強い魚が掛かったら、輪の時間 hookAt で合わせて、戦いの場面まで進める。 */
function untilFight(game, hookAt = 1100) {
  for (let t = 0; t < 900000 && game.phase !== PHASES.MINIGAME; t += 5) {
    update(game, 5);
    if (game.phase === PHASES.BITE && game.cast.kind === "strong" && game.phaseMs >= hookAt) tap(game);
    else if (game.phase === PHASES.RESTING) tap(game);
  }
  assert.equal(game.phase, PHASES.MINIGAME);
  return game;
}

/** ヌシ戦を始める(合わせなし)。 */
function bossFight(levels, combat = noCrit, config = DEFAULT_CONFIG) {
  const game = createGame(5, { content: NO_DEFENSE_CONTENT, combat, config, progress: progressWith(levels, 1) });
  assert.equal(challengeBoss(game), true);
  return game;
}

function hitOnce(game) {
  for (let i = 0; i < 4000; i++) {
    const z = game.fight.zone;
    if (Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02) return tap(game);
    update(game, 2);
  }
  throw new Error("命中しない");
}

function missOnce(game) {
  for (let i = 0; i < 4000; i++) {
    const z = game.fight.zone;
    const p = currentMarker(game);
    if (p < z.start - 0.05 || p > z.end + 0.05) return tap(game);
    update(game, 2);
  }
  throw new Error("ミスできない");
}

test("連撃・攻:続けて命中するたびダメージ +1 × Lv(1 段目は +0)。ミスで途切れる。最大段数で止まる", () => {
  const game = bossFight({ "combo-power": 2 }); // ヌシ・クロダイ 体力 70
  assert.deepEqual([hitOnce(game).damage, hitOnce(game).damage, hitOnce(game).damage], [10, 12, 14]);
  assert.equal(game.fight.combo, 3);
  missOnce(game);
  assert.equal(game.fight.combo, 0, "ミスで 0 に戻る");
  assert.equal(hitOnce(game).damage, 10);
  // 最大段数(表で持つ)をこえない。
  const capped = bossFight({ "combo-power": 2 }, noCrit, { ...DEFAULT_CONFIG, skills: { ...DEFAULT_CONFIG.skills, comboMax: 1 } });
  assert.deepEqual([hitOnce(capped).damage, hitOnce(capped).damage, hitOnce(capped).damage], [10, 12, 12]);
});

test("連撃・心:段数 × 3% × Lv を会心率に足す。連撃の段数は連撃・攻と共有する", () => {
  const game = bossFight({ "combo-crit": 3, "combo-power": 1 });
  assert.equal(triggeredStats(game).stats.critChance, 0);
  hitOnce(game);
  hitOnce(game);
  const { stats, active } = triggeredStats(game);
  assert.ok(Math.abs(stats.critChance - 2 * 0.09) < 1e-9);
  assert.equal(stats.damage, 12, "同じ 2 段で連撃・攻も効く");
  assert.deepEqual(active, ["combo"]);
  // 最大段数 10 をこえない。
  game.fight.combo = 25;
  assert.ok(Math.abs(triggeredStats(game).stats.critChance - 10 * 0.09) < 1e-9);
});

test("先手:合わせ成功(ふつう・ジャスト)とヌシ戦の始まりのあと、最初の命中だけ +4 × Lv", () => {
  const good = untilFight(createGame(3, { content: NO_DEFENSE_CONTENT, combat: noCrit, progress: progressWith({ "first-hit": 2 }) }), 1100);
  assert.equal(good.hookGrade, "good");
  // ミスをはさんでも、最初の命中まで残る。
  missOnce(good);
  const first = hitOnce(good);
  assert.equal(first.damage, 18);
  assert.ok(first.triggers.includes("firstHit"));
  if (good.phase === PHASES.MINIGAME) assert.equal(hitOnce(good).damage, 10, "2 回目からは効かない");
  // ジャスト:初撃(10 × 2)のあとの最初の命中に、先手が乗る(D-256)。
  const just = untilFight(createGame(3, { content: NO_DEFENSE_CONTENT, combat: noCrit, progress: progressWith({ "first-hit": 2 }) }), 1000);
  assert.equal(just.hookGrade, "just");
  assert.equal(just.fight.strike.damage, 20, "初撃に先手は乗らない");
  assert.equal(hitOnce(just).damage, 18, "初撃のあとの最初の命中に先手 +8");
  assert.equal(hitOnce(bossFight({ "first-hit": 1 })).damage, 14, "ヌシ戦は合わせの成功とみなす(D-187)");
  // 合わせの失敗(早すぎ)では戦いにならない。
  const early = createGame(3, { content: NO_DEFENSE_CONTENT, combat: noCrit, progress: progressWith({ "first-hit": 2 }) });
  for (let t = 0; t < 900000 && !(early.phase === PHASES.BITE && early.cast.kind === "strong"); t += 5) update(early, 5);
  assert.deepEqual(tap(early), { action: "hook", grade: "early" });
  assert.notEqual(early.phase, PHASES.MINIGAME);
});

test("ジャスト・ブースト:強い魚のジャストのときだけ、初撃のジャスト倍率 +0.08 × Lv(D-407)。ふつうの成功とヌシ戦では効かない(D-257)", () => {
  const just = untilFight(createGame(3, { content: NO_DEFENSE_CONTENT, combat: noCrit, progress: progressWith({ "just-boost": 2 }) }), 1000);
  assert.ok(Math.abs(just.fight.strike.multiplier - 2.16) < 1e-9);
  assert.equal(just.fight.strike.damage, 22);
  assert.equal(hitOnce(just).damage, 10, "命中には効かない");
  const good = untilFight(createGame(3, { content: NO_DEFENSE_CONTENT, combat: noCrit, progress: progressWith({ "just-boost": 2 }) }), 1100);
  assert.equal(good.fight.strike, null);
  assert.equal(hitOnce(good).damage, 10);
  const boss = bossFight({ "just-boost": 7 });
  assert.equal(boss.fight.strike, null);
  assert.equal(hitOnce(boss).damage, 10);
});

test("とどめ:体力が最大の 25% 以下(ちょうどを含む)のとき、ダメージ +15% × Lv", () => {
  const game = bossFight({ finisher: 2 });
  game.fight.maxHp = 80;
  game.fight.hp = 21;
  assert.equal(triggeredStats(game).stats.damage, 10, "26.25% は効かない");
  game.fight.hp = 20;
  assert.equal(triggeredStats(game).stats.damage, 13, "25% ちょうどは効く(10 × 1.3)");
  assert.deepEqual(triggeredStats(game).active, ["lowHp"]);
  game.fight.hp = 1;
  assert.equal(triggeredStats(game).stats.damage, 13);
});

test("勢い:クリティカルが出た直後の 1 回だけ、会心率 +10% × Lv", () => {
  const game = bossFight({ momentum: 3 }, { ...DEFAULT_CONFIG.combat, critChance: 0 });
  game.fight.critRng = () => 0.99;
  hitOnce(game);
  assert.equal(triggeredStats(game).stats.critChance, 0, "クリティカルでなければ付かない");
  game.fight.critRng = () => 0;
  game.combat = { ...game.combat, critChance: 0.01 };
  assert.equal(hitOnce(game).critical, true);
  assert.ok(Math.abs(triggeredStats(game).stats.critChance - 0.31) < 1e-9);
  assert.ok(triggeredStats(game).active.includes("afterCrit"));
  missOnce(game);
  assert.ok(Math.abs(triggeredStats(game).stats.critChance - 0.31) < 1e-9, "ミスでは消えない(次の命中まで)");
  game.fight.critRng = () => 0.99;
  hitOnce(game);
  assert.equal(triggeredStats(game).stats.critChance, 0.01, "次の命中で消える");
});

test("先制:体力が満タンで、その戦闘の最初の命中まで、会心率 +10% × Lv(満タンに戻しても、もう効かない:D-192)", () => {
  const game = bossFight({ "first-strike": 2 });
  assert.ok(Math.abs(triggeredStats(game).stats.critChance - 0.2) < 1e-9);
  missOnce(game);
  assert.ok(Math.abs(triggeredStats(game).stats.critChance - 0.2) < 1e-9, "満タンでのミスでは消えない");
  game.fight.critRng = () => 0.99;
  hitOnce(game);
  assert.equal(triggeredStats(game).stats.critChance, 0, "満タンでなくなると効かない");
  game.fight.hp = game.fight.maxHp;
  assert.equal(triggeredStats(game).stats.critChance, 0, "ミスで満タンに戻しても、最初の命中のあとは効かない");
  assert.ok(!triggeredStats(game).active.includes("fullHp"));
});
test("上乗せは戦いが終わると消え、次の戦いに持ち越さない。メニューで止めても保持される", () => {
  const game = bossFight({ "combo-power": 1, momentum: 1 }, { ...DEFAULT_CONFIG.combat, critChance: 1 });
  const session = createSession(game);
  hitOnce(game);
  hitOnce(game);
  const before = { combo: game.fight.combo, boosts: structuredClone(game.fight.boosts), hp: game.fight.hp, phaseMs: game.phaseMs };
  setPaused(session, true);
  advance(session, 100);
  assert.equal(tapSession(session), null);
  assert.deepEqual({ combo: game.fight.combo, boosts: game.fight.boosts, hp: game.fight.hp, phaseMs: game.phaseMs }, before);
  setPaused(session, false);
  while (game.phase === PHASES.MINIGAME) hitOnce(game);
  assert.equal(game.fight === null || game.phase !== PHASES.MINIGAME, true);
  // 次の戦い(強い魚)は 0 段・上乗せなしから。
  untilFight(game);
  assert.equal(game.fight.combo, 0);
  assert.deepEqual(game.fight.boosts, []);
});

test("条件発動型があっても、クリティカルの乱数は命中のたびに 1 回だけ", () => {
  const game = bossFight({ "combo-crit": 7, momentum: 7, "first-strike": 7, finisher: 7, "combo-power": 7, "first-hit": 7 }, DEFAULT_CONFIG.combat);
  let calls = 0;
  const orig = game.fight.critRng;
  game.fight.critRng = () => ((calls += 1), orig());
  let hits = 0;
  while (game.phase === PHASES.MINIGAME) {
    if (hitOnce(game).action === "hit") hits += 1;
  }
  assert.equal(calls, hits);
});

test("計算の順:基本(表 + 連撃・攻 × 段数 + 先手)→ とどめを掛けて四捨五入 → クリティカルの段数(ジャストは初撃だけで、命中には掛けない:D-256)", () => {
  const just = untilFight(createGame(3, { content: NO_DEFENSE_CONTENT, combat: { ...noCrit, critChance: 1, critMultiplier: 1.5 }, progress: progressWith({ "first-hit": 1, finisher: 1, "combo-power": 1 }) }), 1000);
  just.fight.hp = Math.floor(just.fight.maxHp * 0.25);
  just.fight.combo = 3;
  just.fight.critRng = () => 0.5;
  // (10 + 3 + 4) × 1.15 = 19.55 → 20、クリティカル 1 段 × 1.5 = 30。ジャストの倍率は命中には掛けない。
  assert.equal(hitOnce(just).damage, 30);
  // 連撃・心で会心率が 100% をこえると、追加クリティカル(2 段)。
  const over = bossFight({ "combo-crit": 3 }, { ...noCrit, critChance: 0.5 });
  over.fight.combo = 6; // 段階 1 の最大 Lv3:0.5 + 6 × 0.09 = 1.04
  over.fight.critRng = () => 0.03;
  const hit = hitOnce(over);
  assert.equal(hit.critStages, 2);
  assert.equal(hit.damage, 17, "10 × 1.3 × 1.3 = 16.9 → 17(倍率 1.3:D-255)");
});

test("戦闘の画面の小さな表示:連撃は 2 段から「連撃 ×n」、次の命中で効く条件の短い名前(持っているスキルだけ)", async () => {
  const { fightBadges } = await import("../src/ui/fight_view.js");
  const game = bossFight({ "first-hit": 1, "first-strike": 1, finisher: 1, "combo-power": 1 });
  assert.deepEqual(fightBadges(game), { combo: null, labels: ["先手", "先制"] });
  hitOnce(game);
  hitOnce(game);
  assert.deepEqual(fightBadges(game), { combo: "連撃 ×2", labels: [] });
  game.fight.hp = 5;
  assert.deepEqual(fightBadges(game).labels, ["とどめ"]);
  const plain = bossFight({});
  assert.deepEqual(fightBadges(plain), { combo: null, labels: [] }, "条件発動型がなければ何も出さない");
  assert.deepEqual(fightBadges(null), { combo: null, labels: [] });
});

test("データ駆動:既にある条件の種類を使う条件発動型を表に 1 行足すと、ガチャ・計算・スキルの画面に加わる", async () => {
  const { makeContent } = await import("../src/core/fish.js");
  const { makeCrates, pullCrate, EQUIP_KIND_ROWS } = await import("../src/core/gear.js");
  const { SKILL_ROWS } = await import("../src/core/skills.js");
  const { skillRows } = await import("../src/ui/skill_view.js");
  const row = {
    id: "finisher-crit",
    name: "とどめ・心",
    type: "growth",
    target: { kind: "trigger", when: "lowHp", effect: "critChance" },
    perLevel: 0.2,
    display: { label: "会心率", scale: 0.01, unit: "%", sign: "+", when: "魚の体力 25% 以下で" },
    description: "体力が残り少ないと、クリティカルが出やすい。",
  };
  const skills = [...SKILL_ROWS, row];
  const content = makeContent(undefined, undefined, undefined, skills);
  // ガチャ:抽選に加わる。
  const p = progressAt(5, ROD_STEPS.NONE, { coins: 1e12, gear: { ...emptyGear(), seed: 9 } });
  const crates = makeCrates(content, DEFAULT_CONFIG);
  let seen = false;
  for (let i = 0; i < 40 && !seen; i++) {
    pullCrate(p, crates[4], 10, EQUIP_KIND_ROWS, DEFAULT_CONFIG.gacha, { skills, config: DEFAULT_CONFIG.skills });
    seen = p.gear.items.some((it) => it.skills.some((s) => s.id === "finisher-crit"));
    p.gear.items = [];
  }
  assert.ok(seen, "抽選に加わる");
  // 計算:条件(体力 25% 以下)のときだけ、会心率に足される。
  const item = { id: 1, kind: "reel", rarity: "legend", grade: 1, value: 0, skills: [{ id: "finisher-crit", level: 2 }] };
  const game = createGame(5, { content, combat: noCrit, progress: progressAt(1, ROD_STEPS.CRAFTED, { gear: { ...emptyGear(), seed: 1, items: [item], equipped: { reel: 1 }, nextId: 2 } }) });
  challengeBoss(game);
  assert.equal(triggeredStats(game).stats.critChance, 0);
  game.fight.hp = 1;
  assert.ok(Math.abs(triggeredStats(game).stats.critChance - 0.4) < 1e-9);
  // スキルの画面:一覧に、条件つきの効果の一文で出る。
  const r = skillRows(game).find((x) => x.id === "finisher-crit");
  assert.equal(r.effect, "魚の体力 25% 以下で会心率 +40%");
  assert.equal(r.triggered, true);
});

test("スキルの画面:条件発動型も同じ一覧に、条件つきの一文で出る", async () => {
  const { skillRows } = await import("../src/ui/skill_view.js");
  const game = createGame(1, { progress: progressWith({ "combo-power": 2, "just-boost": 1, momentum: 3 }) });
  const rows = Object.fromEntries(skillRows(game).map((r) => [r.id, r]));
  assert.equal(rows["combo-power"].effect, "連続命中 1 段ごとにダメージ +2(最大 10 段)");
  assert.equal(rows["combo-power"].label, "Lv 2 / 7");
  assert.equal(rows["just-boost"].effect, "強い魚のジャストの初撃 +0.08 倍");
  assert.equal(rows.momentum.effect, "クリティカルの次の命中で会心率 +30%");
  assert.equal(rows["first-hit"].effect, "効果なし");
  assert.deepEqual(rows["combo-power"].levels.slice(0, 2).map((l) => l.effect), [
    "連続命中 1 段ごとにダメージ +1(最大 10 段)",
    "連続命中 1 段ごとにダメージ +2(最大 10 段)",
  ]);
});

test("魚の並びの独立:条件発動型・芯・縁のスキルとルアーを付けても、魚の乱数の並び(待ち時間・魚)は変わらない", () => {
  const play = (progress) => {
    const game = createGame(21, { progress });
    const casts = [];
    for (let t = 0; t < 600000; t += 16) {
      const before = game.castCount;
      update(game, 16);
      if (game.castCount !== before) casts.push([game.cast.fish.id, game.cast.waitMs]);
      if (game.phase === PHASES.BITE && game.phaseMs >= 1000) tap(game);
      else if (game.phase === PHASES.MINIGAME && game.phaseMs % 240 < 16) tap(game);
      else if (game.phase === PHASES.RESTING) tap(game);
    }
    return casts;
  };
  const plain = play(progressAt(5, ROD_STEPS.CRAFTED));
  const skills = Object.fromEntries(["combo-power", "combo-crit", "first-hit", "just-boost", "finisher", "momentum", "first-strike", "core", "edge"].map((id) => [id, 7]));
  const p = progressWith(skills);
  p.gear.items.push({ id: 2, kind: "lure", rarity: "legend", grade: 5, value: 58, skills: [] });
  p.gear.equipped.lure = 2;
  const built = play(p);
  assert.ok(plain.length > 30);
  assert.deepEqual(built.slice(0, 30), plain.slice(0, 30));
});
