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
  widenRing,
  widenZone,
} from "./combat.js";
import { areaOfStage, inNewestArea, poolRange, setArea } from "./areas.js";
import { baitCount, baitFish, refundBait, setBait, willUseBait } from "./bait.js";
import { DEFAULT_CONFIG } from "./config.js";
import { applyGear, copyGear, emptyGear } from "./gear.js";
import { applySkillsToCombat, scaledReward, scaledWait, skillRates, skillStates, triggerAmounts } from "./skills.js";
import { DEFAULT_CONTENT, FISH_KINDS } from "./fish.js";
import { bossSeed, drawCast, makeBaitCast, makeBossCast, resolveCast } from "./casts.js";
import { triggeredStats, zoneBand } from "./fight_stats.js";
import {
  bandRules,
  chainZoneWidth,
  comboAccelerates,
  copyGloveField,
  countCatchForRetry,
  gloveEffect,
  inGrazeBand,
  rollGloveCrate,
  tailwindMs,
  takeCrateGlove,
  useRetry,
} from "./glove_play.js";
import { drawZone, isHit, markerPosition } from "./minigame.js";
import { createRng, normalizeSeed } from "./rng.js";
import {
  addCount,
  COUNT_MAX,
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

export { FISH_KINDS, triggeredStats, zoneBand };
export { bossSeed, drawCast, makeBaitCast, makeBossCast, resolveCast };

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

/** 進み具合を、ゲームの中で使う形にそろえる(呼んだ側のものは変えない)。餌と自動分解の欄は、あるときだけ写す(D-269)。 */
function ownProgress(progress) {
  const own = {
    coins: progress.coins ?? 0,
    scales: { ...(progress.scales ?? {}) },
    rodStage: progress.rodStage ?? 1,
    rodStep: progress.rodStep ?? ROD_STEPS.NONE,
    seen: [...(progress.seen ?? [])],
    gear: copyGear(progress.gear ?? emptyGear()),
  };
  if (progress.bait) own.bait = progress.bait;
  if (progress.useBait) own.useBait = true;
  if (progress.autoScrap) own.autoScrap = progress.autoScrap;
  if (progress.area) own.area = progress.area;
  // グローブの持ち物(あるときだけ:D-335)。
  copyGloveField(progress, own);
  return own;
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
  // おまもり:獲得ウロコインの倍率に足す(豊漁と足し算:D-320)。なければ倍率はそのまま。
  if (game.combat.coinBonus > 0) game.rates = { ...game.rates, coins: game.rates.coins + game.combat.coinBonus };
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
    // 仕切り直しのストック(null は上限いっぱい)と、釣り上げた魚の数。保存しない(D-334)。
    retry: { stock: null, fish: 0 },
    // 釣れるクレートの出現率の上書き(?debug の 100% だけ。null なら config の値)。
    crateChance: null,
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
    range: poolRange(game.progress, game.content),
  });
}

/** いまの釣り場の魚で、引いた数から投を決め直す(乱数は引かない)。餌の投とヌシ戦は変えない。 */
function reresolve(game, cast) {
  if (!cast || !cast.raw || cast.bait || cast.kind === FISH_KINDS.BOSS) return cast;
  return resolveCast(cast.raw, game.config, game.content.fish, poolRange(game.progress, game.content));
}

/**
 * 釣り場を移る(解放済みの釣り場だけ:D-273)。移れたら true。
 * 投げている・待っている投と、ヌシ戦の間に取っておいた投は、乱数を引き直さずに、新しい釣り場の魚に決め直す。
 * 掛かったあと(合わせ・戦い・結果)の魚はそのまま。次の投から新しい釣り場の魚が出る。
 */
export function moveArea(game, id) {
  if (!setArea(game.progress, id, game.content)) return false;
  if (game.phase === PHASES.CASTING || game.phase === PHASES.WAITING) game.cast = reresolve(game, game.cast);
  if (game.pendingCast) game.pendingCast = reresolve(game, game.pendingCast);
  return true;
}

export { HOOK_GRADES };

/** 今の魚の、合わせの輪の時間の区切り(「!」からのミリ秒)(D-087)。 */
export function currentHookTiming(game) {
  const { hook } = game.combat;
  const ring = game.cast.kind === FISH_KINDS.STRONG ? hook.strong : hook.normal;
  // 浮き:成功帯とジャスト帯を割合で広げる(D-320)。
  return hookTiming(widenRing(ring, game.combat.hookWiden ?? 0, game.config.combatLimits));
}

/**
 * 戦闘の印が端から端まで動く時間(おもりで遅くした値:D-320)。印の速さ ×(1 − 割合)。基準の 50% より遅くしない。
 * おもりがなければ、魚の値のまま。
 * @param {any} game
 */
export function fightSweepMs(game) {
  const sweep = game.cast.minigame.sweepMs;
  const slow = Math.min(game.config.combatLimits.maxMarkerSlow ?? 0.5, game.combat.markerSlow ?? 0);
  return slow > 0 ? sweep / (1 - slow) : sweep;
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
  game.autoHooked = false;
  enter(game, PHASES.CASTING);
}

const NO_REWARD = Object.freeze({ coins: 0, scales: 0 });

function finish(game, outcome, reason) {
  if (game.cast.crate) return finishCrate(game, outcome, reason);
  const { fish, kind } = game.cast;
  const caught = outcome === OUTCOMES.CAUGHT;
  const reward = caught ? scaledFishReward(game, fish) : NO_REWARD;
  const firstCatch = caught && !game.progress.seen.includes(fish.id);
  const result = { fishId: fish.id, kind, outcome, reason, reward, firstCatch, hook: game.hookGrade ?? null };
  // 自動合わせで掛けた(D-334)。
  if (game.autoHooked) result.auto = true;
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
    // 仕切り直しのストックは、魚(弱い・強い)を 10 匹釣るごとに増える(D-334)。
    if (kind !== FISH_KINDS.BOSS) countCatchForRetry(game);
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
 * 釣れるクレートの結果(D-333)。合わせが成功したらグローブが手に入り、失敗したら逃げる。魚の報酬・図鑑・数には入れない。
 * 合わせを逃したときの数え方は、魚と同じ。
 */
function finishCrate(game, outcome, reason) {
  const caught = outcome === OUTCOMES.CAUGHT;
  const glove = caught ? takeCrateGlove(game) : null;
  const result = { fishId: null, kind: game.cast.kind, crate: true, glove, outcome, reason, reward: NO_REWARD, firstCatch: false, hook: game.hookGrade ?? null };
  game.results.push(result);
  game.lastResult = result;
  if (!caught) game.counts.escaped += 1;
  game.missStreak = reason === REASONS.EARLY || reason === REASONS.LATE ? game.missStreak + 1 : 0;
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

/**
 * 餌を使う投(D-264)。魚の乱数は、もう使わないときと同じ数・順番で引いてある(nextCast の drawGameCast)。
 * その結果を、いまの段階の強い魚に置き換え、餌を 1 個減らす。ヌシ戦のあとの、取っておいた投にも使える(1 投 1 個)。
 */
function applyBait(game) {
  const p = game.progress;
  // 餌は、いちばん新しい釣り場でだけ使える(D-274)。
  if (!willUseBait(p) || game.cast.bait || !inNewestArea(p, game.content)) return;
  const fish = baitFish(game.content, p.rodStage);
  if (!fish) return;
  game.cast = makeBaitCast(fish, game.config, game.seed, game.castCount, game.cast.waitMs);
  setBait(p, baitCount(p) - 1);
}

/** 場面が時間切れになったときに、次の場面へ進める。 */
function advance(game) {
  switch (game.phase) {
    case PHASES.CASTING:
      // 投げ終わったら、餌を使う(スイッチが入っていて餌があるとき:D-263・D-264)。
      applyBait(game);
      // 釣れるクレートの判定(餌のあと。投ごとに 1 回:D-333)。
      rollGloveCrate(game);
      return enter(game, PHASES.WAITING);
    case PHASES.WAITING:
      return enter(game, PHASES.BITE);
    case PHASES.BITE:
      // 自動合わせ:輪が成功帯に入った瞬間に成功(ジャストなし:D-334)。
      if (gloveEffect(game, "auto-hook")) return hookSuccess(game, HOOK_GRADES.GOOD, true);
      // 仕切り直し:ストックがあれば、逃げずに輪をもう一度(D-334)。
      if (useRetry(game)) return enter(game, PHASES.BITE);
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
    const remaining = phaseEnd(game) - game.phaseMs;
    if (rest < remaining) {
      game.phaseMs += rest;
      return game;
    }
    rest -= remaining;
    advance(game);
  }
  return game;
}

/** 場面が次へ進む時刻。自動合わせが効くときの合わせは、輪が成功帯に入る瞬間(D-334)。ほかは場面の長さ。 */
function phaseEnd(game) {
  if (game.phase === PHASES.BITE && gloveEffect(game, "auto-hook")) return currentHookTiming(game).successStart;
  return phaseDuration(game);
}

/** ミニゲーム中の印の位置(0〜1)。ミニゲーム中でなければ null。 */
export function currentMarker(game) {
  if (game.phase !== PHASES.MINIGAME) return null;
  return markerPosition(game.phaseMs, fightSweepMs(game));
}

function resumeAfterBoss(game) {
  game.cast = game.pendingCast;
  game.pendingCast = null;
  game.fight = null;
  game.hookGrade = null;
  game.autoHooked = false;
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
    // 戦闘中の一時的な上乗せ(D-186)。戦闘が終わると消え、保存しない。
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
    // グローブ:保険で無効にしたミスの数、かすりの数(D-334)。
    insured: 0,
    grazes: 0,
    // 追い風で延ばした制限時間の合計(D-340)。
    tailwindMs: 0,
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
 * タップを判定する、場面の中の時刻(ミリ秒)。backMs だけさかのぼる。場面の始まりと、前のタップより前にはしない。
 * @param {any} game @param {number} backMs
 */
function tapTime(game, backMs) {
  const back = Number.isFinite(backMs) && backMs > 0 ? backMs : 0;
  if (back === 0) return game.phaseMs;
  const floor = game.phase === PHASES.MINIGAME ? (game.fight?.lastTapMs ?? 0) : 0;
  return Math.max(floor, game.phaseMs - back);
}

function fightTap(game, at = game.phaseMs) {
  const { fight, config, combat } = game;
  const position = markerPosition(at, fightSweepMs(game));
  fight.lastTapMs = at;
  if (isHit(position, fight.zone)) {
    const triggered = triggeredStats(game, position);
    const active = triggered.active;
    // 会心率・倍率・貫通の合計に逓減をかける(D-255・D-260)。
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
    // 連撃加速:決まった回数ごとに、段数を追加で 1(最大の段数はこえない:D-340)。
    const accel = comboAccelerates(game, fight.hits) && fight.combo < config.skills.comboMax;
    if (accel) fight.combo += 1;
    // 追い風:命中で制限時間を延ばす(戦闘ごとに上限まで:D-340)。
    const tailwind = tailwindMs(game);
    fight.timeLimitMs += tailwind;
    fight.tailwindMs += tailwind;
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
      band: zoneBand(position, fight.zone, bandRules(game)),
      combo: fight.combo,
      hp: fight.hp,
      maxHp: fight.maxHp,
      position,
      ...(accel ? { accel: true } : {}),
      ...(tailwind > 0 ? { tailwind } : {}),
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
    // 連鎖:段数に応じて広げた幅(D-340)。
    fight.zone = widenZone(drawn, chainZoneWidth(game, game.cast.minigame.zoneWidth) ?? fight.zoneWidth, config.minigame.zoneMargin);
    return { ...base, caught: false };
  }
  // かすり:命中範囲のすぐ外は、少しダメージが入る(命中に数えない:D-334)。
  const graze = gloveEffect(game, "graze");
  if (graze && inGrazeBand(position, fight.zone, graze.outer)) return grazeTap(game, position, graze.damage);
  // 保険:戦闘ごとに決まった回数まで、ミスを無効にする(回復・連撃のリセットも起きない:D-334)。
  const insurance = gloveEffect(game, "insurance");
  if (insurance && fight.insured < insurance) {
    fight.insured += 1;
    return { action: "miss", insured: true, heal: 0, hp: fight.hp, maxHp: fight.maxHp, position, combo: fight.combo };
  }
  // ミスしたら回復する。最大の体力はこえない。連撃は途切れる(D-185)。ミスのボーナスはない(D-181)。
  const before = fight.hp;
  fight.hp = Math.min(fight.maxHp, fight.hp + combat.missHeal);
  fight.misses += 1;
  // 連撃の維持:段数の一部が残る(端数は切り捨て:D-334)。
  const keep = gloveEffect(game, "combo-keep");
  const kept = keep ? Math.floor(fight.combo * keep) : 0;
  fight.combo = kept;
  // 連鎖:段数が減ったら、命中範囲の幅も戻す(真ん中は保つ:D-340)。
  const chained = chainZoneWidth(game, game.cast.minigame.zoneWidth);
  if (chained !== null) fight.zone = widenZone(fight.zone, chained, config.minigame.zoneMargin);
  const miss = { action: "miss", heal: fight.hp - before, hp: fight.hp, maxHp: fight.maxHp, position };
  return keep ? { ...miss, comboKept: kept } : miss;
}

/**
 * かすり(D-334):通常の命中(会心・条件発動型なし)のダメージ × 割合(四捨五入、1 以上)を、防御と貫通で通常どおり減らす。
 * 体力は回復しない。命中に数えない(連撃の段数・命中範囲の位置・クリティカルの乱数は変えない)。
 */
function grazeTap(game, position, ratio) {
  const { fight, combat, config } = game;
  const limits = config.combatLimits;
  const stats = effectiveStats(combat, config.formula ?? null);
  const raw = Math.max(1, Math.round(Math.min(limits.maxHitDamage, hitDamage(stats, 0, limits)) * ratio));
  const effDefense = effectiveDefense(game.cast.minigame.defense ?? 0, stats.penetration ?? 0);
  const damage = defendedDamage(raw, effDefense);
  fight.hp = Math.max(0, fight.hp - damage);
  fight.grazes += 1;
  const result = { action: "graze", damage, rawDamage: raw, effDefense, defended: damage < raw, hp: fight.hp, maxHp: fight.maxHp, position, combo: fight.combo };
  if (fight.hp === 0) {
    finish(game, OUTCOMES.CAUGHT, REASONS.HP_ZERO);
    return { ...result, caught: true };
  }
  return { ...result, caught: false };
}

/**
 * タップしたときの処理。場面ごとに意味がちがう。
 * - 掛かった:合わせ。輪が成功帯より前なら早すぎで逃げる。成功帯なら、弱い魚は巻き上げへ、
 *   強い魚は体力制のミニゲームへ(ジャストなら最初の一撃が上がる)。
 * - ミニゲーム:印が命中範囲の中なら命中(体力が減る)、外ならミス(回復する)。
 * - 休み:再開して、次の魚を投げる。
 * それ以外の場面では何もせず null を返す。
 */
export function tap(game, backMs = 0) {
  // 押した時刻が、いまのゲームの時刻より backMs だけ前のときは、その時刻で判定する(D-284)。
  // さかのぼれるのは、いまの場面の中で、前のタップのあとまで(場面の始まりや前のタップより前にはしない)。
  const at = tapTime(game, backMs);
  switch (game.phase) {
    case PHASES.BITE: {
      // 縮む輪の位置(「!」からの時間)で決める。乱数は使わない(D-088)。
      const timing = currentHookTiming(game);
      // 自動合わせが効くときは、成功帯より前のタップを無視する(早すぎで逃がさないように:D-337)。
      if (at < timing.successStart && gloveEffect(game, "auto-hook")) return null;
      const grade = judgeHook(timing, at);
      if (grade === HOOK_GRADES.EARLY) {
        // 仕切り直し:ストックがあれば、逃げずに輪をもう一度(D-334)。
        if (useRetry(game)) {
          enter(game, PHASES.BITE);
          return { action: "hook", grade, retry: true };
        }
        finish(game, OUTCOMES.ESCAPED, REASONS.EARLY);
        return { action: "hook", grade };
      }
      return hookSuccess(game, grade, false);
    }
    case PHASES.MINIGAME:
      return fightTap(game, at);
    case PHASES.RESTING:
      game.missStreak = 0;
      nextCast(game);
      return { action: "resume" };
    default:
      return null;
  }
}

/**
 * 合わせの成功。弱い魚(と釣れるクレート)は巻き上げへ、強い魚は体力制へ(ジャストなら初撃:D-256)。
 * auto は自動合わせ(結果に印を付ける)。
 */
function hookSuccess(game, grade, auto) {
  game.hookGrade = grade;
  game.autoHooked = auto;
  const mark = auto ? { auto: true } : {};
  if (game.cast.kind === FISH_KINDS.WEAK) {
    enter(game, PHASES.REELING);
    return { action: "hook", grade, ...mark };
  }
  // 強い魚のジャストなら初撃が入る(体力以上なら、その場で釣り上げ:D-256)。
  const strike = startFight(game, grade);
  return strike ? { action: "hook", grade, strike, ...mark } : { action: "hook", grade, ...mark };
}

/** 今の段階の表の行(製作の鱗・ヌシ・進化の鱗)。 */
export function gameStage(game) {
  return currentStage(game.progress, game.content);
}

/** いちばん新しい釣り場にいるか(製作・ヌシ戦・進化・餌はここでだけ:D-274)。 */
export function inNewestGameArea(game) {
  return inNewestArea(game.progress, game.content);
}

/** 竿を製作できるか(いちばん新しい釣り場でだけ)。 */
export function canCraftRod(game) {
  return inNewestGameArea(game) && canCraft(game.progress, game.content);
}

/** 竿を製作する(鱗を使う)。 */
export function craftGameRod(game) {
  return canCraftRod(game) && craftRod(game.progress, game.content);
}

/** 竿を進化できるか(いちばん新しい釣り場でだけ)。 */
export function canEvolveRod(game) {
  return inNewestGameArea(game) && canEvolve(game.progress, game.content);
}

/**
 * 竿を進化する。次の段階の魚は、次に投げるときから一覧に加わる。
 * 段階が進んだら、残りの餌を、進化の前の段階の価格で払い戻す(D-263)。結果は game.baitRefund({ count, coins })に置く。
 */
export function evolveGameRod(game) {
  const before = game.progress.rodStage;
  const done = canEvolveRod(game) && evolveRod(game.progress, game.content);
  game.baitRefund = null;
  game.areaUnlocked = null;
  if (done && game.progress.rodStage !== before) {
    const refund = refundBait(game.progress, before, COUNT_MAX, game.config.formula);
    if (refund.count > 0) game.baitRefund = refund;
    // 釣り場の最後のヌシのあと:次の釣り場が解放され、そのまま移る(古い釣り場の欄は持たない:D-273)。
    const area = areaOfStage(game.content, game.progress.rodStage);
    if (area !== areaOfStage(game.content, before)) {
      delete game.progress.area;
      game.areaUnlocked = area;
      // 投げている・待っている投は、新しい釣り場の魚に決め直す(乱数は引き直さない)。
      if (game.phase === PHASES.CASTING || game.phase === PHASES.WAITING) game.cast = reresolve(game, game.cast);
      if (game.pendingCast) game.pendingCast = reresolve(game, game.pendingCast);
    }
  }
  // 段階が上がると、成長型のスキルの最大レベルが伸びる(D-167)。
  if (done) refreshCombat(game);
  return done;
}

/**
 * ヌシに挑めるか(D-101)。工程が製作済みかヌシ撃破で、魚が掛かっていない(投げる・待つの間)とき。
 */
export function canChallengeBoss(game) {
  const phaseOk = game.phase === PHASES.CASTING || game.phase === PHASES.WAITING;
  return phaseOk && inNewestGameArea(game) && canChallengeStep(game.progress) && !!gameStage(game);
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
  game.autoHooked = false;
  startFight(game, null);
  return true;
}
