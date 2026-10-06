// 重いテスト:ヌシ戦の長さの表(D-190。②-4c の調整の材料)。
// 段階 1〜5 のヌシを、装備なし・数値型だけ・最強の装備(数値型と条件発動型)で、何回の命中で倒せるかと、
// 最強の装備の 1 回のダメージ(通常とクリティカルの段数ごと)を出す。どの戦いも必ず終わることを確かめる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { DEFAULT_CONTENT } from "../../src/core/fish.js";
import { challengeBoss, createGame, currentMarker, PHASES, tap, update } from "../../src/core/fishing.js";
import { effectRange, emptyGear, EQUIP_KIND_ROWS, RARITY_ROWS } from "../../src/core/gear.js";
import { pointsRange } from "../../src/core/skills.js";
import { hitDamage } from "../../src/core/combat.js";
import { progressAt } from "../helpers.js";

const LEG = RARITY_ROWS.find((r) => r.id === "legend");
const max = (kind, g) => effectRange(EQUIP_KIND_ROWS.find((k) => k.id === kind), LEG, g, DEFAULT_CONFIG.gacha.gradeGrowth).max;
function build(stage) {
  const p = pointsRange("legend", stage, DEFAULT_CONFIG.skills).max;
  const sk = (ids) => ids.map((id) => ({ id, points: p }));
  return [
    { id: 1, kind: "reel", rarity: "legend", grade: stage, value: max("reel", stage), skills: sk(["power", "crit-rate", "crit-power"]) },
    { id: 2, kind: "line", rarity: "legend", grade: stage, value: max("line", stage), skills: sk(["power", "crit-rate", "crit-power"]) },
    { id: 3, kind: "lure", rarity: "legend", grade: stage, value: max("lure", stage), skills: sk(["combo-power", "first-hit", "finisher"]) },
  ];
}
function fight(stage, items, seed) {
  const gear = { ...emptyGear(), seed: 1, items, equipped: Object.fromEntries(items.map((i) => [i.kind, i.id])), nextId: 9 };
  const g = createGame(seed, { progress: progressAt(stage, "crafted", { gear }) });
  g.bossAttempts = seed;
  challengeBoss(g);
  let hits = 0;
  const maxHp = g.fight.maxHp;
  while (g.phase === PHASES.MINIGAME) {
    const z = g.fight.zone;
    if (Math.abs(currentMarker(g) - (z.start + z.end) / 2) < 0.01) { if (tap(g).action === "hit") hits++; }
    update(g, 2);
  }
  return { hits, ok: g.lastResult.outcome === "caught", maxHp, game: g };
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

test("ヌシ戦の長さの表:どの装備でも戦いは必ず終わり、釣れる(段階 1〜5)", () => {
  const lines = ["| 段階 | ヌシ(体力) | 装備なし | 数値型だけ | 最強の装備 | 最強の装備の 1 回のダメージ(通常 / 1 段 / 2 段 / 3 段) | 会心率 |"];
for (let stage = 1; stage <= 5; stage++) {
  const boss = DEFAULT_CONTENT.fish.find((f) => f.kind === "boss" && f.stage === stage);
  const none = [], best = [], num = [];
  let g0;
  for (let seed = 1; seed <= 60; seed++) {
    const n0 = fight(stage, [], seed);
    assert.ok(n0.ok);
    none.push(n0.hits);
    const r = fight(stage, build(stage), seed);
    assert.ok(r.ok); best.push(r.hits); g0 = r.game;
    const b2 = build(stage); b2[2] = { ...b2[2], skills: [] }; num.push(fight(stage, b2, seed).hits);
  }
  const c = g0.combat;
  const dm = [0, 1, 2, 3].map((s) => hitDamage(c, s, DEFAULT_CONFIG.combatLimits));
  lines.push(`| ${stage} | ${boss.name}(${boss.minigame.hp}) | ${med(none)}(${Math.min(...none)}〜${Math.max(...none)}) | ${med(num)}(${Math.min(...num)}〜${Math.max(...num)}) | ${med(best)}(${Math.min(...best)}〜${Math.max(...best)}) | ${dm.join(" / ")} | ${Math.round(c.critChance * 100)}% |`);
}
  console.log(lines.join("\n"));
});
