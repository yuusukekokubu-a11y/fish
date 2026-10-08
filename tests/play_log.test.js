// 遊びの記録(D-348・D-350):戦闘が終わったときに 1 件。合わせの通算。200 件まで。壊れていても空から。
// 集計(ミス率・勝率・区分と位置 s ごとの表・直近 20 戦・合わせの割合)とコピーの文章。
// 保存場所はゲームの保存データと別(本番とデバッグで別のキー)。戦闘の間は書かない。
import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame, currentMarker, PHASES, tap, update } from "../src/core/fishing.js";
import { isHit } from "../src/core/minigame.js";
import {
  addPlayTime,
  addPulledItems,
  addPulls,
  addToPlayLog,
  emptyPlayLog,
  fightEntry,
  hookKind,
  parsePlayLog,
  PLAY_LOG_MAX,
  playLogText,
  stringifyPlayLog,
  summarizePlayLog,
} from "../src/core/play_log.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { encodeSaveCode } from "../src/core/savecode.js";
import { startQuickFight } from "../src/ui/debug_view.js";
import { createPlayLogRecorder, DEBUG_PLAY_LOG_KEY, PLAY_LOG_KEY, playLogKeyFor, playLogRows } from "../src/ui/play_log_view.js";
import { DEBUG_SAVE_KEY, SAVE_KEY } from "../src/ui/save_store.js";
import { progressAt } from "./helpers.js";

/** 印が命中範囲に入る(または外に出る)まで、少しずつ進める。 */
function stepUntil(game, inside) {
  for (let i = 0; i < 2000; i++) {
    if (game.phase !== PHASES.MINIGAME) return false;
    if (isHit(currentMarker(game), game.fight.zone) === inside) return true;
    update(game, 5);
  }
  return false;
}

/** 強い魚(ブリ)と戦い、命中 hits 回・ミス misses 回(交互ではなく、ミスを先に)のあと、時間切れまで待つか釣り上げる。 */
function playFight(fishId, { misses = 0, hitsUntilEnd = true } = {}) {
  const game = createGame(3, { progress: progressAt(5, ROD_STEPS.CRAFTED) });
  assert.equal(startQuickFight(game, fishId, "good").ok, true);
  for (let i = 0; i < misses; i++) {
    assert.ok(stepUntil(game, false));
    tap(game);
  }
  if (hitsUntilEnd) {
    while (game.phase === PHASES.MINIGAME) {
      if (!stepUntil(game, true)) break;
      tap(game);
    }
  } else {
    update(game, game.fight.timeLimitMs + 10);
  }
  return game;
}

test("戦闘の結果 1 件から、記録 1 件ができる(命中・ミス・連撃の最大・時間・実効防御・グローブ)", () => {
  const game = playFight("buri", { misses: 2 });
  const result = game.lastResult;
  assert.equal(result.outcome, "caught");
  const e = fightEntry(game, result);
  assert.ok(e);
  assert.deepEqual([e.g, e.fish, e.kind, e.s, e.won, e.grazes, e.insured, e.glove], [5, "buri", "strong", 5, true, 0, 0, ""]);
  assert.equal(e.hits, result.hits);
  assert.equal(e.misses, 2);
  assert.equal(e.maxCombo, result.hits, "ミスのあとは命中だけなので、連撃の最大 = 命中の数");
  assert.ok(e.ms > 0 && e.ms <= game.cast.minigame.timeLimitMs, `時間 ${e.ms}`);
  assert.ok(e.defense >= 0 && e.defense === Math.round(e.defense * 1000) / 1000);
  // 逃げられた戦闘も 1 件(勝ちではない)。
  const lost = playFight("buri", { hitsUntilEnd: false });
  const l = fightEntry(lost, lost.lastResult);
  assert.deepEqual([l.won, l.hits, l.misses], [false, 0, 0]);
  assert.equal(l.ms, lost.cast.minigame.timeLimitMs, "時間切れは制限時間");
});

test("戦闘でない結果(弱い魚・合わせの失敗・クレート)は記録しない。合わせはヌシとクレート以外を数える", () => {
  const game = createGame(1, { progress: progressAt(1) });
  assert.equal(fightEntry(game, { kind: "weak", fishId: "aji", outcome: "caught", hook: "just" }), null);
  assert.equal(fightEntry(game, { kind: "strong", fishId: "kurodai", outcome: "escaped", reason: "late", hook: null }), null, "戦闘の前に逃げた");
  assert.equal(fightEntry(game, { crate: true, kind: "weak", fishId: null }), null);
  assert.equal(hookKind({ kind: "weak", hook: "just", reason: "caught" }), "just");
  assert.equal(hookKind({ kind: "strong", hook: "good", reason: "hp-zero" }), "good");
  assert.equal(hookKind({ kind: "weak", hook: "early", reason: "early" }), "fail");
  assert.equal(hookKind({ kind: "weak", hook: null, reason: "late" }), "fail");
  assert.equal(hookKind({ kind: "boss", hook: null, reason: "hp-zero" }), null, "ヌシ戦は合わせがない");
  assert.equal(hookKind({ crate: true, kind: "weak", hook: "just" }), null, "クレートは魚ではない");
});

test("記録は 200 件まで(古いものから消える)。合わせの通算は数だけ", () => {
  const game = playFight("buri");
  const log = emptyPlayLog();
  for (let i = 0; i < PLAY_LOG_MAX + 5; i++) {
    const result = { ...game.lastResult, hits: i };
    assert.equal(addToPlayLog(log, game, result), true);
  }
  assert.equal(log.fights.length, PLAY_LOG_MAX);
  assert.equal(log.fights[0].hits, 5, "古い 5 件が消える");
  assert.equal(log.fights.at(-1).hits, PLAY_LOG_MAX + 4);
  assert.deepEqual(log.hooks, { just: 0, good: PLAY_LOG_MAX + 5, fail: 0 });
});

test("壊れた・版のちがう記録はエラーにならず空から。形のちがう 1 件だけ捨てる。往復で元に戻る", () => {
  for (const text of [null, "", "{", "[]", "null", '{"v":2,"fights":[],"hooks":{}}', '{"v":1,"fights":"x"}']) {
    assert.deepEqual(parsePlayLog(text), emptyPlayLog(), String(text));
  }
  const good = { g: 7, fish: "ishidai", kind: "boss", s: 2, won: true, hits: 9, grazes: 0, misses: 1, insured: 0, maxCombo: 6, ms: 9000, defense: 0.5, glove: "" };
  const log = parsePlayLog(JSON.stringify({ v: 1, fights: [good, { ...good, hits: -1 }, { ...good, kind: "weak" }, "x"], hooks: { just: 2, good: "a", fail: 1 } }));
  assert.deepEqual(log.fights, [good]);
  assert.deepEqual(log.hooks, { just: 2, good: 0, fail: 1 });
  assert.deepEqual(parsePlayLog(stringifyPlayLog(log)), log);
});

/** 集計の確かめ用の記録。 */
function sampleLog() {
  const e = (kind, s, won, hits, grazes, misses, g = 10) => ({ g, fish: "x", kind, s, won, hits, grazes, misses, insured: 0, maxCombo: hits, ms: 8000, defense: 0.25, glove: "" });
  return {
    ...emptyPlayLog(),
    v: 1,
    fights: [e("strong", 1, true, 8, 0, 2), e("boss", 5, false, 10, 2, 8), e("strong", 1, false, 2, 0, 2), e("boss", 5, true, 12, 0, 0), e("boss", 2, true, 6, 0, 2)],
    hooks: { just: 3, good: 5, fail: 2 },
    totals: { pulls: 40, playMs: 740000, coins: 123456, scales: 30 },
  };
}

test("集計:ミス率・勝率・区分と位置 s ごとの表・直近の戦闘(新しい順)・合わせの割合が、記録どおり", () => {
  const sum = summarizePlayLog(sampleLog());
  assert.deepEqual([sum.fights, sum.wins, sum.hits, sum.grazes, sum.misses], [5, 3, 38, 2, 14]);
  assert.equal(sum.winRate, 3 / 5);
  assert.equal(sum.missRate, 14 / (38 + 2 + 14));
  assert.deepEqual(
    sum.table.map((r) => [r.kind, r.s, r.fights, r.wins, r.missRate]),
    [
      ["strong", 1, 2, 1, 4 / 14],
      ["boss", 2, 1, 1, 2 / 8],
      ["boss", 5, 2, 1, 8 / 32],
    ],
  );
  assert.deepEqual(sum.recent.map((e) => e.hits), [6, 12, 2, 10, 8], "新しい順");
  assert.deepEqual([sum.hooks.total, sum.hooks.just, sum.hooks.good, sum.hooks.fail], [10, 0.3, 0.5, 0.2]);
  // 空の記録は割合を「-」にする(0 で割らない)。
  const none = summarizePlayLog(emptyPlayLog());
  assert.deepEqual([none.winRate, none.missRate, none.hooks.just], [null, null, null]);
  // 直近は 20 戦まで。
  const many = { ...sampleLog(), fights: Array.from({ length: 30 }, (_, i) => ({ ...sampleLog().fights[0], hits: i })) };
  assert.equal(summarizePlayLog(many).recent.length, 20);
  assert.equal(summarizePlayLog(many).recent[0].hits, 29);
});

test("コピーの文章:数字だけの短い表。セーブコードや個人の情報を含まない", () => {
  const text = playLogText(summarizePlayLog(sampleLog()), "本番の遊び", "v0.28.0");
  const lines = text.split("\n");
  assert.equal(lines[0], "遊びの記録 本番の遊び v0.28.0");
  assert.equal(lines[1], "戦闘 5 勝ち 3 勝率 60.0%");
  assert.equal(lines[2], "命中 38 かすり 2 ミス 14 保険 0 ミス率 25.9%");
  assert.equal(lines[3], "合わせ 10 ジャスト 30.0% 成功 50.0% 失敗 20.0%");
  assert.equal(lines[4], "遊んだ時間 12.3 分 ガチャ 40 回 平均の間隔 18.5 秒");
  assert.equal(lines[5], "ウロコイン 123456 1 分あたり 10010 鱗 30");
  assert.ok(lines.includes("強い 1 2 1 28.6%"));
  assert.ok(lines.includes("ヌシ 5 2 1 25.0%"));
  assert.ok(lines.includes("10 ヌシ 2 勝 6 0 2 0 6 8.0 25.0% -"), "直近の 1 行目(新しい戦闘)");
  assert.doesNotMatch(text, /TSURI|seed|@/);
  // 画面の行も同じ集計から。
  const rows = playLogRows(sampleLog());
  assert.deepEqual(rows.totals.find(([k]) => k === "ミス率"), ["ミス率", "25.9%"]);
  assert.deepEqual(rows.table[0], ["強い", "1", "2", "1", "28.6%"]);
  assert.deepEqual(rows.recent[0], ["g10", "ヌシ", "s2", "勝", "6/0/2", "8.0秒"]);
});

/** 書き込みを数える、ブラウザの保存場所の代わり。 */
function fakeStore() {
  const data = new Map();
  const calls = [];
  return {
    data,
    calls,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => {
      calls.push(k);
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
}

test("保存場所:本番とデバッグで別のキー(ゲームの保存とも別)。足すだけでは書かず、書くのは flush の 1 回", () => {
  assert.equal(playLogKeyFor({ debug: false }), PLAY_LOG_KEY);
  assert.equal(playLogKeyFor({ debug: true }), DEBUG_PLAY_LOG_KEY);
  assert.equal(new Set([PLAY_LOG_KEY, DEBUG_PLAY_LOG_KEY, SAVE_KEY, DEBUG_SAVE_KEY]).size, 4);
  const store = fakeStore();
  const rec = createPlayLogRecorder(store, PLAY_LOG_KEY);
  // 戦闘の間:結果がまだないので、足すものも書くものもない。
  const game = createGame(3, { progress: progressAt(5, ROD_STEPS.CRAFTED) });
  startQuickFight(game, "buri", "good");
  for (let i = 0; i < 50 && game.phase === PHASES.MINIGAME; i++) {
    update(game, 50);
    tap(game);
    assert.equal(rec.flush(), false);
  }
  assert.equal(rec.writes(), 0, "戦闘の間の書き込みは 0 回");
  update(game, game.fight ? game.fight.timeLimitMs : 0);
  rec.add(game, game.lastResult);
  assert.deepEqual(store.calls, [], "足しただけでは書かない");
  assert.equal(rec.flush(), true);
  assert.deepEqual(store.calls, [PLAY_LOG_KEY]);
  assert.equal(rec.flush(), false, "足した分がなければ書かない");
  assert.equal(rec.writes(), 1);
  // 読み直すと同じ。デバッグのキーには何も書いていない。
  assert.equal(createPlayLogRecorder(store, PLAY_LOG_KEY).log().fights.length, 1);
  assert.equal(store.getItem(DEBUG_PLAY_LOG_KEY), null);
  // ゲームの保存データとセーブコードには入らない。
  assert.equal("playLog" in game.progress, false);
  assert.doesNotMatch(encodeSaveCode(game.progress), /hits|playlog/i);
  // リセットは空にする。壊れたデータでも、器は空から始まる。
  rec.reset();
  assert.equal(store.getItem(PLAY_LOG_KEY), null);
  store.data.set(DEBUG_PLAY_LOG_KEY, "{壊れた");
  assert.deepEqual(createPlayLogRecorder(store, DEBUG_PLAY_LOG_KEY).log(), emptyPlayLog());
  // 保存場所が使えないときも、止まらない。
  const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
  const r2 = createPlayLogRecorder(broken, PLAY_LOG_KEY);
  r2.add(game, game.lastResult);
  assert.equal(r2.flush(), false);
  r2.reset();
});

test("通算(形の版 2 から):ガチャを引いた回数・遊んだ時間・稼いだウロコインと鱗。版 1 の記録も読める(通算は 0 から)", () => {
  const log = emptyPlayLog();
  assert.equal(log.v, 3);
  assert.deepEqual(log.totals, { pulls: 0, playMs: 0, coins: 0, scales: 0 });
  // ガチャ:1 回引き・10 連は 1 個ずつ。11 以上・0 以下の飛び(読み込みなど)は数えない。
  assert.equal(addPulls(log, 1), true);
  assert.equal(addPulls(log, 10), true);
  assert.equal(addPulls(log, 11), false);
  assert.equal(addPulls(log, -5), false);
  assert.equal(log.totals.pulls, 11);
  // 遊んだ時間。
  addPlayTime(log, 16.7);
  addPlayTime(log, -3);
  addPlayTime(log, NaN);
  assert.equal(log.totals.playMs, 17);
  // 稼いだウロコインと鱗は、釣った魚の報酬だけ(逃げた魚は 0)。
  const game = playFight("buri");
  const r = game.lastResult;
  addToPlayLog(log, game, r);
  addToPlayLog(log, game, { kind: "weak", fishId: "aji", outcome: "caught", hook: "good", reward: { coins: 5, scales: 0 } });
  addToPlayLog(log, game, { kind: "weak", fishId: "aji", outcome: "escaped", reason: "late", hook: null, reward: { coins: 0, scales: 0 } });
  assert.deepEqual([log.totals.coins, log.totals.scales], [r.reward.coins + 5, r.reward.scales]);
  // 集計:平均の間隔(秒)と、1 分あたりのウロコイン。時間 0・回数 0 なら「-」。
  const sum = summarizePlayLog({ ...emptyPlayLog(), totals: { pulls: 4, playMs: 120000, coins: 600, scales: 2 } });
  assert.deepEqual([sum.pullGapSec, sum.coinsPerMin], [30, 300]);
  const none = summarizePlayLog(emptyPlayLog());
  assert.deepEqual([none.pullGapSec, none.coinsPerMin], [null, null]);
  // 版 1(通算の欄がない)は、戦闘と合わせを残して、通算を 0 から。形のちがう欄も 0。
  const old = parsePlayLog(JSON.stringify({ v: 1, fights: [], hooks: { just: 1, good: 2, fail: 3 } }));
  assert.deepEqual([old.v, old.hooks, old.totals], [3, { just: 1, good: 2, fail: 3 }, { pulls: 0, playMs: 0, coins: 0, scales: 0 }]);
  assert.deepEqual(parsePlayLog(JSON.stringify({ v: 2, fights: [], hooks: {}, totals: { pulls: "x", playMs: -1, coins: 5, scales: 1.5 } })).totals, { pulls: 0, playMs: 0, coins: 5, scales: 0 });
  assert.deepEqual(parsePlayLog(JSON.stringify({ v: 4, fights: [] })), emptyPlayLog(), "まだない版は空から");
  // 往復。
  assert.deepEqual(parsePlayLog(stringifyPlayLog(log)), log);
  // 画面の行。
  const rows = playLogRows({ ...emptyPlayLog(), totals: { pulls: 4, playMs: 120000, coins: 600, scales: 2 } });
  assert.deepEqual(rows.totals.filter(([k]) => ["遊んだ時間", "ガチャ", "ウロコイン", "鱗"].includes(k)), [["遊んだ時間", "2.0 分"], ["ガチャ", "4 回(平均の間隔 30.0 秒)"], ["ウロコイン", "600(1 分あたり 300)"], ["鱗", "2"]]);
});

test("記録の器:ガチャを引いた回数は、引いた回数の通算の増え方から数える。遊んだ時間だけでは書かず、ページを離れるときに書く", () => {
  const store = fakeStore();
  const rec = createPlayLogRecorder(store, PLAY_LOG_KEY);
  const game = createGame(1, { progress: progressAt(1, ROD_STEPS.NONE, { coins: 1000 }) });
  rec.observe(game); // 最初は数え始めの位置だけ。
  game.progress.gear.draws += 10;
  rec.observe(game);
  game.progress.gear.draws += 1;
  rec.observe(game);
  game.progress.gear.draws += 500; // 読み込みなどで飛んだ分は数えない。
  rec.observe(game);
  assert.equal(rec.log().totals.pulls, 11);
  assert.equal(rec.dirty(), true);
  assert.equal(rec.flush(), true);
  // 遊んだ時間だけ:ふつうは書かない。ページを離れるとき(force)は書く。
  rec.addTime(1000);
  assert.equal(rec.dirty(), false);
  assert.equal(rec.flush(), false);
  assert.equal(rec.flush(true), true);
  assert.equal(createPlayLogRecorder(store, PLAY_LOG_KEY).log().totals.playMs, 1000);
  assert.equal(rec.flush(true), false, "書いたあとは、増えるまで書かない");
});

test("レア度ごとの個数(形の版 3:D-368):ガチャの装備と釣れたグローブを通算で数え、割合と 1 時間あたりを出す。版 2 の記録も読める", () => {
  const log = emptyPlayLog();
  assert.deepEqual(log.gear, { normal: 0, rare: 0, epic: 0, legend: 0 });
  assert.deepEqual(log.gloves, { catches: 0, escapes: 0, rarity: { normal: 0, rare: 0, epic: 0, legend: 0 } });
  // ガチャ:引いた装備のレア度を数える(表にないレア度は数えない)。
  const items = [...Array(6).fill({ rarity: "normal" }), ...Array(2).fill({ rarity: "rare" }), { rarity: "epic" }, { rarity: "legend" }];
  assert.equal(addPulledItems(log, items), true);
  assert.equal(addPulledItems(log, [{ rarity: "mythic" }]), false);
  assert.deepEqual(log.gear, { normal: 6, rare: 2, epic: 1, legend: 1 });
  // 釣れるクレート:釣れた回数・逃した回数と、釣れたグローブのレア度。合わせの通算には入れない。
  const game = createGame(1, { progress: progressAt(1, ROD_STEPS.NONE) });
  assert.equal(addToPlayLog(log, game, { crate: true, kind: "weak", outcome: "caught", glove: { id: 1, ability: "retry", rarity: "epic", grade: 1 }, reward: { coins: 0, scales: 0 } }), true);
  addToPlayLog(log, game, { crate: true, kind: "weak", outcome: "escaped", reason: "late", glove: null, reward: { coins: 0, scales: 0 } });
  assert.deepEqual(log.gloves, { catches: 1, escapes: 1, rarity: { normal: 0, rare: 0, epic: 1, legend: 0 } });
  assert.deepEqual(log.hooks, { just: 0, good: 0, fail: 0 });
  // 集計:割合と 1 時間あたり(30 分遊んだ)。
  log.totals.playMs = 1800000;
  const sum = summarizePlayLog(log);
  assert.equal(sum.gear.total, 10);
  assert.deepEqual(sum.gear.rows.map((r) => [r.id, r.count, r.share, r.perHour]), [["normal", 6, 0.6, 12], ["rare", 2, 0.2, 4], ["epic", 1, 0.1, 2], ["legend", 1, 0.1, 2]]);
  assert.deepEqual([sum.gear.perHour, sum.gear.epicUp, sum.gear.epicUpPerHour, sum.gear.legendPerHour], [20, 2, 4, 2]);
  assert.deepEqual([sum.gloves.catches, sum.gloves.escapes, sum.gloves.total], [1, 1, 1]);
  // 遊んだ時間が 0 なら、1 時間あたりは「-」。
  assert.equal(summarizePlayLog({ ...log, totals: { ...log.totals, playMs: 0 } }).gear.legendPerHour, null);
  // コピーの文章と画面の行。
  const lines = playLogText(sum, "本番の遊び", "v0.31.0").split("\n");
  assert.ok(lines.includes("装備 10 ノーマル 6 60.0% レア 2 20.0% エピック 1 10.0% レジェンド 1 10.0%"));
  assert.ok(lines.includes("1 時間あたり 装備 20.0 エピック以上 4.0 レジェンド 2.0"));
  assert.ok(lines.includes("グローブ 釣れた 1 逃した 1 ノーマル 0 レア 0 エピック 1 レジェンド 0"));
  const rows = playLogRows(log);
  assert.deepEqual(rows.totals.find(([k]) => k === "・レジェンド"), ["・レジェンド", "1(10.0%・1 時間あたり 2.0)"]);
  assert.deepEqual(rows.totals.find(([k]) => k === "エピック以上"), ["エピック以上", "1 時間あたり 4.0(2 個)"]);
  assert.deepEqual(rows.totals.find(([k]) => k === "釣れるクレート"), ["釣れるクレート", "釣れた 1 回・逃した 1 回"]);
  // 往復。版 2(個数の欄がない)は 0 から。形のちがう欄も 0。
  assert.deepEqual(parsePlayLog(stringifyPlayLog(log)), log);
  const old = parsePlayLog(JSON.stringify({ v: 2, fights: [], hooks: { just: 1 }, totals: { pulls: 3 } }));
  assert.deepEqual([old.v, old.totals.pulls, old.gear, old.gloves], [3, 3, emptyPlayLog().gear, emptyPlayLog().gloves]);
  const bad = parsePlayLog(JSON.stringify({ v: 3, fights: [], hooks: {}, gear: { normal: -1, rare: "x", legend: 2 }, gloves: { catches: 1.5, rarity: "x" } }));
  assert.deepEqual([bad.gear, bad.gloves], [{ normal: 0, rare: 0, epic: 0, legend: 2 }, emptyPlayLog().gloves]);
});

test("記録の器:引いた装備のレア度は足すだけで書かない(書くのは flush)。ゲームの保存データとセーブコードに入らない", () => {
  const store = fakeStore();
  const rec = createPlayLogRecorder(store, PLAY_LOG_KEY);
  rec.pulled([{ rarity: "legend" }, { rarity: "normal" }]);
  assert.deepEqual(store.calls, []);
  assert.equal(rec.dirty(), true);
  assert.equal(rec.flush(), true);
  assert.deepEqual(createPlayLogRecorder(store, PLAY_LOG_KEY).log().gear, { normal: 1, rare: 0, epic: 0, legend: 1 });
  const game = createGame(1, { progress: progressAt(1, ROD_STEPS.NONE) });
  assert.doesNotMatch(JSON.stringify(game.progress), /legend\":1|gloves\":\{\"catches/);
  assert.doesNotMatch(encodeSaveCode(game.progress), /catches|epicUp/);
});
