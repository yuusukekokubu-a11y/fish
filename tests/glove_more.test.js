// グローブの ②-5c の能力 5 個(D-340・D-344)のテスト:連鎖・連撃加速・芯の達人・縁の達人・追い風と、10 個の抽選。

import assert from "node:assert/strict";
import { test } from "node:test";

import { lureZoneWidth } from "../src/core/combat.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT, FISH_KINDS } from "../src/core/fish.js";
import { createGame, fightSweepMs, PHASES, tap, update, zoneBand } from "../src/core/fishing.js";
import { crateRng, drawGlove, GLOVE_ABILITY_ROWS } from "../src/core/glove.js";
import { bandRules, chainBonus, chainZoneWidth } from "../src/core/glove_play.js";
import { startQuickFight } from "../src/ui/debug_view.js";
import { gaugeBands } from "../src/ui/fight_view.js";
import { progressAt } from "./helpers.js";

/** グローブ 1 個を付けた持ち物。 */
function wearing(ability, rarity, grade) {
  return { items: [{ id: 1, ability, rarity, grade }], equipped: 1, nextId: 2, rolls: 0 };
}

/** 段階 stage のヌシと戦いを始める(装備 items・グローブ gloves)。 */
function fightWith(stage, gloves, items = []) {
  const own = items.map((it, i) => ({ id: i + 1, ...it }));
  const gear = { items: own, equipped: Object.fromEntries(own.map((it) => [it.kind, it.id])), draws: 0, seed: 7, nextId: own.length + 1 };
  const p = progressAt(stage, "none", { gear });
  if (gloves) p.gloves = gloves;
  const boss = DEFAULT_CONTENT.fish.find((f) => f.kind === FISH_KINDS.BOSS && f.stage === stage);
  const game = createGame(1, { progress: p });
  assert.equal(startQuickFight(game, boss.id, "good").ok, true);
  return game;
}

/** 印が position にある時刻へ進めてタップする。 */
function tapAt(game, position) {
  const sweep = fightSweepMs(game);
  const base = Math.ceil((game.phaseMs + 1) / (2 * sweep)) * 2 * sweep;
  update(game, base + position * sweep - game.phaseMs);
  return tap(game);
}

const center = (game) => (game.fight.zone.start + game.fight.zone.end) / 2;
const farMiss = (zone) => (zone.start > 0.5 ? zone.start / 4 : (1 + zone.end) / 2 + (1 - zone.end) / 4);
const width = (game) => game.fight.zone.end - game.fight.zone.start;

test("抽選:能力は 10 個。レジェンドは各 1/10 前後、自動合わせはグローブ全体の約 0.5%(10 万回)", () => {
  assert.equal(GLOVE_ABILITY_ROWS.length, 10);
  assert.ok(GLOVE_ABILITY_ROWS.every((a) => a.weight === 1), "重みは全部同じ");
  const N = 100000;
  const legend = new Map();
  let legends = 0;
  let auto = 0;
  for (let i = 0; i < N; i++) {
    const rng = crateRng(99, i);
    rng();
    const g = drawGlove(rng, 5);
    if (g.rarity === "legend") {
      legends += 1;
      legend.set(g.ability, (legend.get(g.ability) ?? 0) + 1);
    }
    if (g.ability === "auto-hook") auto += 1;
  }
  assert.equal(legend.size, 10);
  for (const [id, n] of legend) assert.ok(Math.abs(n / legends - 0.1) < 0.015, `${id}:${n} / ${legends}`);
  assert.ok(Math.abs(auto / N - 0.005) < 0.001, `自動合わせ ${auto}`);
});

test("連鎖:連撃の段数ごとに命中範囲が +1/1.5/2/3% 広がる。ミスで戻る。ルアーと合わせて 70% まで、下限 5%(安全の下限:D-381)", () => {
  for (const [rarity, per] of [["normal", 0.01], ["rare", 0.015], ["epic", 0.02], ["legend", 0.03]]) {
    const game = fightWith(10, wearing("chain", rarity, 10));
    const base = game.cast.minigame.zoneWidth;
    const limits = { minZoneWidth: DEFAULT_CONFIG.minigame.minZoneWidth, maxZoneWidth: DEFAULT_CONFIG.combatLimits.maxZoneWidth };
    assert.ok(Math.abs(width(game) - base) < 1e-9, "段数 0 は元の幅");
    for (let k = 1; k <= 4 && game.phase === PHASES.MINIGAME; k++) {
      tapAt(game, center(game));
      assert.equal(game.fight.combo, k);
      const expected = lureZoneWidth(base, { zoneWidthBonus: per * 100 * k }, limits);
      assert.ok(Math.abs(width(game) - expected) < 1e-9, `${rarity} ${k} 段`);
      assert.ok(Math.abs(chainBonus(game) - per * k) < 1e-12);
    }
    // ミスで段数が 0 に戻り、幅も戻る。
    tapAt(game, farMiss(game.fight.zone));
    assert.equal(game.fight.combo, 0);
    assert.ok(Math.abs(width(game) - base) < 1e-9, `${rarity} ミスで戻る`);
  }
  // 上限:ルアーとの合計で、ゲージの 70% をこえない。下限:10%。
  const game = fightWith(10, wearing("chain", "legend", 10));
  game.fight.combo = 10;
  game.combat = { ...game.combat, zoneWidthBonus: 500 };
  assert.equal(chainZoneWidth(game, 0.2), DEFAULT_CONFIG.combatLimits.maxZoneWidth);
  game.combat = { ...game.combat, zoneWidthBonus: 0 };
  game.fight.combo = 1;
  assert.equal(chainZoneWidth(game, 0.01), DEFAULT_CONFIG.minigame.minZoneWidth);
  // 付けていなければ null(前と同じ道)。
  assert.equal(chainZoneWidth(fightWith(10, null), 0.2), null);
});

test("連撃加速:3 回に 1 回/2 回に 1 回/3 回に 2 回/毎回、段数が追加で 1 上がる。最大 10。ミスで 0 に戻る", () => {
  for (const [rarity, extras] of [
    ["normal", [0, 0, 1, 0, 0, 1]],
    ["rare", [0, 1, 0, 1, 0, 1]],
    ["epic", [0, 1, 1, 0, 1, 1]],
    ["legend", [1, 1, 1, 1, 1, 1]],
  ]) {
    const game = fightWith(10, wearing("combo-accel", rarity, 10));
    let combo = 0;
    extras.forEach((extra, i) => {
      const r = tapAt(game, center(game));
      // 命中で +1。加速は、そのあと 10 段に届いていなければ、さらに +1。
      const accel = extra === 1 && combo + 1 < 10;
      combo += 1 + (accel ? 1 : 0);
      assert.equal(game.fight.combo, combo, `${rarity} ${i + 1} 回目`);
      assert.equal(Boolean(r.accel), accel);
    });
    tapAt(game, farMiss(game.fight.zone));
    assert.equal(game.fight.combo, 0, "ミスで 0");
  }
  // 最大の段数(10)をこえない:10 段に届いたあとは、加速しない(段数は命中で 1 ずつ。効くのは 10 段まで)。
  const game = fightWith(10, wearing("combo-accel", "legend", 10));
  const accels = [];
  for (let i = 0; i < 8 && game.phase === PHASES.MINIGAME; i++) accels.push(Boolean(tapAt(game, center(game)).accel));
  assert.deepEqual(accels, [true, true, true, true, true, false, false, false]);
  assert.equal(game.fight.combo, 13);
});

test("芯の達人・縁の達人:帯の割合が増える。芯と縁は重ならず、通常の帯は 20% 残る。芯・縁のスキルがなければ効かない", () => {
  const { coreRatio, edgeRatio } = DEFAULT_CONFIG.skills;
  for (const [rarity, core, edge] of [["normal", 0.05, 0.04], ["rare", 0.08, 0.06], ["epic", 0.12, 0.09], ["legend", 0.18, 0.14]]) {
    const c = bandRules(fightWith(10, wearing("core-master", rarity, 10)));
    assert.ok(Math.abs(c.coreRatio - (coreRatio + core)) < 1e-12 && c.edgeRatio === edgeRatio, `芯 ${rarity}`);
    const e = bandRules(fightWith(10, wearing("edge-master", rarity, 10)));
    assert.ok(Math.abs(e.edgeRatio - (edgeRatio - edge)) < 1e-12 && e.coreRatio === coreRatio, `縁 ${rarity}`);
  }
  // 通常の帯は最低 20%(芯と縁の距離)。境界:表の芯 0.5・縁 0.75 なら、芯は 0.55 で止まる。
  const tight = fightWith(10, wearing("core-master", "legend", 10));
  tight.config = { ...tight.config, skills: { ...tight.config.skills, coreRatio: 0.5, edgeRatio: 0.75 } };
  assert.ok(Math.abs(bandRules(tight).coreRatio - 0.55) < 1e-12);
  const tightEdge = fightWith(10, wearing("edge-master", "legend", 10));
  tightEdge.config = { ...tightEdge.config, skills: { ...tightEdge.config.skills, coreRatio: 0.5, edgeRatio: 0.75 } };
  assert.ok(Math.abs(bandRules(tightEdge).edgeRatio - 0.7) < 1e-12);
  // 芯のスキルを付けていないと、帯の色分けも効果もない(帯の割合だけ変わる)。
  const noSkill = fightWith(10, wearing("core-master", "legend", 10));
  assert.equal(gaugeBands(noSkill), null);
  // 芯のスキルを付けると、広がった芯の帯で「芯」になる(中心からの距離 0.4:表の 0.3 なら通常)。
  const coreItem = { kind: "reel", rarity: "rare", grade: 10, value: 30, skills: [{ id: "core", level: 1 }] };
  const withSkill = fightWith(10, wearing("core-master", "legend", 10), [coreItem]);
  const plain = fightWith(10, null, [coreItem]);
  for (const g of [withSkill, plain]) {
    const z = g.fight.zone;
    const pos = (z.start + z.end) / 2 + ((z.end - z.start) / 2) * 0.4;
    g.result = zoneBand(pos, z, bandRules(g));
  }
  assert.deepEqual([withSkill.result, plain.result], ["core", "normal"]);
  assert.equal(gaugeBands(withSkill).core, 0.48);
  assert.equal(gaugeBands(plain).core, 0.3);
});

test("追い風:命中のたびに制限時間が +0.2/0.3/0.4/0.6 秒。戦闘ごとに +3 秒まで。次の戦闘には持ち越さない", () => {
  for (const [rarity, per] of [["normal", 200], ["rare", 300], ["epic", 400], ["legend", 600]]) {
    const game = fightWith(10, wearing("tailwind", rarity, 10));
    const limit = game.fight.timeLimitMs;
    let added = 0;
    for (let i = 0; i < 6 && game.phase === PHASES.MINIGAME; i++) {
      const r = tapAt(game, center(game));
      const step = Math.min(per, 3000 - added);
      added += step;
      assert.equal(r.tailwind ?? 0, step, `${rarity} ${i + 1} 回目`);
      assert.equal(game.fight.timeLimitMs, limit + added);
    }
  }
  // 上限 +3 秒(レジェンドは 5 回で上限)。
  const game = fightWith(10, wearing("tailwind", "legend", 10));
  const limit = game.fight.timeLimitMs;
  for (let i = 0; i < 8 && game.phase === PHASES.MINIGAME; i++) tapAt(game, center(game));
  assert.equal(game.fight.timeLimitMs, limit + 3000);
  // 次の戦闘は元の制限時間から。
  const next = fightWith(10, wearing("tailwind", "legend", 10));
  assert.equal(next.fight.timeLimitMs, limit);
  assert.equal(next.fight.tailwindMs, 0);
});

test("ほかの能力を付けているとき、新しい能力の効果は出ない(連鎖・加速・帯・追い風)", () => {
  const game = fightWith(10, wearing("insurance", "legend", 10));
  const base = game.cast.minigame.zoneWidth;
  const limit = game.fight.timeLimitMs;
  for (let i = 0; i < 4 && game.phase === PHASES.MINIGAME; i++) {
    const r = tapAt(game, center(game));
    assert.equal(r.accel, undefined);
    assert.equal(r.tailwind, undefined);
  }
  assert.equal(game.fight.combo, 4);
  assert.ok(Math.abs(width(game) - base) < 1e-9);
  assert.equal(game.fight.timeLimitMs, limit);
  assert.equal(bandRules(game), game.config.skills);
});
