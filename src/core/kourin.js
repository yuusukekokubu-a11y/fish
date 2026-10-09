// @ts-check
// 降臨(レイド風:D-396・D-397)。4 キャラ(大エビ・大ガニ・大ダコ・大イカ)に、挑戦ごとのダメージを積み重ねて挑む。
// - ゲージ(4 体で共通):釣り上げと、強い魚の鱗の余りで貯める。満タンで 1 体を呼び、倒すまで何回でも無料で挑める。
// - キャラごとにレベル 1 から。レベル n の体力 = 段階 n のヌシの体力(キャラのくせの補正つき)× hpRatio。
// - 削った量の 10% ごとに区切りの報酬、討伐でそのキャラのお守り(レベル n を倒すとレベル n)。
// - 乱数は、降臨の塩・キャラ・レベル・挑戦の回数から作る別の系統(魚の系統は使わない:D-115 と同じ考え)。
// 数は config.kourin(D-071 と同じく、コードに数を直接書かない)。画面に関係しない計算だけを置く。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { charmById, charmEffect, emptyCharms } from "./charms.js";
import { critSeed } from "./combat.js";
import { autoScrap, drawItem, drawSeed, gachaKinds, makeCrates } from "./gear.js";
import { fishCoins, fishMinigame, round2, softenMinigame, typicalPenetration } from "./formula.js";
import { drawGlove } from "./glove.js";
import { ensureGloveBag } from "./glove_play.js";
import { zoneAt } from "./minigame.js";
import { createRng } from "./rng.js";
import { addCount, COUNT_MAX, ROD_STEPS } from "./rod.js";
import { SKILL_ROWS } from "./skills.js";
import { noteSkillsSeen } from "./skills_seen.js";

/**
 * 降臨のキャラの行。
 * @typedef {object} KourinRow
 * @property {string} id 保存とコードに使う名前
 * @property {string} name 画面に出す名前
 * @property {string} quirk くせ(config.formula.quirks の名前)
 * @property {string} charm 倒すと授かるお守り(charms.js の id)
 */

/** 降臨のキャラの表(並べ替えない。保存が表の番号を使う)。 @type {readonly KourinRow[]} */
export const KOURIN_ROWS = Object.freeze([
  Object.freeze({ id: "ebi", name: "大エビ", quirk: "fast", charm: "shizume" }),
  Object.freeze({ id: "kani", name: "大ガニ", quirk: "wall", charm: "yaburi" }),
  Object.freeze({ id: "tako", name: "大ダコ", quirk: "regen", charm: "yawaragi" }),
  Object.freeze({ id: "ika", name: "大イカ", quirk: "short", charm: "toki" }),
]);

/** 降臨のキャラの色(絵がないとき・光の色)。 */
export const KOURIN_COLOR = "#9b5cff";

/**
 * 呼んでいるキャラ。hp は残りの体力、tries は挑戦の回数、paid は払った区切りの数(0〜steps − 1)。
 * @typedef {{ char: string, hp: number, tries: number, paid: number }} Raid
 */

/**
 * 降臨の状態。gauge と fromScales は 1 点 = config.kourin.unit の整数。cleared はキャラごとの倒したレベル(1 以上だけ)。
 * @typedef {{ gauge: number, fromScales: number, cleared: Record<string, number>, raid: Raid | null }} KourinState
 */

/** @typedef {typeof import("./config.js").DEFAULT_CONFIG.kourin} KourinConfig */

/** 降臨の乱数の種を、ヌシ戦・餌・グローブの種とずらすための数。 */
const KOURIN_SEED_SALT = 0x6a09e667;
const KOURIN_GLOVE_SALT = 0x510e527f;

/** 何もしていない降臨の状態。 @returns {KourinState} */
export function emptyKourin() {
  return { gauge: 0, fromScales: 0, cleared: {}, raid: null };
}

/** 既定の形か(保存で欄を持たないため)。 @param {KourinState} k */
export function isEmptyKourin(k) {
  return k.gauge === 0 && k.fromScales === 0 && k.raid === null && Object.values(k.cleared).every((n) => !(n > 0));
}

/** 複製。 @param {KourinState} k @returns {KourinState} */
export function copyKourin(k) {
  return { gauge: k.gauge, fromScales: k.fromScales, cleared: { ...k.cleared }, raid: k.raid ? { ...k.raid } : null };
}

/** 進み具合の降臨の状態(なければ既定の形。変えない)。 @param {{ kourin?: KourinState }} progress */
export function kourinOf(progress) {
  return progress.kourin ?? emptyKourin();
}

/** 進み具合に降臨の欄を作って返す。 @param {{ kourin?: KourinState }} progress */
function ensureKourin(progress) {
  if (!progress.kourin) progress.kourin = emptyKourin();
  return progress.kourin;
}

/** キャラの行(なければ undefined)。 @param {string} id */
export function kourinById(id) {
  return KOURIN_ROWS.find((r) => r.id === id);
}

/**
 * 降臨が解放されているか(港を越えたら:竿の段階が 2 つ目の釣り場に入ったら)。
 * @param {{ rodStage: number }} progress @param {{ areas: readonly { firstStage: number }[] }} content
 */
export function kourinUnlocked(progress, content) {
  return content.areas.length > 1 && progress.rodStage >= content.areas[1].firstStage;
}

/** 満タンの量(単位つき)。 @param {KourinConfig} c */
export function fullGauge(c) {
  return c.full * c.unit;
}

/** 次に挑むレベル(倒したレベル + 1)。 @param {KourinState} k @param {string} id */
export function raidLevel(k, id) {
  return (k.cleared[id] ?? 0) + 1;
}

/**
 * 釣り上げで貯まる量(単位つき)。強い魚とヌシは strongPoints、ほか(弱い魚・餌の強い魚)は weakPoints。
 * @param {string} kind @param {boolean} bait @param {KourinConfig} c
 */
export function catchUnits(kind, bait, c) {
  return (kind === "strong" && !bait) || kind === "boss" ? c.strongPoints * c.unit : c.weakPoints * c.unit;
}

/**
 * 釣り上げたときにゲージを貯める(解放されているときだけ。満タンで止まる)。貯まった量を返す。
 * @param {any} progress @param {any} content @param {string} kind @param {boolean} bait @param {KourinConfig} c
 */
export function addCatchGauge(progress, content, kind, bait, c) {
  if (!kourinUnlocked(progress, content)) return 0;
  const k = ensureKourin(progress);
  const before = k.gauge;
  k.gauge = Math.min(fullGauge(c), k.gauge + catchUnits(kind, bait, c));
  return k.gauge - before;
}

/**
 * 納められる鱗(点の高い順)。強い魚の鱗だけ。今の段階は、未製作なら製作に要る分を残した余り。
 * 1 枚の量(each)は scalePoints × scaleDecay^(竿の段階 − 鱗の段階) × unit の切り捨て。0 になる古い鱗は入れない。
 * @param {any} progress @param {any} content @param {KourinConfig} c
 * @returns {{ fishId: string, stage: number, count: number, each: number }[]}
 */
export function scaleOffers(progress, content, c) {
  const stage = content.stageByNumber.get(progress.rodStage);
  /** @type {{ fishId: string, stage: number, count: number, each: number }[]} */
  const out = [];
  for (const f of content.fish) {
    if (f.kind !== "strong" || f.stage > progress.rodStage) continue;
    const have = progress.scales[f.id] ?? 0;
    const keep = stage && progress.rodStep === ROD_STEPS.NONE && stage.craft.scale === f.id ? stage.craft.count : 0;
    const count = have - keep;
    const each = Math.floor(c.scalePoints * c.scaleDecay ** (progress.rodStage - f.stage) * c.unit);
    if (count > 0 && each > 0) out.push({ fishId: f.id, stage: f.stage, count, each });
  }
  return out.sort((a, b) => b.each - a.each || b.stage - a.stage);
}

/**
 * 鱗を納める計画:点の高い鱗から、鱗の分の上限(scaleCap)と満タンまで。最後の 1 枚は、こえる分を切り捨てる。
 * @param {any} progress @param {any} content @param {KourinConfig} c
 * @returns {{ take: { fishId: string, count: number }[], scales: number, units: number }}
 */
export function planDonation(progress, content, c) {
  const k = kourinOf(progress);
  let room = Math.max(0, Math.min(fullGauge(c) - k.gauge, c.scaleCap * c.unit - k.fromScales));
  /** @type {{ fishId: string, count: number }[]} */
  const take = [];
  let scales = 0;
  let units = 0;
  if (!kourinUnlocked(progress, content)) return { take, scales, units };
  for (const o of scaleOffers(progress, content, c)) {
    if (room <= 0) break;
    const n = Math.min(o.count, Math.ceil(room / o.each));
    const add = Math.min(n * o.each, room);
    take.push({ fishId: o.fishId, count: n });
    scales += n;
    units += add;
    room -= add;
  }
  return { take, scales, units };
}

/** 鱗を納める(planDonation のとおり)。納めた { scales, units } を返す。 @param {any} progress @param {any} content @param {KourinConfig} c */
export function donateScales(progress, content, c) {
  const plan = planDonation(progress, content, c);
  if (plan.scales === 0) return { scales: 0, units: 0 };
  const k = ensureKourin(progress);
  for (const t of plan.take) progress.scales[t.fishId] -= t.count;
  for (const t of plan.take) if (progress.scales[t.fishId] === 0) delete progress.scales[t.fishId];
  k.gauge += plan.units;
  k.fromScales += plan.units;
  return { scales: plan.scales, units: plan.units };
}

/** 呼べるか(解放済み・呼んでいない・満タン)。 @param {any} progress @param {any} content @param {KourinConfig} c */
export function canSummon(progress, content, c) {
  const k = kourinOf(progress);
  return kourinUnlocked(progress, content) && k.raid === null && k.gauge >= fullGauge(c);
}

/**
 * レベル level のキャラの戦闘の設定(くせはキャラのもの。体力は段階 level のヌシ × hpRatio を上から 2 けた)。
 * 防御の壁は、下限(floor)を置かず「ふつうの貫通 + margin」にする(川より前のレベルでも、貫通なしで削れるように:D-397)。
 * @param {KourinRow} row @param {number} level @param {any} config
 */
export function raidMinigame(row, level, config) {
  const mg = fishMinigame("boss", level, config.formula, [row.quirk]);
  const wall = config.formula.quirks.wall;
  const defense = row.quirk === "wall" ? Math.round((typicalPenetration(level, config.formula) + wall.margin) * 1000) / 1000 : mg.defense;
  return { ...mg, defense, hp: round2(mg.hp * config.kourin.hpRatio) };
}

/** 呼ぶ(ゲージを空にする)。呼べたら true。 @param {any} progress @param {string} id @param {any} content @param {any} config */
export function summonRaid(progress, id, content, config) {
  const row = kourinById(id);
  if (!row || !canSummon(progress, content, config.kourin)) return false;
  const k = ensureKourin(progress);
  k.raid = { char: row.id, hp: raidMinigame(row, raidLevel(k, row.id), config).hp, tries: 0, paid: 0 };
  k.gauge = 0;
  k.fromScales = 0;
  return true;
}

/** 降臨の戦いの乱数の種。 @param {number} seed @param {number} index キャラの番号 @param {number} level @param {number} tries */
export function raidSeed(seed, index, level, tries) {
  const base = (seed ^ KOURIN_SEED_SALT ^ Math.imul(index * 65536 + level + 1, 0x9e3779b9)) >>> 0;
  return critSeed((base ^ Math.imul(tries + 1, 0x85ebca6b)) >>> 0);
}

/** 降臨のキャラを、魚の形で(画面の名前・色・段階)。 @param {KourinRow} row @param {number} level */
export function raidFish(row, level) {
  return { id: `kourin-${row.id}`, name: `降臨・${row.name}`, kind: "boss", stage: level, color: KOURIN_COLOR, size: 60, kourin: row.id };
}

/**
 * 呼んでいるキャラへの 1 回の挑戦の投(挑戦の回数は、呼ぶ側で進める)。和らぎのお守りで、くせを弱める。
 * 体力は残りから始める(minigame.startHp)。呼んでいなければ null。
 * @param {any} progress @param {any} config @param {number} seed
 */
export function makeRaidCast(progress, config, seed) {
  const raid = kourinOf(progress).raid;
  const row = raid ? kourinById(raid.char) : undefined;
  if (!raid || !row) return null;
  const level = raidLevel(kourinOf(progress), row.id);
  const soften = charmEffect(progress.charms, "yawaragi", true, config.kourin.charmK);
  const mg = softenMinigame(raidMinigame(row, level, config), "boss", level, soften, config.formula);
  const minigameSeed = raidSeed(seed, KOURIN_ROWS.indexOf(row), level, raid.tries);
  const zone = zoneAt(createRng(minigameSeed ^ 0x2545f491)(), { zoneWidth: mg.zoneWidth, zoneMargin: config.minigame.zoneMargin });
  return {
    waitMs: 0,
    kind: "boss",
    fish: raidFish(row, level),
    minigame: { ...mg, startHp: Math.min(raid.hp, mg.hp) },
    zone,
    minigameSeed,
    raid: { char: row.id, level },
  };
}

/**
 * 区切り step(1〜steps)の報酬を払う。step = steps はお守り、真ん中はグローブ、偶数はクレート、ほかはウロコイン。
 * @param {any} game @param {number} step @param {KourinRow} row @param {number} level
 */
function payStep(game, step, row, level) {
  const { progress: p, config, content } = game;
  const c = config.kourin;
  const fishCoinsAt = fishCoins("strong", level, config.formula) * c.coinFish;
  if (step === c.steps) {
    const bag = p.charms ?? (p.charms = emptyCharms());
    const before = bag.levels[row.charm] ?? 0;
    bag.levels[row.charm] = Math.max(before, level);
    if (bag.equipped === null) bag.equipped = row.charm;
    return { step, type: "charm", charm: row.charm, level: bag.levels[row.charm], fresh: before === 0 };
  }
  if (step * 2 === c.steps) {
    const bag = ensureGloveBag(p);
    if (bag.items.length >= config.glove.max) {
      p.coins = addCount(p.coins, fishCoinsAt);
      return { step, type: "coins", coins: fishCoinsAt, full: "glove" };
    }
    const seed = p.gear.seed ?? game.seed;
    const rng = createRng(drawSeed((seed ^ KOURIN_GLOVE_SALT) >>> 0, KOURIN_ROWS.indexOf(row) * 1000003 + level));
    const glove = { id: bag.nextId, ...drawGlove(rng, p.rodStage) };
    bag.nextId += 1;
    bag.items.push(glove);
    return { step, type: "glove", glove };
  }
  if (step % 2 === 0) {
    const crates = makeCrates(content, config);
    const crate = crates[Math.min(level, p.rodStage, crates.length) - 1];
    if (p.gear.items.length >= config.gacha.inventoryMax || p.gear.seed === null) {
      p.coins = addCount(p.coins, crate.price);
      return { step, type: "coins", coins: crate.price, full: "gear" };
    }
    const skillDraw = { skills: content.skills ?? SKILL_ROWS, config: config.skills };
    const item = { id: p.gear.nextId, ...drawItem(p.gear.seed, p.gear.draws, crate, gachaKinds(content.equipKinds), config.gacha.gradeGrowth, skillDraw) };
    p.gear.nextId += 1;
    p.gear.draws += 1;
    p.gear.items.push(item);
    noteSkillsSeen(p, [item], skillDraw.skills);
    const scrapped = autoScrap(p, [item], crates, COUNT_MAX);
    return { step, type: "item", item, scrapped: scrapped.items.length > 0, scrapCoins: scrapped.coins };
  }
  p.coins = addCount(p.coins, fishCoinsAt);
  return { step, type: "coins", coins: fishCoinsAt };
}

/**
 * 降臨の挑戦の終わり。残りの体力を保存し、新しく越えた区切りの報酬を払う。討伐ならお守りを授け、次のレベルへ。
 * 戻り値は結果の中身(fishing.js の結果に入れる)。
 * @param {any} game @param {boolean} caught
 */
export function settleRaid(game, caught) {
  const p = game.progress;
  const c = game.config.kourin;
  const k = ensureKourin(p);
  const raid = k.raid;
  const { char, level } = game.cast.raid;
  const row = /** @type {KourinRow} */ (kourinById(char));
  const maxHp = game.fight.maxHp;
  const hpLeft = caught ? 0 : game.fight.hp;
  const startHp = game.cast.minigame.startHp ?? maxHp;
  const before = raid ? raid.paid : 0;
  const reached = caught ? c.steps : Math.min(c.steps - 1, Math.max(before, Math.floor((c.steps * (maxHp - hpLeft)) / maxHp)));
  const rewards = [];
  for (let step = before + 1; step <= reached; step++) rewards.push(payStep(game, step, row, level));
  if (caught) {
    k.cleared[row.id] = level;
    k.raid = null;
  } else if (raid) {
    raid.hp = Math.max(1, hpLeft);
    raid.paid = reached;
  }
  return { char: row.id, level, defeated: caught, damage: Math.max(0, startHp - hpLeft), hpLeft, maxHp, rewards };
}

/** お守りの名前(画面用)。 @param {string} id */
export function charmName(id) {
  return charmById(id)?.name ?? id;
}
