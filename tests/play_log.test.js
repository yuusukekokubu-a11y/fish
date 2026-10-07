// 遊びの記録(D-348・D-350):戦闘が終わったときに 1 件。合わせの通算。200 件まで。壊れていても空から。
// 集計(ミス率・勝率・区分と位置 s ごとの表・直近 20 戦・合わせの割合)とコピーの文章。
// 保存場所はゲームの保存データと別(本番とデバッグで別のキー)。戦闘の間は書かない。
import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame, currentMarker, PHASES, tap, update } from "../src/core/fishing.js";
import { isHit } from "../src/core/minigame.js";
import {
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
    v: 1,
    fights: [e("strong", 1, true, 8, 0, 2), e("boss", 5, false, 10, 2, 8), e("strong", 1, false, 2, 0, 2), e("boss", 5, true, 12, 0, 0), e("boss", 2, true, 6, 0, 2)],
    hooks: { just: 3, good: 5, fail: 2 },
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
