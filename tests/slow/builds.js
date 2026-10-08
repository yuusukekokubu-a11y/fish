// 重いテストで共通に使う、装備の組み立てと戦闘のシミュレーション(テストではない:D-254・D-260・D-380)。
// - 平均的な装備:レア・グレード g・値は真ん中・スキルなし(②-4c 土台の時間の測定と同じ)。
// - 育てた装備:段階 1〜g のクレートを、目安の引く回数 P(h) ずつ引いた中から(D-379・D-380)、6 枠の組み合わせで、
//   命中回数(遊び方を渡したときは倒すまでの時間)が最も少ないもの(D-254・D-322)。
// - 最強の装備:レジェンド・グレード g・値は最大。スキル枠 18(3 個 × 6 枠)を、命中回数が最も少ない組み合わせで埋めたもの。
// 戦闘は「上手」:印が命中範囲の真ん中に来るたびに必ずタップする(真ん中 = 芯。縁は狙わない)。
// 印が真ん中に来る時刻へ時間を飛ばして進めるので、速い(結果は 16 ミリ秒ごとに見る遊び方とほぼ同じ)。
// 人の指の速さとして、タップとタップの間は 250 ミリ秒以上あける(命中範囲が動いた直後に、すぐ押せないように)。

/** タップとタップの間の最小の時間(人の指の速さ)。 */
export const MIN_TAP_GAP_MS = 250;

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { createGame, fightSweepMs, PHASES, tap, update } from "../../src/core/fishing.js";
import { BASE_KIND_IDS, drawItem, effectRange, makeCrates, RARITY_ROWS } from "../../src/core/gear.js";
import { fishZoneWidth, targetPulls } from "../../src/core/formula.js";
import { makeContent } from "../../src/core/fish.js";
import { levelRange, SKILL_ROWS } from "../../src/core/skills.js";
import { startQuickFight } from "../../src/ui/debug_view.js";

const GG = DEFAULT_CONFIG.gacha.gradeGrowth;

/** 装備(id 1〜)を全部付けた、段階 g の進み具合。gloves を渡すと、グローブの持ち物にする(D-334)。 */
export function progressWith(g, items, gloves = null) {
  const own = items.map((it, i) => ({ ...it, id: i + 1 }));
  return {
    ...(gloves ? { gloves } : {}),
    coins: 0,
    scales: {},
    rodStage: g,
    rodStep: "none",
    seen: [],
    gear: { items: own, equipped: Object.fromEntries(own.map((it) => [it.kind, it.id])), draws: 0, seed: 1, nextId: own.length + 1 },
  };
}

/** 平均的な装備(糸・リール・ルアーの 3 枠に、レア・グレード g・値は真ん中・スキルなし。経済の基準:D-323)。 */
export function averageItems(content, g) {
  return content.equipKinds.filter((kind) => BASE_KIND_IDS.includes(kind.id)).map((kind) => {
    const r = effectRange(kind, RARITY_ROWS[1], g, GG);
    return { kind: kind.id, rarity: "rare", grade: g, value: Math.round((r.min + r.max) / 2 / kind.step) * kind.step, skills: [] };
  });
}

/**
 * 遊び方(D-379)。ふつう:1 往復に 1 回押す・命中 80%(命中範囲の中に一様に散らばる。残りは命中範囲のすぐ外)・最初の反応 0.5 秒・合わせのジャスト 70%。
 * 上手:同じ速さで、ミスなく真ん中(芯)を狙う。
 */
export const STANDARD_PLAY = Object.freeze({ reactMs: 500, hitRate: 0.8, justRate: 0.7, passesPerPress: 2, spread: true });
export const SKILLED_PLAY = Object.freeze({ reactMs: 500, hitRate: 0.98, justRate: 0.7, passesPerPress: 2, spread: false });

/** 誤差関数(Abramowitz-Stegun 7.1.26。誤差 1.5e-7 以下)。 @param {number} x */
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/**
 * 押すタイミングのぶれ(D-381):印の位置のずれが正規分布(標準偏差 sigma。ゲージに対する割合)。
 * くせのない命中範囲の幅 w0 で、命中の割合が hitRate になる sigma を決める。幅 w で押したときの命中の割合を返す関数。
 * hitRate が 1 以上なら、いつも命中。
 * @param {number} hitRate @param {number} w0
 */
function hitChance(hitRate, w0) {
  if (hitRate >= 1) return () => 1;
  // erf(w0 / 2 / (sigma√2)) = hitRate となる sigma を 2 分探索で求める。
  let lo = 1e-6;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (erf(w0 / 2 / (mid * Math.SQRT2)) > hitRate) lo = mid;
    else hi = mid;
  }
  const sigma = (lo + hi) / 2;
  return (w) => erf(w / 2 / (sigma * Math.SQRT2));
}

/** テストだけで使う、シードつきの小さな乱数(mulberry32)。遊び方の命中・外れを決める(ゲームの乱数の系統には触らない)。 */
function playRng(seed) {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 制限時間を長くした魚の表(倒すまでの時間を、時間切れに左右されずに測る)。体力などは同じ。 */
export function unlimitedContent(content, limitMs = 120000) {
  const fish = content.fish.map((f) => (f.minigame ? { ...f, minigame: { ...f.minigame, timeLimitMs: limitMs } } : f));
  return makeContent(fish, content.stages, content.equipKinds, content.skills, []);
}

/**
 * 引いた装備(D-379・D-380):段階 1〜g のクレートを、それぞれ 目安の引く回数 P(h) × frac 回ずつ引いたもの(前の段階の分も持つ)。
 * ガチャの種 seed ごとに決まる。
 */
export function pulledPool(content, g, frac, seed) {
  const crates = makeCrates(content, DEFAULT_CONFIG);
  const out = [];
  for (let h = 1; h <= g; h++) {
    const n = Math.round(frac * targetPulls(h));
    for (let i = 0; i < n; i++) out.push(drawItem(seed * 1000 + h, i, crates[h - 1], content.equipKinds, GG));
  }
  return out;
}

/**
 * 1 回の戦い。印が命中範囲の真ん中に来るたびにタップする。{ caught, hits, damages } を返す。
 * options.gloves:グローブの持ち物。options.missEvery:n なら n 回に 1 回、命中範囲のすぐ外(幅の 15% 外側)で押す(グローブの確かめ用)。
 * @param {object} content @param {number} g @param {object[]} items @param {string} fishId @param {number} seed
 * @param {{ gloves?: object | null, missEvery?: number }} [options]
 */
export function fightOnce(content, g, items, fishId, seed, options = {}) {
  const game = createGame(seed, { content, progress: progressWith(g, items, options.gloves ?? null) });
  const std = options.standard ?? null;
  const rand = std ? playRng(seed * 7919 + 13) : null;
  const r = startQuickFight(game, fishId, rand && rand() < std.justRate ? "just" : "good");
  if (!r.ok) throw new Error(r.error);
  // ext:装備などで延びた制限時間(魚の制限時間との差)。
  const limitMs = game.fight?.timeLimitMs ?? 0;
  const fishLimitMs = game.cast?.minigame?.timeLimitMs ?? limitMs;
  const damages = [];
  const raws = [];
  const effs = [];
  let lastTap = -Infinity;
  let taps = 0;
  // 遊び方の命中の割合は、くせのない命中範囲の幅(式の値)で hitRate。狭い・広い命中範囲では、ぶれのぶん変わる(D-381)。
  const chance = std ? hitChance(std.hitRate, fishZoneWidth(game.cast.kind === "boss" ? "boss" : "strong", g)) : null;
  while (game.phase === PHASES.MINIGAME) {
    const s = fightSweepMs(game);
    const z = game.fight.zone;
    taps += 1;
    // n 回に 1 回は、命中範囲のすぐ外を狙う(ゲージの外に出るなら反対側)。
    const w = z.end - z.start;
    const off = std ? rand() >= chance(w) : options.missEvery && taps % options.missEvery === 0;
    const aim = std?.spread ? z.start + w * (0.02 + 0.96 * rand()) : (z.start + z.end) / 2;
    const c = !off ? aim : z.end + w * 0.15 <= 1 ? z.end + w * 0.15 : z.start - w * 0.15;
    const t = Math.max(game.phaseMs, lastTap + MIN_TAP_GAP_MS - 1e-6);
    const base = Math.floor(t / (2 * s)) * 2 * s;
    // 1 往復の中で真ん中を通る時刻(行き c × s、帰り (2 − c) × s)のうち、今より後の最初のもの。
    let next = [base + c * s, base + (2 - c) * s, base + 2 * s + c * s].find((x) => x > t + 1e-6);
    if (std) {
      // 遊び方の速さ:最初は反応の時間のあとの最初の通過。次からは、前に押してから passesPerPress 回の通過の時間(1 往復)に一番近い通過。
      const want = taps === 1 ? std.reactMs : lastTap + std.passesPerPress * s;
      const b = Math.floor(want / (2 * s)) * 2 * s;
      const cands = [b - 2 * s + (2 - c) * s, b + c * s, b + (2 - c) * s, b + 2 * s + c * s].filter((x) => x > t + 1e-6 && (taps > 1 || x >= want));
      next = cands.reduce((best, x) => (Math.abs(x - want) < Math.abs(best - want) ? x : best), cands[cands.length - 1]);
    }
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
  return { caught: last.outcome === "caught", hits: last.hits ?? damages.length, damages, raws, effs, ms: last.fightMs ?? 0, ext: limitMs - fishLimitMs };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** シードごとの戦いの結果(逃げられたら命中回数は Infinity)。 */
export function measure(content, g, items, fishId, seeds, options = {}) {
  const runs = seeds.map((s) => fightOnce(content, g, items, fishId, s, options));
  const hits = runs.map((r) => (r.caught ? r.hits : Infinity));
  return { median: median(hits), winRate: runs.filter((r) => r.caught).length / runs.length, runs };
}

/** 選ぶときの点数(小さいほど良い):3 シードの命中回数の平均。逃げたら大きな数。 */
function score(content, g, items, fishId, play = {}) {
  let sum = 0;
  for (const s of [101, 202, 303]) {
    const r = fightOnce(content, g, items, fishId, s, play);
    // 遊び方(standard)で選ぶときは、釣り上げるまでの時間で比べる(押す回数は運で変わるため)。
    sum += play.standard ? (r.caught ? r.ms : 1e7) : r.caught ? r.hits : 1000;
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
 * 育てた装備(D-254・D-322・D-327・D-380):候補は pulledPool(段階 1〜g を P(h) × pulls 回ずつ。ガチャの種 seed で引いた順)、
 * pool を渡せばその一覧、per を渡せば段階 g のクレートを per × 種類の数。そこから
 * 種類ごとに分けて候補にする。standard なら、その遊び方の倒すまでの時間で比べて選ぶ。
 * 候補は、ほかの候補に負けているもの(値と、命中回数に効くスキルのレベルが全部以下)を除く。
 * 選び方:(1) 糸・リール・ルアーの全部の組み合わせを 1 シードで比べ、良い 10 通りを 3 シードで比べ直す。
 * (2) おもり・浮き・おまもりを、この順に 1 枠ずつ、3 シードで一番良い候補に決める(何も付けないより悪ければ付けない)。
 * (3) 6 枠を順に、ほかを決めたまま 3 シードで一番良い候補に替える(1 周)。
 * noPen なら、貫通と連撃・貫を持つ装備は使わない。rarities なら、そのレア度の装備だけを使う。missEvery なら、その遊び方(n 回に 1 回すぐ外)で比べて選ぶ。
 */
export function grownItems(content, g, fishId, seed, options = {}) {
  const noPen = options.noPen ?? false;
  // 選ぶときの遊び方(missEvery:n 回に 1 回すぐ外を押す。グローブの確かめ用:D-344)。
  const play = options.standard ? { standard: options.standard } : options.missEvery ? { missEvery: options.missEvery } : {};
  const byKind = new Map(content.equipKinds.map((k) => [k.id, []]));
  // 候補:pool(引いた装備の一覧)があればそれ。なければ、目安の引く回数 P(h) × (pulls ?? 1) を段階 1〜g で引いたもの(D-380)。
  // per があれば、段階 g のクレートを per × 種類の数 だけ引く(前の決まり。グローブなどの確かめで使う)。
  let items = options.pool;
  if (!items && options.per) {
    const crate = makeCrates(content, DEFAULT_CONFIG)[g - 1];
    items = Array.from({ length: options.per * content.equipKinds.length }, (_, i) => drawItem(seed, i, crate, content.equipKinds, GG));
  }
  for (const it of items ?? pulledPool(content, g, options.pulls ?? 1, seed)) byKind.get(it.kind).push(it);
  const isPen = (it) => it.skills.some((s) => s.id === "penetration" || s.id === "combo-pen");
  // rarities:使ってよいレア度(ノーマルとレアだけの育てた装備:D-355)。
  const rarityOk = (it) => !options.rarities || options.rarities.includes(it.rarity);
  const candidates = content.equipKinds.map((kind) => {
    const own = byKind.get(kind.id).filter((it) => !(noPen && isPen(it)) && rarityOk(it));
    return own.filter((it, i) => !own.some((o, j) => j !== i && dominates(o, it) && (!dominates(it, o) || j < i)));
  });
  const baseIdx = BASE_KIND_IDS.map((id) => content.equipKinds.findIndex((k) => k.id === id));
  const extraIdx = content.equipKinds.map((_, i) => i).filter((i) => !baseIdx.includes(i));
  const pick = (slots) => slots.filter(Boolean);
  // (1) 糸・リール・ルアー。
  const [c0, c1, c2] = baseIdx.map((i) => (candidates[i].length > 0 ? candidates[i] : [null]));
  const scored = [];
  for (const a of c0) {
    for (const b of c1) {
      for (const c of c2) {
        const items = pick([a, b, c]);
        const r = fightOnce(content, g, items, fishId, 101, play);
        scored.push({ slots: [a, b, c], s: play.standard ? (r.caught ? r.ms : 1e7) : r.caught ? r.hits : 1000 });
      }
    }
  }
  scored.sort((x, y) => x.s - y.s);
  let best = null;
  for (const { slots } of scored.slice(0, 10)) {
    const sc = score(content, g, pick(slots), fishId, play);
    if (!best || sc < best.score) best = { slots, score: sc };
  }
  /** 6 枠(表の順)。 */
  const slots = content.equipKinds.map(() => null);
  baseIdx.forEach((k, i) => (slots[k] = best.slots[i]));
  let current = best.score;
  /** 枠 k を、候補の中で一番良いものに替える(今より良いときだけ)。 */
  const improve = (k) => {
    for (const cand of candidates[k]) {
      if (cand === slots[k]) continue;
      const trial = slots.map((x, i) => (i === k ? cand : x));
      const sc = score(content, g, pick(trial), fishId, play);
      if (sc < current) {
        current = sc;
        slots[k] = cand;
      }
    }
  };
  // (2) おもり・浮き・おまもり。
  for (const k of extraIdx) improve(k);
  // (3) 6 枠を 1 周、見直す。
  for (let k = 0; k < slots.length; k++) improve(k);
  // (4) 防御のある魚(防御の壁:D-381)では、貫通を 1 つずつ足しても差が出にくいので、
  //     各枠で貫通(と連撃・貫)のレベルが一番高い候補から始める道も比べ、良いほうを選ぶ。
  if ((content.byId.get(fishId)?.minigame?.defense ?? 0) > 0) {
    const penLv = (it) => it.skills.reduce((a, x) => a + (x.id === "penetration" ? x.level : x.id === "combo-pen" ? x.level / 2 : 0), 0);
    const greedy = { slots: [...slots], score: current };
    for (let k = 0; k < slots.length; k++) {
      const best = [...candidates[k]].sort((a, b) => penLv(b) - penLv(a) || b.value - a.value)[0];
      slots[k] = best && penLv(best) > 0 ? best : slots[k];
    }
    current = score(content, g, pick(slots), fishId, play);
    for (let k = 0; k < slots.length; k++) improve(k);
    if (greedy.score <= current) return pick(greedy.slots);
  }
  return pick(slots);
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
 * 最強の装備:レジェンド・グレード g・値は最大で、6 枠全部に付ける(D-327)。スキル 6 つを、
 * 枠 i にスキル i・i+1・i+2(6 で割った余り)を置いて、どのスキルも 3 枠ずつにする。レベルは装備 1 個の上限。
 * 6 つの選び方を全部、1 シードで比べ、良い 10 通りを 3 シードで比べ直す。
 */
export function strongestItems(content, g, fishId, { noPen = false } = {}) {
  const pool = STRONG_SKILLS.filter((id) => !(noPen && (id === "penetration" || id === "combo-pen")));
  const lv = levelRange("legend", g, DEFAULT_CONFIG.skills).max;
  const kinds = content.equipKinds;
  const values = kinds.map((kind) => effectRange(kind, RARITY_ROWS[3], g, GG).max);
  const n = kinds.length;
  const make = (six) =>
    kinds.map((kind, i) => ({
      kind: kind.id,
      rarity: "legend",
      grade: g,
      value: values[i],
      skills: [0, 1, 2].map((d) => ({ id: six[(i + d) % six.length], level: lv })),
    }));
  const scored = combinations(pool, Math.min(n, pool.length)).map((six) => {
    const items = make(six);
    const r = fightOnce(content, g, items, fishId, 101);
    return { items, s: r.caught ? r.hits : 1000 };
  });
  scored.sort((x, y) => x.s - y.s);
  let best = null;
  for (const { items } of scored.slice(0, 10)) {
    const sc = score(content, g, items, fishId);
    if (!best || sc < best.score) best = { items, score: sc };
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
