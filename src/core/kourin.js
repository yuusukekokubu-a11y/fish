// @ts-check
// 降臨(レイド風:D-396・D-397)。4 キャラ(疾風の大エビ・鉄壁の大ガニ・不死の大ダコ・刹那の大イカ)に、挑戦ごとのダメージを積み重ねて挑む。
// - ウロコパワー(D-403・D-408):釣り上げで貯め(魚の段階で増える)、強い魚の鱗の余りも替えて足せる(上限なし)。貯めた分を、ねらう相手に注入する。
//   相手ごとに、レベルに応じた量が要る。満たした相手を呼び、倒すまで何回でも無料で挑める。竿の段階には依らない。
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
  Object.freeze({ id: "ebi", name: "疾風の大エビ", quirk: "fast", charm: "shizume" }),
  Object.freeze({ id: "kani", name: "鉄壁の大ガニ", quirk: "wall", charm: "yaburi" }),
  Object.freeze({ id: "tako", name: "不死の大ダコ", quirk: "regen", charm: "yawaragi" }),
  Object.freeze({ id: "ika", name: "刹那の大イカ", quirk: "short", charm: "toki" }),
]);

/** 降臨のキャラの色(絵がないとき・光の色)。 */
export const KOURIN_COLOR = "#9b5cff";

/**
 * 呼んでいるキャラ。hp は残りの体力、tries は挑戦の回数、paid は払った区切りの数(0〜steps − 1)。
 * @typedef {{ char: string, hp: number, tries: number, paid: number }} Raid
 */

/**
 * 相手ごとに注入した量。total は合計、scales はそのうち鱗から入れた分(D-403 の記録。D-408 から鱗はウロコパワーに替えてから注入するので、増えない。保存の形のため残す)。
 * @typedef {{ total: number, scales: number }} Fill
 */

/**
 * 降臨の状態。power は貯めているウロコパワー(まだ注入していない分)。fills は相手ごとに注入した量(0 の相手は持たない)。
 * cleared はキャラごとの倒したレベル(1 以上だけ)。
 * @typedef {{ power: number, fills: Record<string, Fill>, cleared: Record<string, number>, raid: Raid | null }} KourinState
 */

/** @typedef {typeof import("./config.js").DEFAULT_CONFIG.kourin} KourinConfig */

/** 降臨の乱数の種を、ヌシ戦・餌・グローブの種とずらすための数。 */
const KOURIN_SEED_SALT = 0x6a09e667;
const KOURIN_GLOVE_SALT = 0x510e527f;

/** 何もしていない降臨の状態。 @returns {KourinState} */
export function emptyKourin() {
  return { power: 0, fills: {}, cleared: {}, raid: null };
}

/** 既定の形か(保存で欄を持たないため)。 @param {KourinState} k */
export function isEmptyKourin(k) {
  return k.power === 0 && Object.keys(k.fills).length === 0 && k.raid === null && Object.values(k.cleared).every((n) => !(n > 0));
}

/** 複製。 @param {KourinState} k @returns {KourinState} */
export function copyKourin(k) {
  const fills = Object.fromEntries(Object.entries(k.fills).map(([id, f]) => [id, { ...f }]));
  return { power: k.power, fills, cleared: { ...k.cleared }, raid: k.raid ? { ...k.raid } : null };
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

/** 段階(レベル)ごとの倍率:growth^(stage − 1)。 @param {number} stage @param {KourinConfig} c */
function stageScale(stage, c) {
  return c.growth ** (Math.max(1, stage) - 1);
}

/** 次に挑むレベル(倒したレベル + 1)。 @param {KourinState} k @param {string} id */
export function raidLevel(k, id) {
  return (k.cleared[id] ?? 0) + 1;
}

/** レベル level の相手を呼ぶのに要るウロコパワー。 @param {number} level @param {KourinConfig} c */
export function needPower(level, c) {
  return Math.round(c.need * stageScale(level, c));
}

/** 相手に注入した量(なければ 0)。 @param {KourinState} k @param {string} id @returns {Fill} */
export function fillOf(k, id) {
  return k.fills[id] ?? { total: 0, scales: 0 };
}

/**
 * 釣り上げで貯まるウロコパワー。強い魚とヌシは strongPower、ほか(弱い魚・餌の強い魚)は weakPower。魚の段階で増える。
 * @param {string} kind @param {boolean} bait @param {number} stage 魚の段階 @param {KourinConfig} c
 */
export function catchPower(kind, bait, stage, c) {
  const base = (kind === "strong" && !bait) || kind === "boss" ? c.strongPower : c.weakPower;
  return Math.round(base * stageScale(stage, c));
}

/**
 * 釣り上げたときにウロコパワーを貯める(解放されているときだけ)。貯まった量を返す。
 * @param {any} progress @param {any} content @param {string} kind @param {boolean} bait @param {number} stage @param {KourinConfig} c
 */
export function addCatchPower(progress, content, kind, bait, stage, c) {
  if (!kourinUnlocked(progress, content)) return 0;
  const add = catchPower(kind, bait, stage, c);
  const k = ensureKourin(progress);
  k.power = addCount(k.power, add);
  return add;
}

/**
 * ウロコパワーに替えられる鱗(1 枚の量が多い順)。強い魚の鱗だけ。今の竿の段階の鱗は、未製作なら製作に要る分を残した余り。
 * 1 枚の量(each)は scalePower × growth^(鱗の段階 − 1)。
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
    if (count > 0) out.push({ fishId: f.id, stage: f.stage, count, each: Math.round(c.scalePower * stageScale(f.stage, c)) });
  }
  return out.sort((a, b) => b.each - a.each);
}

/**
 * 鱗をまとめてウロコパワーに替える(D-408。scaleOffers の全部。上限なし)。替えた鱗の枚数と増えたウロコパワーを返す。
 * @param {any} progress @param {any} content @param {KourinConfig} c
 * @returns {{ scales: number, power: number }}
 */
export function convertScales(progress, content, c) {
  if (!kourinUnlocked(progress, content)) return { scales: 0, power: 0 };
  let scales = 0;
  let power = 0;
  for (const o of scaleOffers(progress, content, c)) {
    progress.scales[o.fishId] -= o.count;
    if (progress.scales[o.fishId] === 0) delete progress.scales[o.fishId];
    scales += o.count;
    power += o.count * o.each;
  }
  if (power > 0) {
    const k = ensureKourin(progress);
    k.power = addCount(k.power, power);
  }
  return { scales, power };
}

/**
 * 相手 id に注入できる量(貯めているウロコパワーから、要る量まで:D-408)。
 * @param {any} progress @param {any} content @param {string} id @param {KourinConfig} c
 */
export function injectableOf(progress, content, id, c) {
  const k = kourinOf(progress);
  if (!kourinUnlocked(progress, content) || !kourinById(id) || k.raid?.char === id) return 0;
  return Math.min(k.power, Math.max(0, needPower(raidLevel(k, id), c) - fillOf(k, id).total));
}

/** 相手 id に注入する(injectableOf の量)。注入した量を返す。 @param {any} progress @param {any} content @param {string} id @param {KourinConfig} c */
export function injectPower(progress, content, id, c) {
  const add = injectableOf(progress, content, id, c);
  if (add <= 0) return 0;
  const k = ensureKourin(progress);
  const fill = fillOf(k, id);
  k.fills[id] = { total: fill.total + add, scales: fill.scales };
  k.power -= add;
  return add;
}

/** 相手 id が要る量まで満たされているか。 @param {KourinState} k @param {string} id @param {KourinConfig} c */
export function isFilled(k, id, c) {
  return fillOf(k, id).total >= needPower(raidLevel(k, id), c);
}

/**
 * 呼べるか(解放済み・呼んでいない・要る量まで注入した)。id を省くと、どれか 1 体でも呼べるか。
 * @param {any} progress @param {any} content @param {KourinConfig} c @param {string} [id]
 */
export function canSummon(progress, content, c, id = undefined) {
  const k = kourinOf(progress);
  if (!kourinUnlocked(progress, content) || k.raid !== null) return false;
  return id === undefined ? KOURIN_ROWS.some((r) => isFilled(k, r.id, c)) : Boolean(kourinById(id)) && isFilled(k, id, c);
}

/**
 * レベル level のキャラの戦闘の設定(くせはキャラのもの。体力は段階 level のヌシ × hpRatio(キャラごとの上書きは hpRatioByChar:D-404)を上から 2 けた)。
 * 防御の壁は、下限(floor)を置かず「ふつうの貫通 + margin」にする(川より前のレベルでも、貫通なしで削れるように:D-397)。
 * @param {KourinRow} row @param {number} level @param {any} config
 */
export function raidMinigame(row, level, config) {
  const mg = fishMinigame("boss", level, config.formula, [row.quirk]);
  const wall = config.formula.quirks.wall;
  const defense = row.quirk === "wall" ? Math.round((typicalPenetration(level, config.formula) + wall.margin) * 1000) / 1000 : mg.defense;
  const ratio = /** @type {Record<string, number>} */ (config.kourin.hpRatioByChar)[row.id] ?? config.kourin.hpRatio;
  return { ...mg, defense, hp: round2(mg.hp * ratio) };
}

/** 呼ぶ(その相手に注入した分を使い切る)。呼べたら true。 @param {any} progress @param {string} id @param {any} content @param {any} config */
export function summonRaid(progress, id, content, config) {
  const row = kourinById(id);
  if (!row || !canSummon(progress, content, config.kourin, id)) return false;
  const k = ensureKourin(progress);
  k.raid = { char: row.id, hp: raidMinigame(row, raidLevel(k, row.id), config).hp, tries: 0, paid: 0 };
  delete k.fills[row.id];
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
