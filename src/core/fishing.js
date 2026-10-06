// 釣りの 1 サイクル:投げる → 待つ → 掛かる(合わせのタップ)→
// (弱い魚は巻き上げ/強い魚は体力制のミニゲーム)→ 結果。
// 竿の工程(製作 → ヌシ戦 → 進化)と、ヌシ戦(合わせなしで体力制から始まる特別な戦い)もここで進める。
// 画面に関係しない計算だけを置く(D-028)。時間は update に渡したぶんだけ進む。
// プレイヤーの操作がなければ、釣果は増えない(D-053)。

import {
  consumeBoosts,
  critSeed,
  critStages,
  DEFAULT_CRIT_RULES,
  defendedDamage,
  effectiveDefense,
  effectiveStats,
  fightTimeLimit,
  hitDamage,
  HOOK_GRADES,
  hookTiming,
  judgeHook,
  lureZoneWidth,
  normalizeCombat,
  strikeDamage,
  widenZone,
} from "./combat.js";
import { DEFAULT_CONFIG } from "./config.js";
import { applyGear, copyGear, emptyGear } from "./gear.js";
import { applySkillsToCombat, scaledReward, scaledWait, skillRates, skillStates, triggerAmounts } from "./skills.js";
import { availableFish, DEFAULT_CONTENT, effectiveMinigame, FISH_KINDS, FISH_LIST, pickWeighted } from "./fish.js";
import { drawZone, isHit, markerPosition, zoneAt } from "./minigame.js";
import { createRng, normalizeSeed } from "./rng.js";
import {
  addCount,
  canChallengeStep,
  canCraft,
  canEvolve,
  craftRod,
  currentStage,
  evolveRod,
  markBossDefeated,
  ROD_STEPS,
} from "./rod.js";
import { initialProgress } from "./save.js";

export { FISH_KINDS };

export const PHASES = Object.freeze({
  CASTING: "casting", // 投げる
  WAITING: "waiting", // 待つ
  BITE: "bite", // 掛かった:輪が縮み、合わせのタップを待つ
  REELING: "reeling", // 合わせたあと、弱い魚を巻き上げる
  MINIGAME: "minigame", // 強い魚・ヌシとの体力制のミニゲーム
  RESULT: "result", // 結果を見せる
  RESTING: "resting", // 合わせを続けて逃したので休む(タップで再開)
});

export const OUTCOMES = Object.freeze({ CAUGHT: "caught", ESCAPED: "escaped" });

// 結果の理由。
export const REASONS = Object.freeze({
  EARLY: "early", // 合わせが早すぎた(輪が成功帯より大きいうちにタップした)
  LATE: "late", // 合わせが遅すぎた(輪が通り過ぎるまでタップしなかった)
  HOOKED: "hooked", // 弱い魚を合わせで釣り上げた
  HP_ZERO: "hp-zero", // 強い魚・ヌシの体力をゼロにした
  TIMEOUT: "timeout", // 強い魚・ヌシとの制限時間が切れた
  STRIKE: "strike", // 強い魚を、ジャストの初撃で釣り上げた(ミニゲームなし:D-256)
});

/**
 * 「魚の系統」の乱数で、竿の段階 rodStage の 1 回の投げを決める(D-046・D-064)。
 * 引く順番は固定:待ち時間 → 魚 →(強い魚なら)ミニゲームの種。引く回数は Issue #6 から同じ。
 * ミニゲームの種から、最初の命中範囲と「ミニゲームの系統」の乱数を作る。
 * options:{ fish: 魚の設定表, strongChance: 強い魚の出現率 }(なければ基本の表と config の値)。
 */
export function drawCast(rng, config = DEFAULT_CONFIG, rodStage = 1, options = {}) {
  const list = options.fish ?? FISH_LIST;
  const strongChance = options.strongChance ?? config.strongChance;
  const waitMs = config.waitMinMs + rng() * (config.waitMaxMs - config.waitMinMs);
  const u = rng();
  const strong = u < strongChance;
  const kind = strong ? FISH_KINDS.STRONG : FISH_KINDS.WEAK;
  // 区分の中での位置を 0〜1 に引きのばし、その値で種類を選ぶ。
  const v = strong ? u / strongChance : (u - strongChance) / (1 - strongChance);
  const fish = pickWeighted(availableFish(rodStage, kind, list), v);
  const minigame = effectiveMinigame(fish, config.minigame);
  if (!minigame) return { waitMs, kind, fish, minigame: null, zone: null, minigameSeed: null };
  const seedValue = rng();
  const zone = zoneAt(seedValue, { zoneWidth: minigame.zoneWidth, zoneMargin: config.minigame.zoneMargin });
  return { waitMs, kind, fish, minigame, zone, minigameSeed: Math.floor(seedValue * 4294967296) };
}

/** ヌシ戦の 1 回ぶん。乱数は、シードと「何回目の挑戦か」から作る(魚の系統は使わない:D-115)。 */
export function makeBossCast(boss, config, seed, attempt) {
  const minigameSeed = bossSeed(seed, attempt);
  const minigame = effectiveMinigame(boss, config.minigame);
  const zone = zoneAt(createRng(minigameSeed ^ 0x2545f491)(), {
    zoneWidth: minigame.zoneWidth,
    zoneMargin: config.minigame.zoneMargin,
  });
  return { waitMs: 0, kind: FISH_KINDS.BOSS, fish: boss, minigame, zone, minigameSeed };
}

/** ヌシ戦の乱数の種。 */
export function bossSeed(seed, attempt) {
  return critSeed((seed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0);
}

/** 進み具合を、ゲームの中で使う形にそろえる(呼んだ側のものは変えない)。 */
function ownProgress(progress) {
  return {
    coins: progress.coins ?? 0,
    scales: { ...(progress.scales ?? {}) },
    rodStage: progress.rodStage ?? 1,
    rodStep: progress.rodStep ?? ROD_STEPS.NONE,
    seen: [...(progress.seen ?? [])],
    gear: copyGear(progress.gear ?? emptyGear()),
  };
}

/** 装備を反映した戦闘の数値の表を作り直す(装着・外す・分解のあとに呼ぶ:D-181)。 */
export function refreshCombat(game) {
  const { config, content } = game;
  // スキルのレベル(竿の段階で最大が伸びる)と、報酬・待ち時間の倍率(D-210)。
  game.skills = skillStates(game.progress.gear, game.progress.rodStage, config.skills, content.skills);
  game.rates = skillRates(game.skills, content.skills);
  // 条件発動型の効果の量(条件ごと)。戦闘の命中のたびに、条件を満たしたものだけを使う(D-184)。
  game.triggers = triggerAmounts(game.skills, content.skills);
  // 基本の表 → 装備の基本効果(足し算)→ スキル(足し算 → 掛け算)→ 点検と丸め(D-181・D-210)。
  const geared = applyGear(game.baseCombat, game.progress.gear, content.equipKinds);
  game.combat = normalizeCombat(applySkillsToCombat(geared, game.skills, content.skills), config.combat, config.combatLimits);
  return game.combat;
}

/**
 * 新しいゲームの状態を作る。
 * - progress:保存から読んだ進み具合(なければ初めから)。複製して使う(呼んだ側のものは変えない)。
 * - combat:装備なしの戦闘の数値の表(なければ config.combat の基本の表)。progress.gear の装着中の装備を足し算し、
 *   点検して丸めてから game.combat に置く(D-080・D-181)。装着が変わったら refreshCombat を呼ぶ。
 * - critRules:クリティカルの判定の規則の一覧(なければ確率だけ)。
 * - content:魚と段階の設定表(なければ基本の表)。段階や魚を足すときは、ここに別の表を渡せる(D-093)。
 * - strongChance:強い魚の出現率(なければ config の値)。将来のスキル(大物狙い)で上げられる(D-096)。
 */
export function createGame(
  seed,
  {
    config = DEFAULT_CONFIG,
    progress = initialProgress(),
    combat = config.combat,
    critRules = DEFAULT_CRIT_RULES,
    content = DEFAULT_CONTENT,
    strongChance = config.strongChance,
  } = {},
) {
  const rng = createRng(seed);
  const own = ownProgress(progress);
  const chance = Math.min(1, Math.max(0, Number.isFinite(strongChance) ? strongChance : config.strongChance));
  const game = {
    seed: normalizeSeed(seed),
    config,
    rng,
    // 装備なしの表。装備とスキルを反映した表(combat)は、ここから refreshCombat で作る。
    baseCombat: combat,
    combat: null,
    skills: null,
    rates: null,
    triggers: {},
    critRules,
    content,
    strongChance: chance,
    progress: own,
    phase: PHASES.CASTING,
    phaseMs: 0,
    cast: null,
    castCount: 1,
    fight: null,
    missStreak: 0,
    hookGrade: null,
    bossAttempts: 0,
    pendingCast: null,
    counts: { weak: 0, strong: 0, boss: 0, escaped: 0 },
    results: [],
    lastResult: null,
  };
  refreshCombat(game);
  game.cast = drawGameCast(game);
  return game;
}

function drawGameCast(game) {
  return drawCast(game.rng, game.config, game.progress.rodStage, {
    fish: game.content.fish,
    strongChance: game.strongChance,
  });
}

export { HOOK_GRADES };

/** 今の魚の、合わせの輪の時間の区切り(「!」からのミリ秒)(D-087)。 */
export function currentHookTiming(game) {
  const { hook } = game.combat;
  return hookTiming(game.cast.kind === FISH_KINDS.STRONG ? hook.strong : hook.normal);
}

/** 今の場面の長さ(ミリ秒)。休みは終わりがない(タップで再開)。 */
export function phaseDuration(game) {
  const c = game.config;
  switch (game.phase) {
    case PHASES.CASTING:
      return c.castMs;
    case PHASES.WAITING:
      // 俊敏:引いた待ち時間に倍率を掛ける(引く乱数の数と値は変えない:D-210)。
      return scaledWait(game.cast.waitMs, game.rates.wait, c.skills.minWaitMs);
    case PHASES.BITE:
      return currentHookTiming(game).ringMs;
    case PHASES.REELING:
      return c.reelMs;
    case PHASES.MINIGAME:
      return game.fight.timeLimitMs;
    case PHASES.RESULT:
      return c.resultMs;
    case PHASES.RESTING:
      return Infinity;
    default:
      throw new Error(`知らない場面:${game.phase}`);
  }
}

function enter(game, phase) {
  game.phase = phase;
  game.phaseMs = 0;
}

function nextCast(game) {
  game.cast = drawGameCast(game);
  game.castCount += 1;
  game.fight = null;
  game.hookGrade = null;
  enter(game, PHASES.CASTING);
}

const NO_REWARD = Object.freeze({ coins: 0, scales: 0 });

function finish(game, outcome, reason) {
  const { fish, kind } = game.cast;
  const caught = outcome === OUTCOMES.CAUGHT;
  const reward = caught ? scaledFishReward(game, fish) : NO_REWARD;
  const firstCatch = caught && !game.progress.seen.includes(fish.id);
  const result = { fishId: fish.id, kind, outcome, reason, reward, firstCatch, hook: game.hookGrade ?? null };
  // 弱い魚のジャストのウロコインの倍率(D-258)。画面の「×1.5」に使う。
  if (caught && justCoinRate(game) !== 1) result.justCoinRate = justCoinRate(game);
  if (game.fight) {
    result.hits = game.fight.hits;
    result.misses = game.fight.misses;
    result.crits = game.fight.crits;
    // ジャストの初撃(D-256)。画面の「一撃!」や数字に使う。
    if (game.fight.strike) result.strike = game.fight.strike;
  }
  game.results.push(result);
  game.lastResult = result;
  if (caught) {
    game.counts[kind] += 1;
    const p = game.progress;
    p.coins = addCount(p.coins, reward.coins);
    // 強い魚とヌシは、その魚の鱗を落とす(弱い魚は 0)(D-097)。
    if (reward.scales > 0) p.scales[fish.id] = addCount(p.scales[fish.id] ?? 0, reward.scales);
    if (firstCatch) p.seen.push(fish.id);
    if (kind === FISH_KINDS.BOSS) markBossDefeated(p);
  } else {
    game.counts.escaped += 1;
  }
  // 合わせを逃したとき(早すぎ・遅すぎ)だけ数え、それ以外は数え直す(D-082)。ヌシ戦は数に関係しない。
  if (kind !== FISH_KINDS.BOSS) {
    game.missStreak = reason === REASONS.EARLY || reason === REASONS.LATE ? game.missStreak + 1 : 0;
  }
  enter(game, PHASES.RESULT);
}

/**
 * 豊漁と、弱い魚のジャストを効かせた報酬(ウロコインだけ)。順番は 基本 × ジャスト倍率 × 豊漁 で、
 * まとめて四捨五入する(最小 1:D-196・D-258)。どちらもなければ、魚の表の報酬そのもの(前と同じ)。
 */
function scaledFishReward(game, fish) {
  const rate = game.rates.coins * justCoinRate(game);
  if (rate === 1) return fish.reward;
  return { ...fish.reward, coins: Math.max(1, scaledReward(fish.reward.coins, rate)) };
}

/** 弱い魚をジャストで釣ったときのウロコインの倍率(D-258)。ほかは 1。 */
export function justCoinRate(game) {
  return game.cast.kind === FISH_KINDS.WEAK && game.hookGrade === HOOK_GRADES.JUST ? (game.config.weakJustCoins ?? 1) : 1;
}

/** 場面が時間切れになったときに、次の場面へ進める。 */
function advance(game) {
  switch (game.phase) {
    case PHASES.CASTING:
      return enter(game, PHASES.WAITING);
    case PHASES.WAITING:
      return enter(game, PHASES.BITE);
    case PHASES.BITE:
      return finish(game, OUTCOMES.ESCAPED, REASONS.LATE);
    case PHASES.REELING:
      return finish(game, OUTCOMES.CAUGHT, REASONS.HOOKED);
    case PHASES.MINIGAME:
      return finish(game, OUTCOMES.ESCAPED, REASONS.TIMEOUT);
    case PHASES.RESULT:
      // ヌシ戦のあとは、待っていた魚から続ける(魚の並びは変わらない)。
      if (game.pendingCast) return resumeAfterBoss(game);
      // 合わせを続けて逃したら休む。次の魚は、再開のときに引く(並びは変わらない)。
      if (game.missStreak >= game.config.missStreakLimit) return enter(game, PHASES.RESTING);
      return nextCast(game);
    default:
      throw new Error(`知らない場面:${game.phase}`);
  }
}

/** 時間を dtMs だけ進める。場面をまたいでも、余った時間は次の場面に持ち越す。 */
export function update(game, dtMs) {
  let rest = Math.max(0, dtMs);
  while (rest > 0) {
    const remaining = phaseDuration(game) - game.phaseMs;
    if (rest < remaining) {
      game.phaseMs += rest;
      return game;
    }
    rest -= remaining;
    advance(game);
  }
  return game;
}

/** ミニゲーム中の印の位置(0〜1)。ミニゲーム中でなければ null。 */
export function currentMarker(game) {
  if (game.phase !== PHASES.MINIGAME) return null;
  return markerPosition(game.phaseMs, game.cast.minigame.sweepMs);
}

function resumeAfterBoss(game) {
  game.cast = game.pendingCast;
  game.pendingCast = null;
  game.fight = null;
  game.hookGrade = null;
  enter(game, PHASES.CASTING);
}

/** 命中範囲の幅(ルアーで広げる:D-181)。 */
function fightZoneWidth(game) {
  const { config, combat } = game;
  return lureZoneWidth(game.cast.minigame.zoneWidth, combat, {
    minZoneWidth: config.minigame.minZoneWidth,
    maxZoneWidth: config.combatLimits.maxZoneWidth,
  });
}

/**
 * 戦闘を始める。grade は合わせの結果(ヌシ戦は null。合わせの成功とみなす:D-187)。
 * 条件発動型の「最初の命中」の効果は、戦闘中の一時的な上乗せ(fight.boosts)に積む(D-186)。
 * 強い魚をジャストで合わせたら、初撃を入れる(D-256)。初撃の結果を返す(なければ null)。
 */
function startFight(game, grade) {
  const { minigame, zone, minigameSeed } = game.cast;
  const t = game.triggers ?? {};
  /** @type {object[]} */
  const boosts = [];
  // 先手:合わせの成功(ジャストを含む)とヌシ戦の始まりのあと、最初の命中に効く。初撃のあとの最初の命中に乗る(D-256)。
  if (t.firstHit) boosts.push({ id: "first-hit", when: "firstHit", effects: t.firstHit, uses: 1 });
  const zoneWidth = fightZoneWidth(game);
  game.fight = {
    // 戦闘中の一時的な上乗せ(D-089・D-186)。戦闘が終わると消え、保存しない。
    boosts,
    // 連撃の段数(続けて命中した回数)。ミスで 0 に戻る(D-185)。
    combo: 0,
    hp: minigame.hp,
    maxHp: minigame.hp,
    timeLimitMs: fightTimeLimit(minigame.timeLimitMs, game.combat, game.config.combatLimits),
    // ルアーの命中範囲。広げても真ん中の位置は変えない(乱数の引き方は同じ:D-181)。
    zoneWidth,
    zone: widenZone(zone, zoneWidth, game.config.minigame.zoneMargin),
    // 「ミニゲームの系統」の乱数。魚の系統とは別なので、ここで何回引いても魚の並びは変わらない(D-064)。
    rng: createRng(minigameSeed),
    // クリティカル専用の小さな系統。命中のたびに必ず 1 回引く(D-079)。
    critRng: createRng(critSeed(minigameSeed)),
    hits: 0,
    misses: 0,
    crits: 0,
    // ジャストの初撃の結果(D-256)。なければ null。
    strike: null,
  };
  enter(game, PHASES.MINIGAME);
  if (grade === HOOK_GRADES.JUST && game.cast.kind === FISH_KINDS.STRONG) return justStrike(game);
  return null;
}

/**
 * ジャストの初撃(D-256)。1 命中の基本のダメージ × ジャスト倍率(表 + ジャスト・ブースト、逓減つき)を、実効防御で減らす。
 * クリティカルの判定はしない(乱数を引かない)。命中に数えない(連撃・条件発動型は働かない)。
 * 体力以上なら、その場で釣り上げる(ミニゲームなし)。届かなければ、減った体力でミニゲームを続ける。
 */
function justStrike(game) {
  const { fight, combat, config } = game;
  const limits = config.combatLimits;
  const bonus = game.triggers?.just?.justMultiplier ?? 0;
  const stats = effectiveStats({ ...combat, justMultiplier: combat.justMultiplier + bonus }, config.formula ?? null);
  const multiplier = Math.min(limits.maxJustMultiplier, stats.justMultiplier);
  const effDefense = effectiveDefense(game.cast.minigame.defense ?? 0, stats.penetration ?? 0);
  const { raw, damage } = strikeDamage(combat.damage, multiplier, effDefense, limits.maxHitDamage);
  fight.hp = Math.max(0, fight.hp - damage);
  const strike = { damage, rawDamage: raw, defended: damage < raw, effDefense, multiplier, hp: fight.hp, maxHp: fight.maxHp, caught: fight.hp === 0 };
  fight.strike = strike;
  if (strike.caught) finish(game, OUTCOMES.CAUGHT, REASONS.STRIKE);
  return strike;
}

/**
 * 命中範囲の中の帯(D-197)。中心からの距離(中心 0、端 1)で決める。芯:coreRatio 以下(ちょうどを含む)、
 * 縁:edgeRatio 以上(ちょうどを含む)、その間は通常。範囲の外は null(ミス)。乱数は使わない。
 * @param {number} position @param {{ start: number, end: number }} zone @param {{ coreRatio: number, edgeRatio: number }} rules
 * @returns {"core" | "normal" | "edge" | null}
 */
export function zoneBand(position, zone, rules) {
  if (!isHit(position, zone)) return null;
  const half = (zone.end - zone.start) / 2;
  const d = half > 0 ? Math.abs(position - (zone.start + zone.end) / 2) / half : 0;
  // 浮動小数の誤差で境目がずれないよう、小さい桁でそろえる。
  const dist = Math.round(d * 1e9) / 1e9;
  if (dist <= rules.coreRatio) return "core";
  if (dist >= rules.edgeRatio) return "edge";
  return "normal";
}

/**
 * 命中 1 回の、条件発動型を含めた数値(D-184・D-191)。順は
 * 基本のダメージ(表 + 連撃・攻 × 段数 + 先手)→(1 + とどめ + 縁)を掛けて四捨五入 → (クリティカルの段数を掛ける → ジャスト倍率を掛ける)。
 * 会心率は 表 + 連撃・心 × 段数 + 勢い + 先制 + 芯。position は命中した位置(芯・縁を決める。なければ芯・縁は見ない)。条件発動型がなければ、表のままの値(前と同じ結果)。
 * 返り値の active は、この命中で効いた条件の名前(画面の小さな表示に使う)。
 */
export function triggeredStats(game, position = null) {
  const { fight, combat, config } = game;
  const t = game.triggers ?? {};
  const limits = config.combatLimits;
  const stages = Math.min(fight.combo, config.skills.comboMax);
  // いま満たしている条件と、その効果と、掛ける数(連撃は段数、ほかは 1)。
  /** @type {[string, Record<string, number> | null | undefined, number][]} */
  const met = [];
  if (stages > 0) met.push(["combo", t.combo, stages]);
  // 「最初の命中」「クリティカルの次」などは、戦闘中の一時的な上乗せに積んである(D-186)。
  for (const b of fight.boosts) if (b.when) met.push([b.when, b.effects, 1]);
  // 先制:体力が満タンで、その戦闘の最初の命中まで(ミスで満タンに戻しても、もう効かない:D-192)。
  if (fight.hp >= fight.maxHp && fight.hits === 0) met.push(["fullHp", t.fullHp, 1]);
  if (fight.hp <= fight.maxHp * config.skills.lowHpRatio) met.push(["lowHp", t.lowHp, 1]);
  // 芯・縁:命中した位置の帯で効く(D-197)。
  const band = position === null ? null : zoneBand(position, fight.zone, config.skills);
  if (band === "core" || band === "edge") met.push([band, t[band], 1]);
  /** @type {string[]} */
  const active = [];
  let damageAdd = 0;
  let critAdd = 0;
  let pct = 0;
  let penAdd = 0;
  for (const [when, effects, k] of met) {
    if (!effects) continue;
    const add = (effects.damage ?? 0) * k;
    const crit = (effects.critChance ?? 0) * k;
    const p = (effects.damagePct ?? 0) * k;
    const pen = (effects.penetration ?? 0) * k;
    if (add === 0 && crit === 0 && p === 0 && pen === 0) continue;
    damageAdd += add;
    critAdd += crit;
    pct += p;
    penAdd += pen;
    active.push(when);
  }
  if (damageAdd === 0 && critAdd === 0 && pct === 0 && penAdd === 0) return { stats: combat, active };
  const damage = Math.min(limits.maxDamage, Math.max(limits.minDamage, Math.round((combat.damage + damageAdd) * (1 + pct))));
  const critChance = Math.min(limits.maxCritChance, Math.max(0, combat.critChance + critAdd));
  const penetration = Math.min(limits.maxPenetration ?? Infinity, (combat.penetration ?? 0) + penAdd);
  return { stats: { ...combat, damage, critChance, penetration }, active };
}

function fightTap(game) {
  const { fight, config, combat } = game;
  const position = currentMarker(game);
  if (isHit(position, fight.zone)) {
    const triggered = triggeredStats(game, position);
    const active = triggered.active;
    // 会心率・倍率・貫通の合計に逓減をかける(D-239・D-245)。
    const stats = effectiveStats(triggered.stats, config.formula ?? null);
    // クリティカルの乱数は、命中のたびに 1 回だけ引く。会心率 100% 超は追加の段(D-169)。
    const roll = fight.critRng();
    const limits = config.combatLimits;
    const stages = critStages({ roll, stats, position, zone: fight.zone }, game.critRules, limits.maxCritStages);
    const critical = stages > 0;
    const raw = Math.min(limits.maxHitDamage, hitDamage(stats, stages, limits));
    // 防御で減らす(通常の計算のあと。最小 1。実効防御 100% 以上はいつも 1:D-235)。
    const effDefense = effectiveDefense(game.cast.minigame.defense ?? 0, stats.penetration ?? 0);
    const damage = defendedDamage(raw, effDefense);
    fight.boosts = consumeBoosts(fight.boosts);
    // 勢い:クリティカルのあと、次の命中に効く(次の 1 回だけ)。
    const afterCrit = game.triggers?.afterCrit;
    if (critical && afterCrit) fight.boosts.push({ id: "momentum", when: "afterCrit", effects: afterCrit, uses: 1 });
    // 残りの体力より大きいダメージは、超過を切り捨てる(体力は 0 より下にしない)。
    fight.hp = Math.max(0, fight.hp - damage);
    fight.hits += 1;
    fight.combo += 1;
    if (critical) fight.crits += 1;
    const base = {
      action: "hit",
      damage,
      critical,
      critStages: stages,
      triggers: active,
      // 防御:実効防御と、防御で減らす前のダメージ(画面の色分けに使う)。
      effDefense,
      rawDamage: raw,
      defended: damage < raw,
      // 命中した帯(芯・通常・縁)。画面の「芯」「縁」の表示に使う。
      band: zoneBand(position, fight.zone, config.skills),
      combo: fight.combo,
      hp: fight.hp,
      maxHp: fight.maxHp,
      position,
    };
    if (fight.hp === 0) {
      finish(game, OUTCOMES.CAUGHT, REASONS.HP_ZERO);
      return { ...base, caught: true };
    }
    // 命中したら、命中範囲の位置が変わる。幅は、引いたあとに真ん中を保って広げる(D-181)。
    const drawn = drawZone(fight.rng, {
      zoneWidth: game.cast.minigame.zoneWidth,
      zoneMargin: config.minigame.zoneMargin,
    });
    fight.zone = widenZone(drawn, fight.zoneWidth, config.minigame.zoneMargin);
    return { ...base, caught: false };
  }
  // ミスしたら回復する。最大の体力はこえない。連撃は途切れる(D-185)。ミスのボーナスはない(D-181)。
  const before = fight.hp;
  fight.hp = Math.min(fight.maxHp, fight.hp + combat.missHeal);
  fight.misses += 1;
  fight.combo = 0;
  return { action: "miss", heal: fight.hp - before, hp: fight.hp, maxHp: fight.maxHp, position };
}

/**
 * タップしたときの処理。場面ごとに意味がちがう。
 * - 掛かった:合わせ。輪が成功帯より前なら早すぎで逃げる。成功帯なら、弱い魚は巻き上げへ、
 *   強い魚は体力制のミニゲームへ(ジャストなら最初の一撃が上がる)。
 * - ミニゲーム:印が命中範囲の中なら命中(体力が減る)、外ならミス(回復する)。
 * - 休み:再開して、次の魚を投げる。
 * それ以外の場面では何もせず null を返す。
 */
export function tap(game) {
  switch (game.phase) {
    case PHASES.BITE: {
      // 縮む輪の位置(「!」からの時間)で決める。乱数は使わない(D-088)。
      const grade = judgeHook(currentHookTiming(game), game.phaseMs);
      if (grade === HOOK_GRADES.EARLY) {
        finish(game, OUTCOMES.ESCAPED, REASONS.EARLY);
        return { action: "hook", grade };
      }
      game.hookGrade = grade;
      if (game.cast.kind === FISH_KINDS.WEAK) {
        enter(game, PHASES.REELING);
        return { action: "hook", grade };
      }
      // 強い魚のジャストなら初撃が入る(体力以上なら、その場で釣り上げ:D-256)。
      const strike = startFight(game, grade);
      return strike ? { action: "hook", grade, strike } : { action: "hook", grade };
    }
    case PHASES.MINIGAME:
      return fightTap(game);
    case PHASES.RESTING:
      game.missStreak = 0;
      nextCast(game);
      return { action: "resume" };
    default:
      return null;
  }
}

/** 今の段階の表の行(製作の鱗・ヌシ・進化の鱗)。 */
export function gameStage(game) {
  return currentStage(game.progress, game.content);
}

/** 竿を製作できるか。 */
export function canCraftRod(game) {
  return canCraft(game.progress, game.content);
}

/** 竿を製作する(鱗を使う)。 */
export function craftGameRod(game) {
  return craftRod(game.progress, game.content);
}

/** 竿を進化できるか。 */
export function canEvolveRod(game) {
  return canEvolve(game.progress, game.content);
}

/** 竿を進化する。次の段階の魚は、次に投げるときから一覧に加わる。 */
export function evolveGameRod(game) {
  const done = evolveRod(game.progress, game.content);
  // 段階が上がると、成長型のスキルの最大レベルが伸びる(D-167)。
  if (done) refreshCombat(game);
  return done;
}

/**
 * ヌシに挑めるか(D-101)。工程が製作済みかヌシ撃破で、魚が掛かっていない(投げる・待つの間)とき。
 */
export function canChallengeBoss(game) {
  const phaseOk = game.phase === PHASES.CASTING || game.phase === PHASES.WAITING;
  return phaseOk && canChallengeStep(game.progress) && !!gameStage(game);
}

/**
 * ヌシに挑む。釣りを止めて、合わせなしで体力制の戦いから始める。
 * 待っていた魚は取っておき、戦いのあとにそこから続ける。負けても鱗は減らない。
 */
export function challengeBoss(game) {
  if (!canChallengeBoss(game)) return false;
  const boss = game.content.byId.get(gameStage(game).boss);
  game.pendingCast = game.cast;
  game.cast = makeBossCast(boss, game.config, game.seed, game.bossAttempts);
  game.bossAttempts += 1;
  game.hookGrade = null;
  startFight(game, null);
  return true;
}
