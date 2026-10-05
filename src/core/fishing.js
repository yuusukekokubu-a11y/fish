// 釣りの 1 サイクル:投げる → 待つ → 掛かる(合わせのタップ)→
// (弱い魚は巻き上げ/強い魚は体力制のミニゲーム)→ 結果。
// 竿の工程(製作 → ヌシ戦 → 進化)と、ヌシ戦(合わせなしで体力制から始まる特別な戦い)もここで進める。
// 画面に関係しない計算だけを置く(D-028)。時間は update に渡したぶんだけ進む。
// プレイヤーの操作がなければ、釣果は増えない(D-053)。

import {
  boostedDamage,
  consumeBoosts,
  critSeed,
  DEFAULT_CRIT_RULES,
  fightTimeLimit,
  hitDamage,
  HOOK_GRADES,
  hookTiming,
  isCritical,
  judgeHook,
  normalizeCombat,
} from "./combat.js";
import { DEFAULT_CONFIG } from "./config.js";
import { applyGear, copyGear, emptyGear } from "./gear.js";
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
});

/**
 * 「魚の系統」の乱数で、竿の段階 rodStage の 1 回の投げを決める(D-046・D-064)。
 * 引く順番は固定:待ち時間 → 魚 →(強い魚なら)ミニゲームの種。引く回数は Issue #6 から同じ。
 * ミニゲームの種から、最初の当たり範囲と「ミニゲームの系統」の乱数を作る。
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

/** 装備を反映した戦闘の数値の表を作り直す(装着・外す・分解のあとに呼ぶ:D-145)。 */
export function refreshCombat(game) {
  const { config } = game;
  game.combat = normalizeCombat(
    applyGear(game.baseCombat, game.progress.gear, game.content.equipKinds),
    config.combat,
    config.combatLimits,
  );
  return game.combat;
}

/**
 * 新しいゲームの状態を作る。
 * - progress:保存から読んだ進み具合(なければ初めから)。複製して使う(呼んだ側のものは変えない)。
 * - combat:戦闘の数値の表(なければ config.combat の基本の表)。点検して丸めてから使う(D-080)。
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
    // 装備なしの表。装備を反映した表(combat)は、ここから refreshCombat で作る。
    baseCombat: combat,
    combat: null,
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
      return game.cast.waitMs;
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
  const reward = caught ? fish.reward : NO_REWARD;
  const firstCatch = caught && !game.progress.seen.includes(fish.id);
  const result = { fishId: fish.id, kind, outcome, reason, reward, firstCatch, hook: game.hookGrade ?? null };
  if (game.fight) {
    result.hits = game.fight.hits;
    result.misses = game.fight.misses;
    result.crits = game.fight.crits;
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

function startFight(game, grade) {
  const { minigame, zone, minigameSeed } = game.cast;
  game.fight = {
    // 戦闘中の一時的な上乗せ(D-089)。ジャストなら、最初の当たりのダメージを上げる。
    boosts:
      grade === HOOK_GRADES.JUST
        ? [{ id: "just", damageMultiplier: game.combat.hook.justMultiplier, uses: 1 }]
        : [],
    hp: minigame.hp,
    maxHp: minigame.hp,
    timeLimitMs: fightTimeLimit(minigame.timeLimitMs, game.combat, game.config.combatLimits),
    zone,
    // 「ミニゲームの系統」の乱数。魚の系統とは別なので、ここで何回引いても魚の並びは変わらない(D-064)。
    rng: createRng(minigameSeed),
    // クリティカル専用の小さな系統。当たりのたびに必ず 1 回引く(D-079)。
    critRng: createRng(critSeed(minigameSeed)),
    hits: 0,
    misses: 0,
    crits: 0,
  };
  enter(game, PHASES.MINIGAME);
}

function fightTap(game) {
  const { fight, config, combat } = game;
  const position = currentMarker(game);
  if (isHit(position, fight.zone)) {
    const roll = fight.critRng();
    const critical = isCritical({ roll, stats: combat, position, zone: fight.zone }, game.critRules);
    const boosted = fight.boosts.length > 0;
    const damage = boostedDamage(hitDamage(combat, critical), fight.boosts);
    fight.boosts = consumeBoosts(fight.boosts);
    // 残りの体力より大きいダメージは、超過を切り捨てる(体力は 0 より下にしない)。
    fight.hp = Math.max(0, fight.hp - damage);
    fight.hits += 1;
    if (critical) fight.crits += 1;
    const base = { action: "hit", damage, critical, boosted, hp: fight.hp, maxHp: fight.maxHp, position };
    if (fight.hp === 0) {
      finish(game, OUTCOMES.CAUGHT, REASONS.HP_ZERO);
      return { ...base, caught: true };
    }
    // 当たったら、当たり範囲の位置が変わる。
    fight.zone = drawZone(fight.rng, {
      zoneWidth: game.cast.minigame.zoneWidth,
      zoneMargin: config.minigame.zoneMargin,
    });
    return { ...base, caught: false };
  }
  // 外したら回復する。最大の体力はこえない。
  const before = fight.hp;
  fight.hp = Math.min(fight.maxHp, fight.hp + combat.missHeal);
  fight.misses += 1;
  // ルアー:外したあと、次の当たり 1 回のダメージを足す。外し続けても積み上げない(D-145)。
  if (combat.missBonusDamage > 0 && !fight.boosts.some((b) => b.id === "lure")) {
    fight.boosts.push({ id: "lure", damageBonus: combat.missBonusDamage, uses: 1 });
  }
  return { action: "miss", heal: fight.hp - before, hp: fight.hp, maxHp: fight.maxHp, position };
}

/**
 * タップしたときの処理。場面ごとに意味がちがう。
 * - 掛かった:合わせ。輪が成功帯より前なら早すぎで逃げる。成功帯なら、弱い魚は巻き上げへ、
 *   強い魚は体力制のミニゲームへ(ジャストなら最初の一撃が上がる)。
 * - ミニゲーム:印が当たり範囲の中なら体力が減り、外なら回復する。
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
      if (game.cast.kind !== FISH_KINDS.WEAK) startFight(game, grade);
      else enter(game, PHASES.REELING);
      return { action: "hook", grade };
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
  return evolveRod(game.progress, game.content);
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
