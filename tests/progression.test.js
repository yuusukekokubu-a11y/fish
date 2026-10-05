// 魚の種類・報酬・竿の段階・乱数の系統のテスト(受け入れ条件 3・6・7・8)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { FISH_LIST, fishById } from "../src/core/fish.js";
import {
  createGame,
  currentMarker,
  drawCast,
  FISH_KINDS,
  OUTCOMES,
  PHASES,
  tap,
  update,
  upgradeGameRod,
} from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";
import { hookAlways, makeAimCenter, makePlayer, mean, readText } from "./helpers.js";

const play = makePlayer({ update, tap, PHASES });
const aimCenter = makeAimCenter(currentMarker);
const STAGES = [1, 2, 3, 4, 5];
const FIXTURE = JSON.parse(readText("tests/fixtures/issue4_stage1.json"));
const FIXTURE6 = JSON.parse(readText("tests/fixtures/issue6_casts.json"));
const SKILLED = { hook: hookAlways, fight: aimCenter, resume: true };

function progressAt(rodStage) {
  return { coins: 0, material: 0, rodStage, seen: [] };
}

function castsAt(seed, rodStage, n) {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => drawCast(rng, DEFAULT_CONFIG, rodStage));
}

test("竿の段階 n では、段階 n 以下の魚だけが出る", () => {
  for (const stage of STAGES) {
    for (const seed of [1, 2, 3]) {
      for (const cast of castsAt(seed, stage, 2000)) {
        assert.ok(cast.fish.stage <= stage, `段階 ${stage} で ${cast.fish.name}`);
        assert.equal(cast.fish.kind, cast.kind);
      }
    }
  }
});

test("段階が上がると、その段階の新しい魚が加わる(全種類が出る)", () => {
  for (const stage of STAGES) {
    const seen = new Set(castsAt(7, stage, 3000).map((c) => c.fish.id));
    const expected = FISH_LIST.filter((f) => f.stage <= stage).map((f) => f.id);
    assert.deepEqual([...seen].sort(), [...expected].sort(), `段階 ${stage}`);
  }
});

test("新しい魚ほど出やすい(区分ごとに、段階が上の魚の回数が多い)", () => {
  const casts = castsAt(11, 5, 20000);
  for (const kind of Object.values(FISH_KINDS)) {
    const counts = FISH_LIST.filter((f) => f.kind === kind).map(
      (f) => casts.filter((c) => c.fish.id === f.id).length,
    );
    for (let i = 1; i < counts.length; i++) {
      assert.ok(counts[i] > counts[i - 1], `${kind}:${counts}`);
    }
  }
});

test("段階 1:乱数の並びと魚の設定が Issue #4 と同じ", () => {
  for (const [seed, expected] of Object.entries(FIXTURE.casts)) {
    const actual = castsAt(Number(seed), 1, expected.length).map((c) => [c.waitMs, c.kind, c.zone ? c.zone.start : null]);
    assert.deepEqual(actual, expected, `seed ${seed}`);
  }
  for (const cast of castsAt(1, 1, 200)) {
    if (cast.kind === FISH_KINDS.STRONG) {
      assert.deepEqual(cast.minigame, { sweepMs: 900, zoneWidth: 0.22, hp: 2, timeLimitMs: 8000 });
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

test("待ち時間と魚の並びは、操作によらず Issue #6 と同じ(全段階・シード複数)", () => {
  const ways = {
    何もしない: { hook: () => false, fight: () => false },
    上手に遊ぶ: { hook: hookAlways, fight: aimCenter },
    連打する: { hook: hookAlways, fight: () => true },
    ときどき合わせる: { hook: (g) => g.castCount % 3 === 0, fight: (g) => g.phaseMs > 2000 },
  };
  for (const [key, expected] of Object.entries(FIXTURE6.casts)) {
    const [stage, seed] = key.split("-").map(Number);
    for (const [name, way] of Object.entries(ways)) {
      const actual = castsWhilePlaying(seed, stage, expected.length, way);
      assert.deepEqual(actual, expected, `${key} ${name}`);
    }
  }
});

test("全段階で、待ち時間の平均は 3〜6 秒、強い魚は 100 回中 10〜30 回", () => {
  for (const stage of STAGES) {
    for (const seed of [1, 2, 3, 12345]) {
      const casts = castsAt(seed, stage, 200);
      const avg = mean(casts.map((c) => c.waitMs));
      assert.ok(avg >= 3000 && avg <= 6000, `段階 ${stage} seed ${seed}:平均 ${avg}`);
      const strong = casts.slice(0, 100).filter((c) => c.kind === FISH_KINDS.STRONG).length;
      assert.ok(strong >= 10 && strong <= 30, `段階 ${stage} seed ${seed}:${strong} 回`);
    }
  }
});

test("報酬:段階が上の魚ほど、ウロコインも素材も多い", () => {
  for (const kind of Object.values(FISH_KINDS)) {
    const list = FISH_LIST.filter((f) => f.kind === kind).sort((a, b) => a.stage - b.stage);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].reward.coins > list[i - 1].reward.coins, list[i].name);
      assert.ok(list[i].reward.material > list[i - 1].reward.material, list[i].name);
    }
  }
});

test("報酬:竿の段階が上なほど、1 匹あたりの期待値が高い(シード固定の統計)", () => {
  let prev = { coins: -1, material: -1 };
  for (const stage of STAGES) {
    const game = play(createGame(21, { progress: progressAt(stage) }), 900000, SKILLED);
    const n = game.results.length;
    const avg = { coins: game.progress.coins / n, material: game.progress.material / n };
    assert.ok(n > 80, `段階 ${stage}:${n} 匹`);
    assert.ok(avg.coins > prev.coins && avg.material > prev.material, `段階 ${stage}:${JSON.stringify(avg)}`);
    prev = avg;
  }
});

test("報酬:釣れたらその魚の報酬、逃げられたら 0", () => {
  const game = play(createGame(4, { progress: progressAt(3) }), 600000, {
    hook: (g) => g.castCount % 3 !== 0,
    fight: aimCenter,
    resume: true,
  });
  let coins = 0;
  let material = 0;
  let escaped = 0;
  for (const r of game.results) {
    if (r.outcome === OUTCOMES.CAUGHT) {
      assert.deepEqual(r.reward, fishById(r.fishId).reward);
    } else {
      assert.deepEqual(r.reward, { coins: 0, material: 0 });
      escaped += 1;
    }
    coins += r.reward.coins;
    material += r.reward.material;
  }
  assert.ok(escaped > 0);
  assert.equal(game.progress.coins, coins);
  assert.equal(game.progress.material, material);
});

test("初めて釣れた魚だけ firstCatch になり、一覧に加わる", () => {
  const game = play(createGame(4), 300000, SKILLED);
  const firsts = game.results.filter((r) => r.firstCatch).map((r) => r.fishId);
  assert.deepEqual(firsts, [...new Set(firsts)]);
  assert.deepEqual([...game.progress.seen].sort(), [...firsts].sort());
  assert.deepEqual([...game.progress.seen].sort(), ["aji", "kurodai"]);
});

test("強化すると、次に投げるときから新しい魚が出る", () => {
  const game = createGame(9, { progress: { ...progressAt(1), material: 10 } });
  assert.equal(upgradeGameRod(game), true);
  assert.equal(game.progress.rodStage, 2);
  assert.equal(game.cast.fish.stage, 1, "今の投げはそのまま");
  play(game, 300000, SKILLED);
  assert.ok(game.results.some((r) => fishById(r.fishId).stage === 2));
});

test("同じシードと同じ操作なら、ウロコイン・素材・段階・魚の並びが完全に一致する", () => {
  function run() {
    const upgradeWhenPossible = (g) => {
      while (upgradeGameRod(g));
    };
    const actions = Array.from({ length: 30 }, (_, i) => ({ atMs: (i + 1) * 40000, run: upgradeWhenPossible }));
    return play(createGame(2024), 1200000, { ...SKILLED, actions });
  }
  const a = run();
  const b = run();
  assert.ok(a.progress.rodStage >= 3, `段階 ${a.progress.rodStage}`);
  assert.deepEqual(a.progress, b.progress);
  assert.deepEqual(a.results, b.results);
});
