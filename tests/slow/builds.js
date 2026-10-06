// 重いテストで共通に使う、装備の組み立てと戦闘のシミュレーション(テストではない:D-254・D-260)。
// - 平均的な装備:レア・グレード g・値は真ん中・スキルなし(②-4c 土台の時間の測定と同じ)。
// - 育てた装備:各枠で、段階 g のクレートを N(g) 個引いた中から、糸・リール・ルアーの組み合わせで、命中回数が最も少ないもの(D-254)。
// - 最強の装備:レジェンド・グレード g・値は最大。スキル枠 9 つ(3 個 × 3 つ)を、命中回数が最も少ない組み合わせで埋めたもの。
// 戦闘は「上手」:印が命中範囲の真ん中に来るたびに必ずタップする(真ん中 = 芯。縁は狙わない)。
// 印が真ん中に来る時刻へ時間を飛ばして進めるので、速い(結果は 16 ミリ秒ごとに見る遊び方とほぼ同じ)。
// 人の指の速さとして、タップとタップの間は 250 ミリ秒以上あける(命中範囲が動いた直後に、すぐ押せないように)。

/** タップとタップの間の最小の時間(人の指の速さ)。 */
export const MIN_TAP_GAP_MS = 250;

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { createGame, PHASES, tap, update } from "../../src/core/fishing.js";
import { drawItem, effectRange, makeCrates, RARITY_ROWS } from "../../src/core/gear.js";
import { referenceDraws } from "../../src/core/formula.js";
import { levelRange, SKILL_ROWS } from "../../src/core/skills.js";
import { startQuickFight } from "../../src/ui/debug_view.js";

const GG = DEFAULT_CONFIG.gacha.gradeGrowth;

/** 装備 3 個(id 1〜3)を付けた、段階 g の進み具合。 */
export function progressWith(g, items) {
  const own = items.map((it, i) => ({ ...it, id: i + 1 }));
  return {
    coins: 0,
    scales: {},
    rodStage: g,
    rodStep: "none",
    seen: [],
    gear: { items: own, equipped: Object.fromEntries(own.map((it) => [it.kind, it.id])), draws: 0, seed: 1, nextId: own.length + 1 },
  };
}

/** 平均的な装備(レア・グレード g・値は真ん中・スキルなし)。 */
export function averageItems(content, g) {
  return content.equipKinds.map((kind) => {
    const r = effectRange(kind, RARITY_ROWS[1], g, GG);
    return { kind: kind.id, rarity: "rare", grade: g, value: Math.round((r.min + r.max) / 2 / kind.step) * kind.step, skills: [] };
  });
}

/**
 * 1 回の戦い。印が命中範囲の真ん中に来るたびにタップする。{ caught, hits, damages } を返す。
 * @param {object} content @param {number} g @param {object[]} items @param {string} fishId @param {number} seed
 */
export function fightOnce(content, g, items, fishId, seed) {
  const game = createGame(seed, { content, progress: progressWith(g, items) });
  const r = startQuickFight(game, fishId, "good");
  if (!r.ok) throw new Error(r.error);
  const damages = [];
  const raws = [];
  const effs = [];
  let lastTap = -Infinity;
  while (game.phase === PHASES.MINIGAME) {
    const s = game.cast.minigame.sweepMs;
    const z = game.fight.zone;
    const c = (z.start + z.end) / 2;
    const t = Math.max(game.phaseMs, lastTap + MIN_TAP_GAP_MS - 1e-6);
    const base = Math.floor(t / (2 * s)) * 2 * s;
    // 1 往復の中で真ん中を通る時刻(行き c × s、帰り (2 − c) × s)のうち、今より後の最初のもの。
    const next = [base + c * s, base + (2 - c) * s, base + 2 * s + c * s].find((x) => x > t + 1e-6);
    lastTap = next;
    update(game, next - game.phaseMs);
    if (game.phase !== PHASES.MINIGAME) break;
    const res = tap(game);
    if (res?.action === "hit") {
      damages.push(res.damage);
      raws.push(res.rawDamage);
      effs.push(res.effDefense);
    }
  }
  const last = game.lastResult;
  return { caught: last.outcome === "caught", hits: last.hits ?? damages.length, damages, raws, effs };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** シードごとの戦いの結果(逃げられたら命中回数は Infinity)。 */
export function measure(content, g, items, fishId, seeds) {
  const runs = seeds.map((s) => fightOnce(content, g, items, fishId, s));
  const hits = runs.map((r) => (r.caught ? r.hits : Infinity));
  return { median: median(hits), winRate: runs.filter((r) => r.caught).length / runs.length, runs };
}

/** 選ぶときの点数(小さいほど良い):3 シードの命中回数の平均。逃げたら大きな数。 */
function score(content, g, items, fishId) {
  let sum = 0;
  for (const s of [101, 202, 303]) {
    const r = fightOnce(content, g, items, fishId, s);
    sum += r.caught ? r.hits : 1000;
  }
  return sum / 3;
}

/** 命中回数に効くスキル(ヌシ戦・真ん中を狙う遊び方で)。ほかのスキルは、育てた装備の候補を減らすときに無視する。 */
const FIGHT_SKILLS = new Set(["power", "crit-rate", "crit-power", "tenacity", "combo-power", "combo-crit", "first-hit", "finisher", "momentum", "first-strike", "core", "penetration", "combo-pen"]);

/** a が b 以上(値と、命中回数に効くスキルのレベルが全部 b 以上)か。 */
function dominates(a, b) {
  if (a.value < b.value) return false;
  const lv = (it, id) => it.skills.find((s) => s.id === id)?.level ?? 0;
  for (const s of b.skills) if (FIGHT_SKILLS.has(s.id) && lv(a, s.id) < s.level) return false;
  return true;
}

/**
 * 育てた装備(D-254):糸・リール・ルアーの各枠で、段階 g のクレートから N(g) 個ずつ(ガチャの種 seed で引き続け、
 * 種類ごとに先に出た N(g) 個)を候補にし、命中回数が最も少ない組み合わせを選ぶ。
 * 候補は、ほかの候補に負けているもの(値と、命中回数に効くスキルのレベルが全部以下)を除く。
 * 1 シードで全部の組み合わせを比べ、良い 10 通りを 3 シードで比べ直す。noPen なら、貫通と連撃・貫を持つ装備は使わない。
 */
export function grownItems(content, g, fishId, seed, options = {}) {
  const noPen = options.noPen ?? false;
  const crate = makeCrates(content, DEFAULT_CONFIG)[g - 1];
  const per = options.per ?? referenceDraws(g);
  const byKind = new Map(content.equipKinds.map((k) => [k.id, []]));
  for (let i = 0; [...byKind.values()].some((l) => l.length < per) && i < 5000; i++) {
    const it = drawItem(seed, i, crate, content.equipKinds, GG);
    const list = byKind.get(it.kind);
    if (list.length < per) list.push(it);
  }
  const isPen = (it) => it.skills.some((s) => s.id === "penetration" || s.id === "combo-pen");
  const candidates = content.equipKinds.map((kind) => {
    const own = byKind.get(kind.id).filter((it) => !(noPen && isPen(it)));
    return own.filter((it, i) => !own.some((o, j) => j !== i && dominates(o, it) && (!dominates(it, o) || j < i)));
  });
  const scored = [];
  for (const a of candidates[0]) {
    for (const b of candidates[1]) {
      for (const c of candidates[2]) {
        const items = [a, b, c];
        const r = fightOnce(content, g, items, fishId, 101);
        scored.push({ items, s: r.caught ? r.hits : 1000 });
      }
    }
  }
  scored.sort((x, y) => x.s - y.s);
  let best = null;
  for (const { items } of scored.slice(0, 10)) {
    const sc = score(content, g, items, fishId);
    if (!best || sc < best.score) best = { items, score: sc };
  }
  return best.items;
}

/** 最強の装備の候補に使うスキル(ヌシ戦で命中回数を減らすもの。縁は真ん中を狙うので効かない、ジャストはヌシ戦で効かない)。 */
const STRONG_SKILLS = ["power", "crit-rate", "crit-power", "combo-power", "combo-crit", "first-hit", "finisher", "momentum", "first-strike", "core", "penetration", "combo-pen"];

/** k 個を選ぶ組み合わせ。 */
function combinations(list, k, start = 0, acc = [], out = []) {
  if (acc.length === k) out.push([...acc]);
  else for (let i = start; i < list.length; i++) combinations(list, k, i + 1, [...acc, list[i]], out);
  return out;
}

/**
 * 最強の装備:レジェンド・グレード g・値は最大。スキル 5 つ(A〜D は 2 枠、E は 1 枠)を
 * 糸 [A, B, C]・リール [A, B, D]・ルアー [C, D, E] に置き、レベルは装備 1 個の上限。5 つの選び方と、E の選び方を全部試す。
 */
export function strongestItems(content, g, fishId, { noPen = false } = {}) {
  const pool = STRONG_SKILLS.filter((id) => !(noPen && (id === "penetration" || id === "combo-pen")));
  const lv = levelRange("legend", g, DEFAULT_CONFIG.skills).max;
  const values = content.equipKinds.map((kind) => effectRange(kind, RARITY_ROWS[3], g, GG).max);
  const make = (layout) =>
    content.equipKinds.map((kind, i) => ({ kind: kind.id, rarity: "legend", grade: g, value: values[i], skills: layout[i].map((id) => ({ id, level: lv })) }));
  let best = null;
  for (const five of combinations(pool, 5)) {
    for (let e = 0; e < 5; e++) {
      const [A, B, C, D] = five.filter((_, i) => i !== e);
      const E = five[e];
      const items = make([[A, B, C], [A, B, D], [C, D, E]]);
      const sc = score(content, g, items, fishId);
      if (!best || sc < best.score) best = { items, score: sc };
    }
  }
  return best.items;
}

/** スキルの名前の一覧(報告用)。 */
export function skillSummary(items) {
  const total = {};
  for (const it of items) for (const s of it.skills) total[s.id] = (total[s.id] ?? 0) + s.level;
  return Object.entries(total)
    .map(([id, lv]) => `${SKILL_ROWS.find((s) => s.id === id)?.name ?? id}${lv}`)
    .join("・");
}
