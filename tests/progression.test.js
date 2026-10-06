// 魚の出現・報酬・竿の工程・乱数の系統のテスト(受け入れ条件 1・2・3・4・8・10)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { FISH_LIST, fishById, STAGE_LIST } from "../src/core/fish.js";
import {
  canChallengeBoss,
  challengeBoss,
  craftGameRod,
  createGame,
  currentMarker,
  drawCast,
  evolveGameRod,
  FISH_KINDS,
  OUTCOMES,
  PHASES,
  tap,
  update,
} from "../src/core/fishing.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { createRng } from "../src/core/rng.js";
import { hookJust, makeAimCenter, makePlayer, mean, progressAt, readText } from "./helpers.js";

const play = makePlayer({ update, tap, PHASES });
const aimCenter = makeAimCenter(currentMarker);
const STAGES = STAGE_LIST.map((s) => s.stage);
const ORDER = JSON.parse(readText("tests/fixtures/fish_order.json"));
const SKILLED = { hook: hookJust, fight: aimCenter, resume: true };

function castsAt(seed, rodStage, n) {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => drawCast(rng, DEFAULT_CONFIG, rodStage));
}

test("竿の段階 n では、段階 n 以下の弱い魚・強い魚だけが出る(ヌシは出ない)", () => {
  for (const stage of STAGES) {
    for (const seed of [1, 2, 3]) {
      for (const cast of castsAt(seed, stage, 2000)) {
        assert.ok(cast.fish.stage <= stage, `段階 ${stage} で ${cast.fish.name}`);
        assert.notEqual(cast.kind, FISH_KINDS.BOSS);
        assert.equal(cast.fish.kind, cast.kind);
      }
    }
  }
});

test("段階 n では、段階 n 以下の弱い魚・強い魚の全種類が出る", () => {
  for (const stage of STAGES) {
    const seen = new Set(castsAt(7, stage, 6000).map((c) => c.fish.id));
    // 竿の段階が属する釣り場の、最初の段階〜竿の段階の魚(D-275)。
    const first = stage <= 5 ? 1 : 6;
    const expected = FISH_LIST.filter((f) => f.stage >= first && f.stage <= stage && f.kind !== FISH_KINDS.BOSS).map((f) => f.id);
    assert.deepEqual([...seen].sort(), [...expected].sort(), `段階 ${stage}`);
  }
});

test("新しい魚ほど出やすい(区分ごとに、釣り場の中で段階が上の魚の回数が多い)", () => {
  for (const [stage, first] of [[5, 1], [10, 6]]) {
    const casts = castsAt(11, stage, 40000);
    for (const kind of [FISH_KINDS.WEAK, FISH_KINDS.STRONG]) {
      const counts = FISH_LIST.filter((f) => f.kind === kind && f.stage >= first && f.stage <= stage).map((f) => casts.filter((c) => c.fish.id === f.id).length);
      assert.equal(counts.length, 5);
      for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], `${kind}:${counts}`);
    }
  }
});

/** 遊びながら、投げるたびに「待ち時間・魚・最初の当たり範囲」を集める。 */
function castsWhilePlaying(seed, rodStage, n, options) {
  const game = createGame(seed, { progress: progressAt(rodStage) });
  const rows = [];
  let last = 0;
  const record = (g) => {
    if (g.castCount !== last) {
      rows.push([g.cast.waitMs, g.cast.fish.id, g.cast.zone ? g.cast.zone.start : null]);
      last = g.castCount;
    }
  };
  record(game);
  for (let t = 0; rows.length < n && t < 3600000; t += 16) {
    update(game, 16);
    if (game.phase === PHASES.BITE && options.hook(game)) tap(game);
    else if (game.phase === PHASES.MINIGAME && options.fight(game)) tap(game);
    else if (game.phase === PHASES.RESTING) tap(game);
    record(game);
  }
  return rows;
}

test("待ち時間と魚の並びは、操作によらず記録(fish_order.json)と同じ(全段階・シード複数)", () => {
  const ways = {
    何もしない: { hook: () => false, fight: () => false },
    上手に遊ぶ: { hook: hookJust, fight: aimCenter },
    連打する: { hook: () => true, fight: () => true },
    ときどき合わせる: { hook: (g) => g.castCount % 3 === 0 && hookJust(g), fight: (g) => g.phaseMs > 2000 },
  };
  for (const [key, expected] of Object.entries(ORDER.casts)) {
    const [stage, seed] = key.split("-").map(Number);
    assert.deepEqual(castsAt(seed, stage, expected.length).map((c) => [c.waitMs, c.fish.id, c.zone ? c.zone.start : null]), expected, key);
    for (const [name, way] of Object.entries(ways)) {
      assert.deepEqual(castsWhilePlaying(seed, stage, expected.length, way), expected, `${key} ${name}`);
    }
  }
});

test("全段階で、待ち時間の平均は 3〜6 秒、強い魚は 2000 回中 10% ±2 ポイント", () => {
  for (const stage of STAGES) {
    for (const seed of [1, 2, 3, 12345]) {
      const casts = castsAt(seed, stage, 2000);
      const avg = mean(casts.map((c) => c.waitMs));
      assert.ok(avg >= 3000 && avg <= 6000, `段階 ${stage} seed ${seed}:平均 ${avg}`);
      const ratio = casts.filter((c) => c.kind === FISH_KINDS.STRONG).length / 2000;
      assert.ok(Math.abs(ratio - 0.1) <= 0.02, `段階 ${stage} seed ${seed}:${ratio}`);
    }
  }
});

test("報酬:段階が上の魚ほどウロコインが多い。弱い魚は鱗なし、強い魚とヌシは鱗 1", () => {
  for (const kind of Object.values(FISH_KINDS)) {
    const list = FISH_LIST.filter((f) => f.kind === kind).sort((a, b) => a.stage - b.stage);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].reward.coins > list[i - 1].reward.coins, list[i].name);
    for (const f of list) assert.equal(f.reward.scales, kind === FISH_KINDS.WEAK ? 0 : 1, f.name);
  }
});

test("報酬:釣れたら魚の報酬(強い魚は自分の鱗)、逃げられたら 0、弱い魚は鱗を落とさない", () => {
  const game = play(createGame(4, { progress: progressAt(3) }), 900000, {
    hook: (g) => g.castCount % 4 !== 0 && hookJust(g),
    fight: (g) => g.castCount % 3 !== 0 && aimCenter(g),
    resume: true,
  });
  const scales = {};
  let coins = 0;
  let escapedStrong = 0;
  for (const r of game.results) {
    const fish = fishById(r.fishId);
    if (r.outcome === OUTCOMES.CAUGHT) {
      // 弱い魚のジャストはウロコイン × 1.5(D-258)。
      const coins = fish.kind === FISH_KINDS.WEAK && r.hook === "just" ? Math.max(1, Math.round(fish.reward.coins * 1.5)) : fish.reward.coins;
      assert.deepEqual(r.reward, { ...fish.reward, coins });
      if (fish.kind === FISH_KINDS.STRONG) scales[fish.id] = (scales[fish.id] ?? 0) + 1;
    } else {
      assert.deepEqual(r.reward, { coins: 0, scales: 0 });
      if (fish.kind === FISH_KINDS.STRONG) escapedStrong += 1;
    }
    coins += r.reward.coins;
  }
  assert.ok(escapedStrong > 0 && Object.keys(scales).length > 0);
  assert.equal(game.progress.coins, coins);
  assert.deepEqual(game.progress.scales, scales);
});

test("初めて釣れた魚だけ firstCatch になり、一覧に加わる", () => {
  const game = play(createGame(4), 600000, SKILLED);
  const firsts = game.results.filter((r) => r.firstCatch).map((r) => r.fishId);
  assert.deepEqual(firsts, [...new Set(firsts)]);
  assert.deepEqual([...game.progress.seen].sort(), [...firsts].sort());
  assert.deepEqual([...game.progress.seen].sort(), ["aji", "kurodai"]);
});

test("次の段階の魚は、進化したあとの次の投げから初めて出る", () => {
  for (const stage of STAGES.slice(0, -1)) {
    const boss = STAGE_LIST[stage - 1].boss;
    const game = createGame(9, { progress: progressAt(stage, ROD_STEPS.DEFEATED, { scales: { [boss]: 1 } }) });
    play(game, 120000, SKILLED);
    assert.ok(game.results.every((r) => fishById(r.fishId).stage <= stage), "進化の前");
    assert.equal(evolveGameRod(game), true);
    assert.equal(game.progress.rodStage, stage + 1);
    const before = game.results.length;
    play(game, 600000, SKILLED);
    assert.ok(game.results.slice(before).some((r) => fishById(r.fishId).stage === stage + 1), `段階 ${stage + 1} の魚が出る`);
  }
});

/** 製作・ヌシ戦・進化をできるときにすぐ行う遊び方(同じシードなら同じ結果になるか確かめる)。 */
function playWithProgress(seed, totalMs) {
  const game = createGame(seed);
  const advanceRod = (g) => {
    craftGameRod(g);
    evolveGameRod(g);
    if (g.progress.rodStep === ROD_STEPS.CRAFTED && canChallengeBoss(g)) challengeBoss(g);
  };
  const actions = Array.from({ length: Math.floor(totalMs / 20000) }, (_, i) => ({ atMs: (i + 1) * 20000, run: advanceRod }));
  return play(game, totalMs, { ...SKILLED, actions });
}

test("同じシードと同じ操作なら、釣果・ウロコイン・鱗・竿の段階と工程が完全に一致する", () => {
  const a = playWithProgress(2024, 2400000);
  const b = playWithProgress(2024, 2400000);
  assert.ok(a.progress.rodStage >= 2, `段階 ${a.progress.rodStage}`);
  assert.ok(a.results.some((r) => r.kind === FISH_KINDS.BOSS), "ヌシ戦を含む");
  assert.deepEqual(a.progress, b.progress);
  assert.deepEqual(a.results, b.results);
});

test("詰み防止:弱い魚だけを釣っても、ウロコインは増え続ける", () => {
  for (const stage of [1, 3, 5]) {
    const game = createGame(6, { progress: progressAt(stage) });
    let last = 0;
    for (let minute = 1; minute <= 5; minute++) {
      play(game, 60000, { hook: (g) => g.cast.kind === FISH_KINDS.WEAK && hookJust(g), resume: true });
      assert.ok(game.progress.coins > last, `段階 ${stage}、${minute} 分目`);
      last = game.progress.coins;
    }
    assert.deepEqual(game.progress.scales, {}, "弱い魚だけなら鱗は増えない");
  }
});
