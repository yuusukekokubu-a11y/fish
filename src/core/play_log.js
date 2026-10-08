// @ts-check
// 遊びの記録(D-348・D-350)。実際の遊びの、命中・かすり・ミスの割合を測るための記録。
// - 戦闘(強い魚・ヌシ)が終わったときに 1 件。合わせの結果(ジャスト・成功・失敗)は、魚 1 匹ごとに通算の数だけ。
// - ゲームの保存データとセーブコードには入れない。ブラウザの保存場所への読み書きは画面の役目(play_log_store.js)。
//   ここは、記録の形・1 件の作り方・足し方・読み直し(壊れていたら空)・集計・コピー用の文章だけを持つ。
// - ゲームの結果は変えない(結果を読むだけ。乱数を引かない)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { areaPosition } from "./areas.js";
import { effectiveDefense, effectiveStats } from "./combat.js";
import { FISH_KINDS } from "./fish.js";
import { RARITY_ROWS } from "./gear.js";
import { equippedGlove, GLOVE_RARITY_ROWS } from "./glove.js";
import { gloveBag } from "./glove_play.js";

/** 記録の形の版(形を変えたら上げる。版がちがう記録は、空から始める)。 */
export const PLAY_LOG_VERSION = 3;
/** 読める古い形の版(足りない欄は 0 から:D-356・D-368)。 */
const READABLE_VERSIONS = Object.freeze([1, 2, 3]);
/** 1 回に数える、ガチャを引いた回数の上限(10 連。読み込みなどで回数が飛んだときは数えない)。 */
const MAX_PULLS_AT_ONCE = 10;
/** 戦闘の記録を残す数(新しいほうから)。 */
export const PLAY_LOG_MAX = 200;
/** 一覧に出す直近の戦闘の数。 */
export const PLAY_LOG_RECENT = 20;

/**
 * 戦闘 1 回の記録。
 * @typedef {object} FightEntry
 * @property {number} g 竿の通し番号
 * @property {string} fish 魚の id
 * @property {"strong" | "boss"} kind 区分
 * @property {number} s 魚の、釣り場の中の位置(1〜5)
 * @property {boolean} won 釣り上げたか(逃げられたら false)
 * @property {number} hits 命中の数
 * @property {number} grazes かすりの数
 * @property {number} misses ミスの数(保険で無効にしたミスは入れない)
 * @property {number} insured 保険で無効にしたミスの数
 * @property {number} maxCombo 連撃の最大段数
 * @property {number} ms 戦闘にかかった時間(ミリ秒)
 * @property {number} defense 実効防御(戦闘の始まりの、条件発動型を入れない値。小数 3 けた)
 * @property {string} glove 装着中のグローブの能力の id(なければ空)
 */

/**
 * 遊びの記録。
 * @typedef {object} PlayLog
 * @property {number} v 形の版
 * @property {FightEntry[]} fights 戦闘の記録(古い順。最大 PLAY_LOG_MAX 件)
 * @property {{ just: number, good: number, fail: number }} hooks 合わせの結果の通算
 * @property {PlayTotals} totals 通算(形の版 2 で足した:D-356)
 * @property {Record<string, number>} gear ガチャで引いた装備の、レア度ごとの個数の通算(キーは装備のレア度の表の id。形の版 3:D-368)
 * @property {GloveTotals} gloves 釣れるクレートの通算(形の版 3:D-368)
 */

/**
 * 釣れるクレートの通算(D-368)。
 * @typedef {object} GloveTotals
 * @property {number} catches 釣れた回数(合わせが成功してグローブを手に入れた回数)
 * @property {number} escapes 逃した回数(合わせの失敗)
 * @property {Record<string, number>} rarity 釣れたグローブの、レア度ごとの個数(キーはグローブのレア度の表の id)
 */

/**
 * 通算(D-356)。
 * @typedef {object} PlayTotals
 * @property {number} pulls ガチャを引いた回数(1 回引き・10 連とも 1 個ずつ。10 連は 10)
 * @property {number} playMs 遊んだ時間(釣りと戦闘が進んでいる時間。メニュー・全画面・画面が隠れている時間は除く)
 * @property {number} coins 稼いだウロコイン(釣った魚の報酬。分解で戻る分は除く)
 * @property {number} scales 稼いだ鱗
 */

/** レア度ごとの個数(全部 0。表の順)。 @param {readonly { id: string }[]} rows @param {any} [from] 読み直すときの元(形のちがう欄は 0) */
function rarityCounts(rows, from) {
  return Object.fromEntries(rows.map((r) => [r.id, count(from?.[r.id]) ? from[r.id] : 0]));
}

/** 空の記録。 @returns {PlayLog} */
export function emptyPlayLog() {
  return {
    v: PLAY_LOG_VERSION,
    fights: [],
    hooks: { just: 0, good: 0, fail: 0 },
    totals: { pulls: 0, playMs: 0, coins: 0, scales: 0 },
    gear: rarityCounts(RARITY_ROWS),
    gloves: { catches: 0, escapes: 0, rarity: rarityCounts(GLOVE_RARITY_ROWS) },
  };
}

/** 0 以上の整数か。 @param {unknown} n */
function count(n) {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

/** 1 件の形を確かめる。 @param {any} e @returns {e is FightEntry} */
function isEntry(e) {
  return (
    !!e &&
    typeof e === "object" &&
    count(e.g) &&
    typeof e.fish === "string" &&
    (e.kind === FISH_KINDS.STRONG || e.kind === FISH_KINDS.BOSS) &&
    count(e.s) &&
    typeof e.won === "boolean" &&
    count(e.hits) &&
    count(e.grazes) &&
    count(e.misses) &&
    count(e.insured) &&
    count(e.maxCombo) &&
    count(e.ms) &&
    typeof e.defense === "number" &&
    Number.isFinite(e.defense) &&
    typeof e.glove === "string"
  );
}

/**
 * 保存した文字を記録に読み直す。なければ・壊れていれば・版がちがえば、空から始める(エラーにしない)。
 * 形のちがう 1 件は捨てる(ほかの件は残す)。
 * @param {string | null} text @returns {PlayLog}
 */
export function parsePlayLog(text) {
  if (typeof text !== "string" || text === "") return emptyPlayLog();
  try {
    const data = JSON.parse(text);
    if (!data || !READABLE_VERSIONS.includes(data.v) || !Array.isArray(data.fights)) return emptyPlayLog();
    const h = data.hooks ?? {};
    // 版 1 には通算の欄がない。版 1・2 にはレア度ごとの個数の欄がない。足りない欄・形のちがう欄は 0 から(D-356・D-368)。
    const t = data.totals ?? {};
    const gl = data.gloves ?? {};
    const n = (/** @type {unknown} */ x) => (count(x) ? /** @type {number} */ (x) : 0);
    return {
      v: PLAY_LOG_VERSION,
      fights: data.fights.filter(isEntry).slice(-PLAY_LOG_MAX),
      hooks: { just: n(h.just), good: n(h.good), fail: n(h.fail) },
      totals: { pulls: n(t.pulls), playMs: n(t.playMs), coins: n(t.coins), scales: n(t.scales) },
      gear: rarityCounts(RARITY_ROWS, data.gear),
      gloves: { catches: n(gl.catches), escapes: n(gl.escapes), rarity: rarityCounts(GLOVE_RARITY_ROWS, gl.rarity) },
    };
  } catch {
    return emptyPlayLog();
  }
}

/** 保存する文字。 @param {PlayLog} log */
export function stringifyPlayLog(log) {
  return JSON.stringify(log);
}

/**
 * 戦闘の結果 1 件から、記録 1 件を作る。戦闘でない結果(弱い魚・クレート・合わせの失敗・初撃だけで釣れた)は null。
 * 戦闘が終わった直後(結果の場面)に呼ぶ。
 * @param {any} game @param {any} result
 * @returns {FightEntry | null}
 */
export function fightEntry(game, result) {
  if (!result || result.crate || result.fightMs === undefined) return null;
  if (result.kind !== FISH_KINDS.STRONG && result.kind !== FISH_KINDS.BOSS) return null;
  const fish = game.content.byId.get(result.fishId);
  if (!fish) return null;
  const stats = effectiveStats(game.combat, game.config.formula ?? null);
  const defense = effectiveDefense(fish.minigame?.defense ?? 0, stats.penetration ?? 0);
  const glove = equippedGlove(gloveBag(game.progress) ?? undefined);
  return {
    g: game.progress.rodStage,
    fish: fish.id,
    kind: result.kind,
    s: areaPosition(game.content, fish.stage),
    won: result.outcome === "caught",
    hits: result.hits ?? 0,
    grazes: result.grazes ?? 0,
    misses: result.misses ?? 0,
    insured: result.insured ?? 0,
    maxCombo: result.maxCombo ?? 0,
    ms: Math.max(0, Math.round(result.fightMs)),
    defense: Math.round(defense * 1000) / 1000,
    glove: glove?.ability ?? "",
  };
}

/**
 * 合わせの結果の分け方。ヌシ戦(合わせがない)とクレートは null。
 * 早すぎ・遅すぎは失敗、ジャストはジャスト、それ以外(自動合わせを含む)は成功。
 * @param {any} result @returns {"just" | "good" | "fail" | null}
 */
export function hookKind(result) {
  if (!result || result.crate || result.kind === FISH_KINDS.BOSS) return null;
  if (result.reason === "early" || result.reason === "late") return "fail";
  return result.hook === "just" ? "just" : "good";
}

/**
 * 結果 1 件を記録に足す。何か足したら true(保存が要る)。
 * @param {PlayLog} log @param {any} game @param {any} result
 */
export function addToPlayLog(log, game, result) {
  let changed = false;
  // 稼いだウロコインと鱗(釣った魚の報酬だけ:D-356)。安全な整数の範囲で止める。
  const reward = result?.reward;
  if (reward && (reward.coins > 0 || reward.scales > 0)) {
    log.totals.coins = Math.min(Number.MAX_SAFE_INTEGER, log.totals.coins + (reward.coins ?? 0));
    log.totals.scales = Math.min(Number.MAX_SAFE_INTEGER, log.totals.scales + (reward.scales ?? 0));
    changed = true;
  }
  // 釣れるクレート(D-368):釣れた回数・逃した回数と、釣れたグローブのレア度。
  if (result?.crate) {
    if (result.outcome === "caught") log.gloves.catches += 1;
    else log.gloves.escapes += 1;
    const rarity = result.glove?.rarity;
    if (typeof rarity === "string" && rarity in log.gloves.rarity) log.gloves.rarity[rarity] += 1;
    changed = true;
  }
  const hook = hookKind(result);
  if (hook) {
    log.hooks[hook] += 1;
    changed = true;
  }
  const entry = fightEntry(game, result);
  if (entry) {
    log.fights.push(entry);
    if (log.fights.length > PLAY_LOG_MAX) log.fights.splice(0, log.fights.length - PLAY_LOG_MAX);
    changed = true;
  }
  return changed;
}

/**
 * ガチャを引いた回数を足す(引いた回数の通算の増え方から)。1〜10 のときだけ数える(読み込みなどで飛んだ分は数えない)。足したら true。
 * @param {PlayLog} log @param {number} delta
 */
export function addPulls(log, delta) {
  if (!Number.isSafeInteger(delta) || delta < 1 || delta > MAX_PULLS_AT_ONCE) return false;
  log.totals.pulls += delta;
  return true;
}

/**
 * ガチャで引いた装備のレア度を数える(引いた直後に画面の役目で呼ぶ:D-368)。表にないレア度は数えない。数えたら true。
 * @param {PlayLog} log @param {readonly { rarity: string }[]} items
 */
export function addPulledItems(log, items) {
  let changed = false;
  for (const it of items) {
    if (typeof it?.rarity === "string" && it.rarity in log.gear) {
      log.gear[it.rarity] += 1;
      changed = true;
    }
  }
  return changed;
}

/**
 * 遊んだ時間を足す(ミリ秒。釣りと戦闘が進んだ分だけ。画面の役目で呼ぶ)。
 * @param {PlayLog} log @param {number} ms
 */
export function addPlayTime(log, ms) {
  if (!(ms > 0) || !Number.isFinite(ms)) return;
  log.totals.playMs = Math.min(Number.MAX_SAFE_INTEGER, Math.round(log.totals.playMs + ms));
}

/** 割合(分母 0 なら null)。 @param {number} a @param {number} b */
const rate = (a, b) => (b > 0 ? a / b : null);

/**
 * 記録の集計。
 * - ミス率 = ミス ÷(命中 + かすり + ミス)。勝率 = 釣り上げ ÷ 挑戦。
 * - 区分と位置 s ごとの表(強い魚 → ヌシ、s の順)。直近の戦闘(新しい順)。合わせの割合。
 * @param {PlayLog} log
 */
export function summarizePlayLog(log) {
  const sum = (/** @type {(e: FightEntry) => number} */ f) => log.fights.reduce((n, e) => n + f(e), 0);
  const hits = sum((e) => e.hits);
  const grazes = sum((e) => e.grazes);
  const misses = sum((e) => e.misses);
  const insured = sum((e) => e.insured);
  const wins = sum((e) => (e.won ? 1 : 0));
  /** @type {Map<string, { kind: string, s: number, fights: number, wins: number, hits: number, grazes: number, misses: number }>} */
  const groups = new Map();
  for (const e of log.fights) {
    const key = `${e.kind}-${e.s}`;
    const row = groups.get(key) ?? { kind: e.kind, s: e.s, fights: 0, wins: 0, hits: 0, grazes: 0, misses: 0 };
    row.fights += 1;
    row.wins += e.won ? 1 : 0;
    row.hits += e.hits;
    row.grazes += e.grazes;
    row.misses += e.misses;
    groups.set(key, row);
  }
  const kindOrder = (/** @type {string} */ k) => (k === FISH_KINDS.STRONG ? 0 : 1);
  const table = [...groups.values()]
    .sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.s - b.s)
    .map((r) => ({ kind: r.kind, s: r.s, fights: r.fights, wins: r.wins, missRate: rate(r.misses, r.hits + r.grazes + r.misses) }));
  const hookTotal = log.hooks.just + log.hooks.good + log.hooks.fail;
  const t = log.totals;
  // 1 時間あたりの個数(遊んだ時間が 0 なら null:D-368)。
  const hours = t.playMs / 3600000;
  const perHour = (/** @type {number} */ n) => (hours > 0 ? n / hours : null);
  const gearTotal = RARITY_ROWS.reduce((a, r) => a + log.gear[r.id], 0);
  const epicUp = log.gear.epic + log.gear.legend;
  const gloveTotal = GLOVE_RARITY_ROWS.reduce((a, r) => a + log.gloves.rarity[r.id], 0);
  return {
    // レア度ごとの個数(D-368):装備(割合・1 時間あたり)、エピック以上とレジェンドの 1 時間あたり、グローブ。
    gear: {
      total: gearTotal,
      perHour: perHour(gearTotal),
      rows: RARITY_ROWS.map((r) => ({ id: r.id, name: r.name, count: log.gear[r.id], share: rate(log.gear[r.id], gearTotal), perHour: perHour(log.gear[r.id]) })),
      epicUp,
      epicUpPerHour: perHour(epicUp),
      legendPerHour: perHour(log.gear.legend),
    },
    gloves: {
      catches: log.gloves.catches,
      escapes: log.gloves.escapes,
      total: gloveTotal,
      rows: GLOVE_RARITY_ROWS.map((r) => ({ id: r.id, name: r.name, count: log.gloves.rarity[r.id], share: rate(log.gloves.rarity[r.id], gloveTotal) })),
    },
    // 通算(D-356):平均のガチャの間隔(遊んだ時間 ÷ 引いた回数。秒)、ウロコインを稼いだ速さ(1 分あたり)。
    pulls: t.pulls,
    playSec: t.playMs / 1000,
    coins: t.coins,
    scales: t.scales,
    pullGapSec: t.pulls > 0 ? t.playMs / 1000 / t.pulls : null,
    coinsPerMin: t.playMs > 0 ? t.coins / (t.playMs / 60000) : null,
    fights: log.fights.length,
    wins,
    winRate: rate(wins, log.fights.length),
    hits,
    grazes,
    misses,
    insured,
    missRate: rate(misses, hits + grazes + misses),
    table,
    recent: log.fights.slice(-PLAY_LOG_RECENT).reverse(),
    hooks: {
      total: hookTotal,
      just: rate(log.hooks.just, hookTotal),
      good: rate(log.hooks.good, hookTotal),
      fail: rate(log.hooks.fail, hookTotal),
    },
  };
}

/** 割合の文字(「12.5%」。分母 0 は「-」)。 @param {number | null} r */
export function percentText(r) {
  return r === null ? "-" : `${(Math.round(r * 1000) / 10).toFixed(1)}%`;
}

/** 分の文字(「12.5 分」)。 @param {number} sec */
export function minutesText(sec) {
  return `${(Math.round((sec / 60) * 10) / 10).toFixed(1)} 分`;
}

/** 秒の文字(「18.5 秒」。null は「-」)。 @param {number | null} sec */
export function secondsText(sec) {
  return sec === null ? "-" : `${(Math.round(sec * 10) / 10).toFixed(1)} 秒`;
}

/** 速さの文字(整数に丸める。null は「-」)。 @param {number | null} v */
export function rateText(v) {
  return v === null ? "-" : String(Math.round(v));
}

/** 1 時間あたりの個数の文字(小数 1 けた。null は「-」)。 @param {number | null} v */
export function perHourText(v) {
  return v === null ? "-" : (Math.round(v * 10) / 10).toFixed(1);
}

/** 区分の短い名前。 @param {string} kind */
export function kindLabel(kind) {
  return kind === FISH_KINDS.BOSS ? "ヌシ" : "強い";
}

/**
 * コピー用の文章(数字だけの短い表。個人を特定する情報やセーブコードは入れない)。
 * 欄はタブではなく半角スペースで区切る(貼ったときに崩れにくく、表計算にも分けて貼れる)。
 * @param {ReturnType<typeof summarizePlayLog>} sum @param {string} title 例:「本番の遊び」 @param {string} version 例:「v0.28.0」
 */
export function playLogText(sum, title, version) {
  const lines = [
    `遊びの記録 ${title} ${version}`,
    `戦闘 ${sum.fights} 勝ち ${sum.wins} 勝率 ${percentText(sum.winRate)}`,
    `命中 ${sum.hits} かすり ${sum.grazes} ミス ${sum.misses} 保険 ${sum.insured} ミス率 ${percentText(sum.missRate)}`,
    `合わせ ${sum.hooks.total} ジャスト ${percentText(sum.hooks.just)} 成功 ${percentText(sum.hooks.good)} 失敗 ${percentText(sum.hooks.fail)}`,
    `遊んだ時間 ${minutesText(sum.playSec)} ガチャ ${sum.pulls} 回 平均の間隔 ${secondsText(sum.pullGapSec)}`,
    `ウロコイン ${sum.coins} 1 分あたり ${rateText(sum.coinsPerMin)} 鱗 ${sum.scales}`,
    // レア度ごとの個数(D-368)。
    `装備 ${sum.gear.total} ${sum.gear.rows.map((r) => `${r.name} ${r.count} ${percentText(r.share)}`).join(" ")}`,
    `1 時間あたり 装備 ${perHourText(sum.gear.perHour)} エピック以上 ${perHourText(sum.gear.epicUpPerHour)} レジェンド ${perHourText(sum.gear.legendPerHour)}`,
    `グローブ 釣れた ${sum.gloves.catches} 逃した ${sum.gloves.escapes} ${sum.gloves.rows.map((r) => `${r.name} ${r.count}`).join(" ")}`,
    "",
    "区分 s 挑戦 勝ち ミス率",
    ...sum.table.map((r) => `${kindLabel(r.kind)} ${r.s} ${r.fights} ${r.wins} ${percentText(r.missRate)}`),
    "",
    `直近 ${sum.recent.length} 戦(新しい順)`,
    "g 区分 s 結果 命中 かすり ミス 保険 連撃 秒 防御 グローブ",
    ...sum.recent.map((e) =>
      [e.g, kindLabel(e.kind), e.s, e.won ? "勝" : "逃", e.hits, e.grazes, e.misses, e.insured, e.maxCombo, (e.ms / 1000).toFixed(1), percentText(e.defense), e.glove || "-"].join(" "),
    ),
  ];
  return lines.join("\n");
}
