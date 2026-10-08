// ヌシのくせ②の戦い(D-382):自動回復は時間で体力を戻し(端数は貯める・最大の体力まで・乱数を引かない)、
// 短い制限時間は、延びる上限をくせの前の制限時間で数える。表示は「回復 +n/秒」。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { createGame, PHASES, update } from "../src/core/fishing.js";
import { fishMinigame } from "../src/core/formula.js";
import { startQuickFight } from "../src/ui/debug_view.js";
import { fightBadges } from "../src/ui/fight_view.js";
import { progressAt } from "./helpers.js";

/** 段階 g のヌシと戦いを始める(装備なし)。 */
function bossFight(g) {
  const game = createGame(3, { progress: progressAt(g, "none") });
  const r = startQuickFight(game, DEFAULT_CONTENT.stageByNumber.get(g).boss, "good");
  assert.equal(r.ok, true, r.error);
  return game;
}

test("自動回復:1 秒あたり regenPerSec を戻す。端数は貯め、最大の体力はこえない", () => {
  const game = bossFight(21);
  const per = game.cast.minigame.regenPerSec;
  assert.ok(per > 0);
  assert.equal(fightBadges(game).labels.includes(`回復 +${per}/秒`), true);
  // 満タンのあいだは戻らない(合計にも数えない)。
  update(game, 1000);
  assert.equal(game.fight.hp, game.fight.maxHp);
  assert.equal(game.fight.regenTotal, 0);
  // 減らしてから、0.25 秒ずつ 8 回(合計 2 秒)進めると、2 秒ぶん戻る(端数は貯まる)。
  game.fight.hp -= per * 10;
  const before = game.fight.hp;
  for (let i = 0; i < 8; i += 1) update(game, 250);
  assert.equal(game.fight.hp, before + per * 2);
  // 長く待つと、最大の体力で止まる。
  update(game, 9000);
  assert.equal(game.phase, PHASES.MINIGAME);
  assert.equal(game.fight.hp, game.fight.maxHp);
});

test("自動回復のないヌシは戻らず、回復の表示も出ない", () => {
  const game = bossFight(20);
  game.fight.hp -= 100;
  update(game, 3000);
  assert.equal(game.fight.hp, game.fight.maxHp - 100);
  assert.equal(fightBadges(game).labels.some((l) => l.startsWith("回復")), false);
});

test("短い制限時間:装備なしでは短いまま。延びる上限は、くせの前の制限時間", () => {
  const game = bossFight(26);
  const m = fishMinigame("boss", 26);
  assert.ok(m.timeLimitMs < /** @type {number} */ (m.limitBaseMs));
  assert.equal(game.fight.timeLimitMs, m.timeLimitMs);
});
