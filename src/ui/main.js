// 画面の入り口:ゲームの状態を時間で進め、絵と数を描き、タップとボタンを受け取る。
// 保存の読み書きもここ(画面の側)で行う。セーブコードと「データを消す」はメニューの設定タブ(settings.js)。

import { DEFAULT_CONTENT, fishById, scaleName } from "../core/fish.js";
import {
  canChallengeBoss,
  canCraftRod,
  canEvolveRod,
  challengeBoss,
  craftGameRod,
  createGame,
  currentMarker,
  fightSweepMs,
  refreshCombat,
  FISH_KINDS,
  currentHookTiming,
  OUTCOMES,
  PHASES,
  phaseDuration,
  REASONS,
  evolveGameRod,
  gameStage,
} from "../core/fishing.js";
import { nextNeed, ROD_STEPS, rodName, stageRodNames } from "../core/rod.js";
import { DEFAULT_CONFIG } from "../core/config.js";
import { normalizeSeed } from "../core/rng.js";
import { setUseBait } from "../core/bait.js";
import { baitHud, refundMessage } from "./bait_view.js";
import { COLOR_FADE_MS, mixColors, oldAreaNotes, sceneColors, stageLabel, unlockMessage } from "./area_view.js";
import { currentArea } from "../core/areas.js";
import { formatCount } from "./format.js";
import { createScreenShell } from "./screen_shell.js";
import { initialNav, isPaused, screensFor, setDrawer, showScreen } from "./screens.js";
import { act, advanceTo, createSession, setOffset, setPaused, tapAt, viewLeadMs } from "./session.js";
import { clampTiming, createRecent, loadTiming, perfText, saveTiming, timingKeyFor } from "./timing.js";
import { markerPosition } from "../core/minigame.js";
import { encodeSaveCode, parseSave } from "../core/savecode.js";
import { syntheticContent } from "../core/synthetic.js";
import { versionLabel } from "../version.js";
import { DEBUG_READ_CONFIG } from "./debug_view.js";
import { makeSaveCode } from "./save_sign.js";
import { equipViewKeyFor, loadPrefs, savePrefs } from "./equip_prefs.js";
import { clearText, loadText as loadKey, OLD_DATA_MESSAGE, OLD_SAVE_KEYS, saveText, shouldShowOldDataNotice, storeKeyFor } from "./save_store.js";
import { openSheet } from "./sheet.js";
import { readUrlOptions } from "./url_params.js";
import { createDrawer } from "./drawer.js";
import { defenseBadge, fightBadges, gaugeBands } from "./fight_view.js";
import { playPull } from "./gacha_fx.js";
import { glovePullView, retryLabel } from "./glove_view.js";
import { drawScene } from "./draw.js";
import { createPlayLogRecorder, loadPlayLog, PLAY_LOG_KEY, playLogKeyFor } from "./play_log_view.js";
import {
  addGrazeEffects,
  addHitEffects,
  addHookEffects,
  addMissEffects,
  addNoteEffects,
  addResultEffects,
  addRodEffects,
  createEffects,
  drawEffects,
  shakeOffset,
} from "./effects.js";

// URL の指定(確認用の仕組み:D-215)。読むのは url_params.js だけ。?debug がなければ、どれも本番に効かない。
const URL_OPTIONS = readUrlOptions(location.search);
// 保存場所:?debug のときは、デバッグ専用の場所を使う。本番の保存データは読みも書きもしない(D-214)。
const STORE_KEY = storeKeyFor(URL_OPTIONS);
// 装備の画面の並べ替えと絞り込みの保存場所(D-304)。
const EQUIP_VIEW_STORE = equipViewKeyFor(URL_OPTIONS);
// 魚の表:?debug&stages=n のときだけ、大きな確かめ用の表(D-233)。ふだんは港の表。
const CONTENT = URL_OPTIONS.stages === null ? DEFAULT_CONTENT : syntheticContent(URL_OPTIONS.stages);
// デバッグのデータは、スキルのレベルをそのスキルの最大まで許して読む(本番の点検は変えない:D-219)。
const READ_CONFIG = URL_OPTIONS.debug ? /** @type {any} */ (DEBUG_READ_CONFIG) : DEFAULT_CONFIG;

// 1 回の描画で進める時間の上限。裏に回って戻ったときに、一気に何匹も進まないようにする。
const MAX_STEP_MS = 100;
// 知らせを出しておく時間(払い戻し 4 秒、釣り場の解放 3 秒:D-263・D-273)。
const NOTICE_MS = 4000;
const UNLOCK_NOTICE_MS = 3000;

/** シードの指定がないときに使う、毎回ちがうシード。計算本体では Math.random を使わない(D-021)。 */
function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

/**
 * ガチャの乱数の種を決める(D-148)。URL に ?debug&seed= があればそれ(確認用:D-215)、なければ毎回ちがう数。
 * 計算本体では Math.random を使わない(D-021)ので、画面の側で決める。
 */
function newGachaSeed() {
  if (URL_OPTIONS.seed !== null) return normalizeSeed(URL_OPTIONS.seed);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/** 魚の並びのシード。?debug&seed= があればそれ(確認用:D-215)、なければ毎回ちがう数。 */
function readSeed() {
  return URL_OPTIONS.seed ?? randomSeed();
}

/**
 * 確認用:`?debug&crit=100` のように付けたときだけ、クリティカルの確率(%)を変える(D-092)。
 * `?debug` がないときは、いつも基本の表を使う。
 */
function readDebugCombat() {
  if (URL_OPTIONS.crit === null) return DEFAULT_CONFIG.combat;
  return { ...DEFAULT_CONFIG.combat, critChance: URL_OPTIONS.crit / 100 };
}

// 保存の読み書き(save_store.js)。保存の中身はセーブコードと同じ文字列(版 1:D-232)。
// ブラウザの設定で使えないときも、エラーで止めずに遊べるようにする(D-050)。
/** 保存する。できたら true(保存できなくても遊びは続ける)。 */
function saveProgress(progress) {
  saveCount += 1;
  return saveText(STORE_KEY, encodeSaveCode(progress, CONTENT));
}

// 保存した回数(?debug の確かめ用)。
let saveCount = 0;
// タイミング補正の保存場所(本番とデバッグで別。ゲームの保存データとは別:D-285)。
const TIMING_KEY = timingKeyFor(URL_OPTIONS);

/**
 * 合わせと戦闘の間(輪が出てから結果まで)は、保存と重い更新を後回しにする場面(D-284)。
 * @param {string} phase
 */
function isBusyPhase(phase) {
  return phase === PHASES.BITE || phase === PHASES.REELING || phase === PHASES.MINIGAME;
}

/** ブラウザの保存場所(使えないときは null)。 */
function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clearSave() {
  clearText(STORE_KEY);
}

function messageFor(game) {
  switch (game.phase) {
    case PHASES.WAITING:
      return "待っています…";
    case PHASES.BITE:
      if (game.cast.crate) return "クレート!";
      return game.cast.kind === FISH_KINDS.STRONG ? "強い魚だ!" : "掛かった!";
    case PHASES.MINIGAME:
      return game.cast.kind === FISH_KINDS.BOSS ? `${game.cast.fish.name}との勝負!` : "";
    case PHASES.RESULT: {
      const r = game.lastResult;
      // 釣れるクレート(D-333):成功でグローブ、失敗で逃げられた。
      if (r.crate) return r.outcome === OUTCOMES.CAUGHT ? "グローブを手に入れた!" : `${r.reason === REASONS.EARLY ? "早すぎ…" : "遅すぎ…"}クレートに逃げられた`;
      if (r.reason === REASONS.EARLY) return "早すぎ…";
      if (r.reason === REASONS.LATE) return "遅すぎ…";
      const name = fishById(r.fishId, game.content).name;
      if (r.outcome === OUTCOMES.ESCAPED) return `${name}に逃げられた…`;
      return r.kind === FISH_KINDS.WEAK ? `${name}が釣れた` : `${name}を釣り上げた!`;
    }
    case PHASES.RESTING:
      return "タップで再開";
    default:
      return "";
  }
}

/**
 * 下のボタンの中身(D-118)。工程で 1 つのボタンが切り替わる。
 * { label, enabled, run } を返す。run は押したときの処理で、できたら演出の文字を返す。
 */
function rodButton(game) {
  const p = game.progress;
  const stage = gameStage(game);
  // 最後の段階のヌシを倒して進化したあとは、次の釣り場はまだない(D-277)。
  if (!stage || p.rodStep === ROD_STEPS.EVOLVED) return { label: "次の釣り場はまだない", enabled: false };
  // 古い釣り場では、製作・ヌシ戦・進化はできない(押せない見た目と短い表示:D-274)。
  const old = oldAreaNotes(game);
  if (old) return { label: old.rod, enabled: false };
  const names = stageRodNames(stage, game.content);
  if (p.rodStep === ROD_STEPS.NONE) {
    const need = nextNeed(p, game.content);
    if (!canCraftRod(game)) {
      return { label: `${names.craft}を製作 ${formatCount(need.have)}/${formatCount(need.need)}`, enabled: false };
    }
    return { label: `${names.craft}を製作`, enabled: true, run: () => craftGameRod(game) && `${names.craft}ができた!` };
  }
  if (p.rodStep === ROD_STEPS.CRAFTED) {
    const boss = fishById(stage.boss, game.content);
    return { label: `${boss.name}に挑む`, enabled: canChallengeBoss(game), run: () => challengeBoss(game) && null };
  }
  return { label: `${names.evolve}に進化`, enabled: canEvolveRod(game), evolve: true, run: () => evolveGameRod(game) && `${names.evolve}に進化!` };
}

/** 上の表示:今の工程で要る鱗(「クロダイの鱗 2/3」)。要るものがなければ空。 */
function needLabel(game) {
  const need = nextNeed(game.progress, game.content);
  if (!need) return "";
  return `${scaleName(need.id, game.content)} ${formatCount(need.have)}/${formatCount(need.need)}`;
}

function main() {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const el = {
    coins: document.getElementById("coins"),
    need: document.getElementById("need"),
    rodName: document.getElementById("rod-name"),
    message: document.getElementById("message"),
    upgrade: document.getElementById("upgrade"),
    hud: document.getElementById("hud"),
    menu: document.getElementById("menu-toggle"),
    seed: document.getElementById("seed"),
    areaName: document.getElementById("area-name"),
    baitToggle: document.getElementById("bait-toggle"),
    baitCount: document.getElementById("bait-count"),
    baitState: document.getElementById("bait-state"),
    notice: document.getElementById("notice"),
    version: document.getElementById("version"),
  };

  // 古い版(互換性を切る前)のデータだけがあるときは、1 回だけ案内する(古いデータは消さない:D-223)。
  const oldKey = URL_OPTIONS.debug ? OLD_SAVE_KEYS.debug : OLD_SAVE_KEYS.main;
  const showOldNotice = URL_OPTIONS.stages === null && shouldShowOldDataNotice(localStorage, STORE_KEY, oldKey);
  const progress = parseSave(loadKey(STORE_KEY), CONTENT, READ_CONFIG);
  // ガチャの種がまだなければ(初めて遊ぶ・データを消した・前の版から読んだ)、ここで決めて保存する(D-141・D-148)。
  if (progress.gear.seed === null) {
    progress.gear.seed = newGachaSeed();
    saveProgress(progress);
  }
  const game = createGame(readSeed(), { progress, combat: readDebugCombat(), content: CONTENT });
  const effects = createEffects();
  // 時間とタップは、この窓口を通して渡す。メニューを開いている間は止まる(D-134)。
  const session = createSession(game, { maxStepMs: MAX_STEP_MS });
  setOffset(session, loadTiming(localStorage, TIMING_KEY));

  /** @type {HTMLElement | null} */
  let perfBox = null;
  let perfVisible = true;

  // 遊びの記録(D-348):ゲームの保存データとは別の場所(本番とデバッグで別)。結果の場面で足し、戦闘の間は書かない。
  const playLog = createPlayLogRecorder(safeStorage(), playLogKeyFor(URL_OPTIONS));
  // 保存は後回しにできる(D-284)。合わせと戦闘の間は印だけ付け、場面が終わったら保存する。
  let saveDirty = false;
  const requestSave = () => {
    saveDirty = true;
    if (!isBusyPhase(game.phase)) flushSave();
  };
  const flushSave = (force = false) => {
    playLog.flush(force);
    if (!saveDirty) return;
    saveDirty = false;
    saveProgress(game.progress);
  };
  // ページを離れる・隠れるときは、場面によらず、すぐ保存する。
  window.addEventListener("pagehide", () => flushSave(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave(true);
  });
  el.seed.textContent = `seed ${game.seed}`;
  el.version.textContent = versionLabel();

  // 絵の大きさ(描画のたびに測り直さない:測ると、ページの配置の計算が走って重くなる)。
  let sceneSize = { width: 0, height: 0 };
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    sceneSize = { width: rect.width, height: rect.height };
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener("resize", resize);
  // 絵の領域の大きさが変わったら(画面の回転のほか、上下の欄の高さが変わったときも)、絵の画素の大きさを合わせる。
  // 合わせないと、同じ画素数の絵が引きのばされて、縦横比が崩れて見える(D-271 の原因)。
  if (typeof ResizeObserver === "function") new ResizeObserver(() => resize()).observe(canvas);
  resize();

  // 合わせと命中のタップ(D-284):指が触れた瞬間のイベント(pointerdown)の時刻で判定する。
  // ハンドラが遅れて呼ばれても、判定は押した時刻のまま。演出は判定したときに出す。
  const delays = createRecent(20);
  const frameGaps = createRecent(120);
  const showTapEffects = (result) => {
    const now = performance.now();
    if (result?.action === "hook") addHookEffects(effects, result.grade, now, result.strike ?? null);
    else if (result?.action === "hit") addHitEffects(effects, result, now);
    else if (result?.action === "miss") addMissEffects(effects, result, now);
    else if (result?.action === "graze") addGrazeEffects(effects, result, now);
  };
  session.onTap = showTapEffects;
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const handled = performance.now();
    // 入力の遅れ:押した瞬間のイベントの時刻と、ここが呼ばれた時刻の差(?debug の表示用)。
    delays.push(Math.max(0, handled - event.timeStamp));
    showTapEffects(tapAt(session, event.timeStamp, handled));
  });
  // 長押しのメニュー(画像の保存など)を出さない。
  document.getElementById("stage").addEventListener("contextmenu", (event) => event.preventDefault());

  // 知らせ(払い戻しなど)を数秒だけ出す。
  let noticeUntil = 0;
  function showNotice(text, ms = NOTICE_MS) {
    setText(el.notice, text);
    noticeUntil = performance.now() + ms;
  }

  el.upgrade.addEventListener("click", () => {
    const button = rodButton(game);
    if (!button.enabled) return;
    const text = act(session, () => button.run());
    if (text === false) return;
    requestSave();
    if (text) addRodEffects(effects, text, performance.now());
    // 進化で段階が進んだら、残りの餌の払い戻しと、釣り場の解放を知らせる(D-263・D-273)。
    const notices = button.evolve ? [unlockMessage(game.areaUnlocked), refundMessage(game.baitRefund)].filter(Boolean) : [];
    if (notices.length > 0) showNotice(notices.join("\n"), game.areaUnlocked && !game.baitRefund ? UNLOCK_NOTICE_MS : NOTICE_MS);
  });

  // 餌のボタン(D-271):押すと、使う/使わないが切り替わる。次の投げから効く。古い釣り場では押せない。
  el.baitToggle.addEventListener("click", () => {
    if (oldAreaNotes(game)) return;
    setUseBait(game.progress, !game.progress.useBait);
    requestSave();
  });

  // 釣り場の色(D-278):移ったら 0.5 秒で切り替える。
  let colorFrom = sceneColors(game);
  let colorTo = colorFrom;
  let colorStart = 0;

  // 目次(ドロワー)と全画面(D-152・D-153)。どちらかが開いている間は、釣りを止める(D-134)。
  const app = document.getElementById("app");
  const screens = screensFor(URL_OPTIONS.debug);
  // ?debug のときは、いつも見える「DEBUG」の印を出す(D-214)。
  if (URL_OPTIONS.debug) {
    const badge = document.createElement("div");
    badge.id = "debug-badge";
    badge.textContent = "DEBUG";
    document.body.append(badge);
  }
  let nav = initialNav();
  const applyNav = (next) => {
    nav = next;
    setPaused(session, isPaused(nav));
  };
  const shell = createScreenShell({
    app,
    screens,
    ctx: {
      game,
      app,
      // ?debug か(スキル画面の「全スキルを見る」、装備画面の並べ替えの保存場所:D-299・D-304)。
      debug: URL_OPTIONS.debug,
      storage: { save: saveProgress, clear: clearSave },
      // セーブコードの書き出しと読み込み(表と点検の数値は、遊んでいる表のもの)。
      // 書き出すのは署名つき(TSURI5:D-291)。?debug のときはデバッグ用の鍵(D-293)。
      saveCode: makeSaveCode({ debug: URL_OPTIONS.debug }, CONTENT, READ_CONFIG),
      reload: () => location.reload(),
      // 装着・外す・分解のあと:装備を反映した戦闘の数値の表を作り直して保存する(D-181)。
      onGearChanged: () => {
        refreshCombat(game);
        saveProgress(game.progress);
      },
      // デバッグの「すぐ戦う」で合わせたときの演出(ジャストの初撃も:D-256)。
      showHook: (hook) => addHookEffects(effects, hook.grade, performance.now(), hook.strike ?? null),
      // タイミング補正(D-285)。端末ごとの設定で、ゲームの保存データには入れない。
      // 装備の画面の並べ替えと絞り込み(D-304)。ゲームの保存データとは別の場所(本番とデバッグで別)。
      equipView: {
        get: () => loadPrefs(localStorage, EQUIP_VIEW_STORE, game.content.equipKinds),
        set: (/** @type {import("./equip_prefs.js").EquipPrefs} */ prefs) => savePrefs(localStorage, EQUIP_VIEW_STORE, prefs),
      },
      timing: {
        get: () => clampTiming(session.offsetMs),
        set: (v) => {
          const n = saveTiming(localStorage, TIMING_KEY, v);
          setOffset(session, n);
          return n;
        },
      },
      // 遊びの記録(D-348)。デバッグ画面で、本番(読むだけ)とデバッグの記録を並べる。
      playLog: {
        main: () => loadPlayLog(safeStorage(), PLAY_LOG_KEY),
        debug: () => playLog.log(),
        resetDebug: () => playLog.reset(),
        version: versionLabel(),
      },
      // 確かめ用の表示(?debug のときだけ:D-286)。
      perf: {
        visible: () => perfVisible,
        setVisible: (on) => {
          perfVisible = Boolean(on);
          if (perfBox) perfBox.hidden = !perfVisible;
        },
      },
    },
    onChange: (screen) => applyNav(showScreen(nav, screen)),
  });
  createDrawer({
    app,
    toggle: el.menu,
    hud: el.hud,
    screens,
    badgeFor: (id) => screens.find((s) => s.id === id)?.badge?.(game) ?? null,
    onSelect: (id, replace) => shell.navigate(id, { replace }),
    onOpenChange: (open) => applyNav(setDrawer(nav, open)),
  });
  // ?debug を付けたときだけ、ブラウザの自動操作の確認用に状態を見せる(読むだけ。結果には関係しない)。
  // 古い版のデータの案内(1 回だけ。閉じるまで釣りを止める:D-223)。
  if (showOldNotice) {
    setPaused(session, true);
    openSheet(app, (panel, close) => {
      panel.classList.add("old-data-notice");
      const text = document.createElement("p");
      text.className = "old-data-text";
      text.textContent = OLD_DATA_MESSAGE;
      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "primary-button old-data-ok";
      ok.textContent = "はじめる";
      ok.addEventListener("click", () => {
        close();
        setPaused(session, isPaused(nav));
      });
      panel.append(text, ok);
    });
  }
  if (URL_OPTIONS.debug) {
    window.fishDebug = game;
    window.fishSession = session;
    window.fishNav = () => nav;
    window.fishSaveCount = () => saveCount;
    window.fishPlayLogWrites = () => playLog.writes();
  }

  // 確かめ用の表示(?debug のときだけ):入力の遅れとフレーム間隔(D-286)。デバッグ画面で出す・消すを切り替える。
  if (URL_OPTIONS.debug) {
    perfBox = document.createElement("div");
    perfBox.id = "perf";
    perfBox.setAttribute("aria-hidden", "true");
    document.getElementById("stage").append(perfBox);
  }

  // 文字は、変わったときだけ書き換える(毎回書き換えると、ページの配置の計算が走って重くなる)。
  /** @type {Map<HTMLElement, string>} */
  const shown = new Map();
  const setText = (node, text) => {
    if (shown.get(node) === text) return;
    shown.set(node, text);
    node.textContent = text;
  };

  let shownResults = 0;
  let shownRetries = 0;
  let lastFrame = 0;
  // 釣れるクレートの開封の演出(D-333)。出している間は釣りを止め、閉じたら戻す。
  const openGlove = (glove) => {
    setPaused(session, true);
    playPull(app, glovePullView(game, glove), "釣れるクレート", () => setPaused(session, isPaused(nav)));
  };
  let wasBusy = false;
  /** 上の欄に出している釣り場(移ったらすぐ書き換える:D-358)。 @type {string | null} */
  let shownAreaId = null;
  function frame(now) {
    // メニューを開いている間は時間を渡さない。閉じたら、その時点から続きを進める(D-134・D-284)。
    const clockBefore = session.clockMs;
    // 遊んだ時間(D-356):釣りと戦闘が進んだ分だけ(止めている間・裏に回っている間は進まない。1 回の上限は maxStepMs)。
    if (advanceTo(session, now) && clockBefore !== null) playLog.addTime(Math.min(session.maxStepMs, now - clockBefore));
    if (lastFrame) frameGaps.push(now - lastFrame);
    lastFrame = now;

    // 新しい結果が出たら、演出を足し、保存を頼む(合わせと戦闘の間は、場面が終わってから保存する)。
    while (shownResults < game.results.length) {
      const result = game.results[shownResults];
      if (result.crate) {
        if (result.glove) openGlove(result.glove);
        else addResultEffects(effects, result, now, game.content);
      } else {
        addResultEffects(effects, result, now, game.content);
      }
      playLog.add(game, result);
      shownResults += 1;
      saveDirty = true;
    }
    // 仕切り直しを使ったら、短く知らせる(D-334)。
    if ((game.retryUsed ?? 0) !== shownRetries) {
      shownRetries = game.retryUsed ?? 0;
      addNoteEffects(effects, "仕切り直し!", now);
    }
    // ガチャを引いた回数(D-356)。引くのは全画面の中なので、書くのは合わせと戦闘の間でないとき。
    playLog.observe(game);
    if (saveDirty && !isBusyPhase(game.phase)) flushSave();
    else if (playLog.dirty() && !isBusyPhase(game.phase)) playLog.flush();

    const target = sceneColors(game);
    if (target.sky !== colorTo.sky) {
      colorFrom = mixColors(colorFrom, colorTo, (now - colorStart) / COLOR_FADE_MS);
      colorTo = target;
      colorStart = now;
    }
    const rect = sceneSize;
    // 補正が − のときは、縮む輪と動く印を、その分だけ先の位置で描く(判定は押した時刻のまま:D-285)。
    const lead = viewLeadMs(session);
    const viewMs = game.phaseMs + (game.phase === PHASES.BITE || game.phase === PHASES.MINIGAME ? lead : 0);
    const view = {
      colors: mixColors(colorFrom, colorTo, (now - colorStart) / COLOR_FADE_MS),
      phase: game.phase,
      progress: game.phase === PHASES.RESTING ? 0 : Math.min(1, viewMs / phaseDuration(game)),
      fish: game.phase === PHASES.RESULT && game.lastResult.fishId ? fishById(game.lastResult.fishId, game.content) : game.cast.fish,
      crate: Boolean(game.cast.crate),
      retry: retryLabel(game),
      zone: game.fight?.zone ?? game.cast.zone,
      marker: game.phase === PHASES.MINIGAME ? markerPosition(viewMs, fightSweepMs(game)) : currentMarker(game),
      hp: game.fight?.hp ?? 0,
      maxHp: game.fight?.maxHp ?? 0,
      timeLeft: game.phase === PHASES.MINIGAME ? Math.max(0, 1 - viewMs / phaseDuration(game)) : 0,
      hook: game.phase === PHASES.BITE ? { t: Math.min(viewMs, phaseDuration(game)), timing: currentHookTiming(game), gold: Boolean(game.cast.crate) } : null,
      caught: game.lastResult?.outcome === OUTCOMES.CAUGHT,
      badges: game.phase === PHASES.MINIGAME ? fightBadges(game) : null,
      bands: game.phase === PHASES.MINIGAME ? gaugeBands(game) : null,
      defense: game.phase === PHASES.MINIGAME ? defenseBadge(game) : null,
    };
    ctx.save();
    ctx.translate(shakeOffset(effects, now), 0);
    drawScene(ctx, rect.width, rect.height, view, now);
    ctx.restore();
    drawEffects(ctx, rect.width, rect.height, effects, now);

    setText(el.coins, formatCount(game.progress.coins));
    if (shell.current() !== null) shell.setCoins(`ウロコイン ${formatCount(game.progress.coins)}`);
    setText(el.message, messageFor(game));
    // 竿・釣り場・餌・竿のボタンの欄は、合わせと戦闘の間は変わらないので、書き換えない(D-284)。
    // 場面に入った・出たときだけ 1 回書き換える(挑むボタンを押せない見た目にするなど)。
    const busy = isBusyPhase(game.phase);
    // 釣り場を移ったときは、場面の間でも 1 回だけ書き換える(移るのは目次や全画面で止めている間:D-358)。
    const areaId = currentArea(game.progress, game.content).id;
    if (!busy || busy !== wasBusy || areaId !== shownAreaId) {
      shownAreaId = areaId;
      setText(el.need, needLabel(game));
      setText(el.areaName, currentArea(game.progress, game.content).name);
      setText(el.rodName, `${rodName(game.progress, game.content)}(${stageLabel(game.content, game.progress.rodStage)})`);
      const bait = baitHud(game, oldAreaNotes(game)?.name ?? null);
      if (el.baitToggle.hidden !== (bait === null)) el.baitToggle.hidden = bait === null;
      if (bait) {
        setText(el.baitCount, bait.countText);
        setText(el.baitState, bait.stateText);
        if (el.baitToggle.disabled !== bait.disabled) el.baitToggle.disabled = bait.disabled;
        const pressed = String(bait.on && !bait.disabled);
        if (el.baitToggle.getAttribute("aria-pressed") !== pressed) el.baitToggle.setAttribute("aria-pressed", pressed);
      }
      const button = rodButton(game);
      setText(el.upgrade, button.label);
      if (el.upgrade.disabled !== !button.enabled) el.upgrade.disabled = !button.enabled;
    }
    wasBusy = busy;
    if (noticeUntil && now > noticeUntil) {
      setText(el.notice, "");
      noticeUntil = 0;
    }
    if (perfBox && perfVisible) setText(perfBox, perfText(delays.values, frameGaps.values));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
