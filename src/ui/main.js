// 画面の入り口:ゲームの状態を時間で進め、絵と数を描き、タップとボタンを受け取る。
// 保存の読み書きもここ(画面の側)で行う。セーブコードと「データを消す」はメニューの設定タブ(settings.js)。

import { fishById, scaleName } from "../core/fish.js";
import {
  canChallengeBoss,
  canCraftRod,
  canEvolveRod,
  challengeBoss,
  craftGameRod,
  createGame,
  currentMarker,
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
import { formatCount } from "./format.js";
import { createScreenShell } from "./screen_shell.js";
import { initialNav, isPaused, SCREENS, setDrawer, showScreen } from "./screens.js";
import { act, advance, createSession, setPaused, tapSession } from "./session.js";
import { parseSave, SAVE_KEY, toSaveData } from "../core/save.js";
import { versionLabel } from "../version.js";
import { createDrawer } from "./drawer.js";
import { drawScene } from "./draw.js";
import {
  addHitEffects,
  addHookEffects,
  addMissEffects,
  addResultEffects,
  addRodEffects,
  createEffects,
  drawEffects,
  shakeOffset,
} from "./effects.js";

// 1 回の描画で進める時間の上限。裏に回って戻ったときに、一気に何匹も進まないようにする。
const MAX_STEP_MS = 100;

/** シードの指定がないときに使う、毎回ちがうシード。計算本体では Math.random を使わない(D-021)。 */
function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

/**
 * ガチャの乱数の種を決める(D-148)。URL に ?seed= があればそれ(確認用)、なければ毎回ちがう数。
 * 計算本体では Math.random を使わない(D-021)ので、画面の側で決める。
 */
function newGachaSeed() {
  const value = new URLSearchParams(location.search).get("seed");
  if (value !== null && value !== "") return normalizeSeed(value);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

function readSeed() {
  const value = new URLSearchParams(location.search).get("seed");
  return value === null || value === "" ? randomSeed() : value;
}

/**
 * 確認用:`?debug&crit=100` のように付けたときだけ、クリティカルの確率(%)を変える(D-092)。
 * `?debug` がないときは、いつも基本の表を使う。
 */
function readDebugCombat() {
  const params = new URLSearchParams(location.search);
  const crit = params.get("crit");
  if (!params.has("debug") || crit === null || crit === "") return DEFAULT_CONFIG.combat;
  return { ...DEFAULT_CONFIG.combat, critChance: Number(crit) / 100 };
}

// 保存の読み書き。ブラウザの設定で使えないときも、エラーで止めずに遊べるようにする(D-050)。
function loadText() {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

/** 保存する。できたら true(保存できなくても遊びは続ける)。 */
function saveProgress(progress) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSaveData(progress)));
    return true;
  } catch {
    return false;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 消せなくても続ける。
  }
}

function messageFor(game) {
  switch (game.phase) {
    case PHASES.WAITING:
      return "待っています…";
    case PHASES.BITE:
      return game.cast.kind === FISH_KINDS.STRONG ? "強い魚だ!" : "掛かった!";
    case PHASES.MINIGAME:
      return game.cast.kind === FISH_KINDS.BOSS ? `${game.cast.fish.name}との勝負!` : "";
    case PHASES.RESULT: {
      const r = game.lastResult;
      if (r.reason === REASONS.EARLY) return "早すぎ…";
      if (r.reason === REASONS.LATE) return "遅すぎ…";
      const name = fishById(r.fishId).name;
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
  if (!stage || p.rodStep === ROD_STEPS.EVOLVED) return { label: "次の魚はまだいない", enabled: false };
  const names = stageRodNames(stage);
  if (p.rodStep === ROD_STEPS.NONE) {
    const need = nextNeed(p);
    if (!canCraftRod(game)) {
      return { label: `${names.craft}を製作 ${formatCount(need.have)}/${formatCount(need.need)}`, enabled: false };
    }
    return { label: `${names.craft}を製作`, enabled: true, run: () => craftGameRod(game) && `${names.craft}ができた!` };
  }
  if (p.rodStep === ROD_STEPS.CRAFTED) {
    const boss = fishById(stage.boss);
    return { label: `${boss.name}に挑む`, enabled: canChallengeBoss(game), run: () => challengeBoss(game) && null };
  }
  return { label: `${names.evolve}に進化`, enabled: canEvolveRod(game), run: () => evolveGameRod(game) && `${names.evolve}に進化!` };
}

/** 上の表示:今の工程で要る鱗(「クロダイの鱗 2/3」)。要るものがなければ空。 */
function needLabel(game) {
  const need = nextNeed(game.progress);
  if (!need) return "";
  return `${scaleName(need.id)} ${formatCount(need.have)}/${formatCount(need.need)}`;
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
    version: document.getElementById("version"),
  };

  const progress = parseSave(loadText());
  // ガチャの種がまだなければ(初めて遊ぶ・データを消した・前の版から読んだ)、ここで決めて保存する(D-141・D-148)。
  if (progress.gear.seed === null) {
    progress.gear.seed = newGachaSeed();
    saveProgress(progress);
  }
  const game = createGame(readSeed(), { progress, combat: readDebugCombat() });
  const effects = createEffects();
  // 時間とタップは、この窓口を通して渡す。メニューを開いている間は止まる(D-134)。
  const session = createSession(game, { maxStepMs: MAX_STEP_MS });
  el.seed.textContent = `seed ${game.seed}`;
  el.version.textContent = versionLabel();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const result = tapSession(session);
    const now = performance.now();
    if (result?.action === "hook") addHookEffects(effects, result.grade, now);
    else if (result?.action === "hit") addHitEffects(effects, result, now);
    else if (result?.action === "miss") addMissEffects(effects, result, now);
  });

  el.upgrade.addEventListener("click", () => {
    const button = rodButton(game);
    if (!button.enabled) return;
    const text = act(session, () => button.run());
    if (text === false) return;
    saveProgress(game.progress);
    if (text) addRodEffects(effects, text, performance.now());
  });

  // 目次(ドロワー)と全画面(D-152・D-153)。どちらかが開いている間は、釣りを止める(D-134)。
  const app = document.getElementById("app");
  let nav = initialNav();
  const applyNav = (next) => {
    nav = next;
    setPaused(session, isPaused(nav));
  };
  const shell = createScreenShell({
    app,
    screens: SCREENS,
    ctx: {
      game,
      app,
      storage: { save: saveProgress, clear: clearSave },
      reload: () => location.reload(),
      // 装着・外す・分解のあと:装備を反映した戦闘の数値の表を作り直して保存する(D-145)。
      onGearChanged: () => {
        refreshCombat(game);
        saveProgress(game.progress);
      },
    },
    onChange: (screen) => applyNav(showScreen(nav, screen)),
  });
  createDrawer({
    app,
    toggle: el.menu,
    hud: el.hud,
    screens: SCREENS,
    onSelect: (id, replace) => shell.navigate(id, { replace }),
    onOpenChange: (open) => applyNav(setDrawer(nav, open)),
  });
  // ?debug を付けたときだけ、ブラウザの自動操作の確認用に状態を見せる(読むだけ。結果には関係しない)。
  if (new URLSearchParams(location.search).has("debug")) {
    window.fishDebug = game;
    window.fishSession = session;
    window.fishNav = () => nav;
  }

  let shownResults = 0;
  let last = performance.now();
  function frame(now) {
    // メニューを開いている間は時間を渡さない。閉じたら、その時点から続きを進める。
    advance(session, now - last);
    last = now;

    // 新しい結果が出たら、保存して演出を足す。
    while (shownResults < game.results.length) {
      addResultEffects(effects, game.results[shownResults], now);
      shownResults += 1;
      saveProgress(game.progress);
    }

    const rect = canvas.getBoundingClientRect();
    const view = {
      phase: game.phase,
      progress: game.phase === PHASES.RESTING ? 0 : Math.min(1, game.phaseMs / phaseDuration(game)),
      fish: game.phase === PHASES.RESULT ? fishById(game.lastResult.fishId) : game.cast.fish,
      zone: game.fight?.zone ?? game.cast.zone,
      marker: currentMarker(game),
      hp: game.fight?.hp ?? 0,
      maxHp: game.fight?.maxHp ?? 0,
      timeLeft: game.phase === PHASES.MINIGAME ? 1 - game.phaseMs / phaseDuration(game) : 0,
      hook: game.phase === PHASES.BITE ? { t: game.phaseMs, timing: currentHookTiming(game) } : null,
      caught: game.lastResult?.outcome === OUTCOMES.CAUGHT,
    };
    ctx.save();
    ctx.translate(shakeOffset(effects, now), 0);
    drawScene(ctx, rect.width, rect.height, view, now);
    ctx.restore();
    drawEffects(ctx, rect.width, rect.height, effects, now);

    el.coins.textContent = formatCount(game.progress.coins);
    if (shell.current() !== null) shell.setCoins(`ウロコイン ${formatCount(game.progress.coins)}`);
    el.need.textContent = needLabel(game);
    el.rodName.textContent = rodName(game.progress);
    el.message.textContent = messageFor(game);
    const button = rodButton(game);
    el.upgrade.textContent = button.label;
    el.upgrade.disabled = !button.enabled;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
