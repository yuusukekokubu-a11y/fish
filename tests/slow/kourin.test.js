// 降臨の重いテスト(D-396・D-397)。
// - 4 キャラを倒すまでの挑戦の回数:段階 g の目安の装備(そのキャラのくせに合わせて選び直す:付け替えの想定)と、ふつうの遊び方で、
//   レベル g に挑む。目安は 5 回くらい(2〜10 回に入ること)。
// - ゲージ:上手に釣り続けたときの、1 時間あたりの点(実際の遊びは約 2 倍の時間がかかる:D-355)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { DEFAULT_CONTENT, makeContent } from "../../src/core/fish.js";
import { challengeRaid, createGame, currentMarker, fightSweepMs, PHASES, tap, update } from "../../src/core/fishing.js";
import { fishMinigame, fishSweepMs, fishZoneWidth } from "../../src/core/formula.js";
import { fullGauge, KOURIN_ROWS, raidMinigame } from "../../src/core/kourin.js";
import { grownItems, hitChance, MIN_TAP_GAP_MS, playRng, progressWith, STANDARD_PLAY, unlimitedContent } from "./builds.js";

const CONTENT = DEFAULT_CONTENT;
const boss = (g) => CONTENT.stageByNumber.get(g).boss;

/**
 * 降臨の 1 回の戦い(builds.js の fightOnce と同じ遊び方:命中のぶれは時間で決まり、押す間隔は人のリズム)。
 * @param {any} game @param {number} g @param {() => number} rand @param {typeof STANDARD_PLAY} std
 */
function runFight(game, g, rand, std) {
  const chance = hitChance(std.hitRate, fishZoneWidth("boss", g));
  const sweep0 = fishSweepMs("boss", g);
  let lastTap = -Infinity;
  let taps = 0;
  while (game.phase === PHASES.MINIGAME) {
    const s = fightSweepMs(game);
    const z = game.fight.zone;
    const w = z.end - z.start;
    taps += 1;
    const off = rand() >= chance(w * (s / sweep0));
    const aim = z.start + w * (0.02 + 0.96 * rand());
    const c = !off ? aim : z.end + w * 0.15 <= 1 ? z.end + w * 0.15 : z.start - w * 0.15;
    const t = Math.max(game.phaseMs, lastTap + MIN_TAP_GAP_MS - 1e-6);
    const want = taps === 1 ? std.reactMs : lastTap + std.passesPerPress * sweep0;
    const b = Math.floor(want / (2 * s)) * 2 * s;
    const cands = [b - 2 * s + (2 - c) * s, b + c * s, b + (2 - c) * s, b + 2 * s + c * s].filter((x) => x > t + 1e-6 && (taps > 1 || x >= want));
    const next = cands.length > 0 ? cands.reduce((best, x) => (Math.abs(x - want) < Math.abs(best - want) ? x : best), cands[cands.length - 1]) : t + s;
    lastTap = next;
    update(game, next - game.phaseMs);
    if (game.phase !== PHASES.MINIGAME) break;
    tap(game);
  }
}

test("降臨:4 キャラとも、目安の装備とふつうの遊び方で 2〜10 回の挑戦で倒せる(段階 3〜28)", () => {
  const lines = [];
  for (const g of [3, 8, 13, 18, 23, 28]) {
    const row = [];
    for (const ch of KOURIN_ROWS) {
      const fish = CONTENT.fish.map((f) => (f.id === boss(g) ? { ...f, minigame: { ...fishMinigame("boss", g, DEFAULT_CONFIG.formula, [ch.quirk]) } } : f));
      const sel = unlimitedContent(makeContent(fish, CONTENT.stages, CONTENT.equipKinds, CONTENT.skills, []));
      const items = grownItems(sel, g, boss(g), 11, { standard: STANDARD_PLAY });
      const tries = [];
      for (const seed of [1, 2, 3]) {
        const p = progressWith(g, items);
        p.kourin = { gauge: 0, fromScales: 0, cleared: g > 1 ? { [ch.id]: g - 1 } : {}, raid: { char: ch.id, hp: raidMinigame(ch, g, DEFAULT_CONFIG).hp, tries: 0, paid: 0 } };
        const game = createGame(seed, { progress: p, content: CONTENT });
        const rand = playRng(seed * 31 + g);
        let n = 0;
        while (game.progress.kourin.raid && n < 30) {
          game.phase = PHASES.CASTING;
          game.phaseMs = 0;
          challengeRaid(game);
          n++;
          runFight(game, g, rand, STANDARD_PLAY);
          game.pendingCast = null;
        }
        tries.push(n);
      }
      tries.sort((a, b) => a - b);
      row.push(`${ch.id} ${tries[1]}`);
      assert.ok(tries[1] >= 2 && tries[1] <= 10, `g=${g} ${ch.id}:${tries.join(",")} 回`);
    }
    lines.push(`g=${g}:${row.join("・")}`);
  }
  console.log(`降臨を倒すまでの挑戦の回数(中央値):\n${lines.join("\n")}`);
});

test("降臨のゲージ:上手に釣り続けると、シミュレーションの 1 時間で満タン(300 点)の 1.5〜2.5 倍(実際の遊びで約 1 時間に 1 回)", () => {
  const game = createGame(11, { progress: progressWith(6, []), content: CONTENT });
  const hourMs = 3600 * 1000;
  for (let t = 0; t < hourMs; t += 16) {
    update(game, 16);
    if (game.phase === PHASES.BITE && game.phaseMs >= (game.cast.kind === "strong" ? 1060 : 1400)) tap(game);
    else if (game.phase === PHASES.MINIGAME) {
      const z = game.fight.zone;
      if (Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.03) tap(game);
    } else if (game.phase === PHASES.RESTING) tap(game);
    // 満タンで止まらないように、貯まった分を数えて空にする。
    if (game.progress.kourin && game.progress.kourin.gauge >= fullGauge(DEFAULT_CONFIG.kourin)) {
      game.fills = (game.fills ?? 0) + 1;
      game.progress.kourin.gauge = 0;
    }
  }
  const points = (game.fills ?? 0) * DEFAULT_CONFIG.kourin.full + Math.floor((game.progress.kourin?.gauge ?? 0) / DEFAULT_CONFIG.kourin.unit);
  console.log(`1 時間(シミュレーション)の点:${points}(弱い魚 ${game.counts.weak}・強い魚 ${game.counts.strong}・逃げた ${game.counts.escaped})`);
  assert.ok(points >= 1.5 * DEFAULT_CONFIG.kourin.full && points <= 2.5 * DEFAULT_CONFIG.kourin.full, `${points} 点`);
});
