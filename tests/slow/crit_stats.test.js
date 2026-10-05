// 重いテスト:クリティカルの割合が、設定の確率の近くに収まるか(受け入れ条件 4)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { createGame, currentMarker, PHASES, tap, update } from "../../src/core/fishing.js";

/** 掛かったらすぐ合わせ、印が真ん中付近でタップして、当たりとクリティカルの回数を数える。 */
function countCrits(seed, critChance, minutes) {
  const game = createGame(seed, {
    progress: { coins: 0, material: 0, rodStage: 5, seen: [] },
    combat: { ...DEFAULT_CONFIG.combat, critChance },
  });
  let hits = 0;
  let crits = 0;
  for (let t = 0; t < minutes * 60000; t += 16) {
    update(game, 16);
    if (game.phase === PHASES.BITE || game.phase === PHASES.RESTING) tap(game);
    else if (game.phase === PHASES.MINIGAME) {
      const z = game.fight.zone;
      if (Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02) {
        const r = tap(game);
        if (r.action === "hit") {
          hits += 1;
          if (r.critical) crits += 1;
        }
      }
    }
  }
  return { hits, crits };
}

for (const critChance of [DEFAULT_CONFIG.combat.critChance, 0.3]) {
  test(`確率 ${critChance * 100}%:シード固定で 2000 回以上の当たりのうち、クリティカルの割合が ±2 ポイントの中`, () => {
    let hits = 0;
    let crits = 0;
    for (let seed = 1; hits < 3000; seed++) {
      const c = countCrits(seed, critChance, 20);
      hits += c.hits;
      crits += c.crits;
    }
    const ratio = crits / hits;
    assert.ok(hits >= 2000, `${hits} 回`);
    assert.ok(Math.abs(ratio - critChance) <= 0.02, `${crits} / ${hits} = ${ratio}`);
  });
}
