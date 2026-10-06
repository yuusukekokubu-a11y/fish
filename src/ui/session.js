// @ts-check
// 釣りの進め方の小さな窓口(D-134)。画面は、時間とタップをここを通して計算本体に渡す。
// メニューを開いている間は「止めている」状態にし、経過時間もタップも計算本体に渡さない。
// 計算本体には止める仕組みを足さないので、開閉の有無で結果は変わらない。
//
// 時計(D-284):画面は、描画のたびの時刻(performance.now と同じ時計)を advanceTo に渡す。タップは tapAt に
// 「指が触れた瞬間のイベントの時刻」を渡す。判定に使う時刻 = 押した時刻 + タイミング補正(D-285)。
// - 窓口は、ゲームの時刻がどこまで進んだか(clockMs)を覚える。押した時刻まで進めてから判定するので、
//   ハンドラが遅れて呼ばれても、同じ押した時刻なら同じ判定になる。
// - 押した時刻が clockMs より前(処理が遅れて、描画が先に進んだ)なら、その分だけさかのぼって判定する(tap の backMs)。
// - 補正の意味:判定 = 押したときに見えていた輪・印の位置 + 補正。
//   - 補正が −(早める)のときは、画面が、縮む輪と動く印を補正の分だけ先の位置で描く(viewLeadMs)。判定は押した時刻のまま。
//     見えていた位置より補正の分だけ前の位置で判定することになる。
//   - 補正が +(遅らせる)のときは、タップを取っておき、ゲームの時刻が「押した時刻 + 補正」に届いたときに判定する。
// 計算本体は補正を知らない(判定の時刻が入力として渡る)。補正が 0 なら、前と同じ動き。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { tap, update } from "../core/fishing.js";

/**
 * 窓口。
 * @typedef {object} Session
 * @property {any} game
 * @property {number} maxStepMs 1 回に進める時間の上限(裏に回って戻ったときに、一気に何匹も進まないようにする)
 * @property {boolean} paused
 * @property {number | null} clockMs ゲームの時刻が進んだところ(描画の時計で)
 * @property {number} offsetMs タイミング補正(+ は押した時刻を遅らせる)
 * @property {number[]} queue 判定を待っているタップの、判定の時刻(補正が + のとき)
 * @property {((result: any) => void) | null} onTap 取っておいたタップを判定したときに呼ぶ(演出用)
 */

/**
 * game を進める窓口を作る。
 * @param {any} game @param {{ maxStepMs?: number }} [options] @returns {Session}
 */
export function createSession(game, { maxStepMs = 100 } = {}) {
  return { game, maxStepMs, paused: false, clockMs: null, offsetMs: 0, queue: [], onTap: null };
}

/** 止める・再開する。止めたら、判定を待っているタップは捨てる。 @param {Session} session @param {boolean} paused */
export function setPaused(session, paused) {
  session.paused = paused;
  if (paused) session.queue = [];
}

/** タイミング補正(ミリ秒。+ は押した時刻を遅らせる)を決める。 @param {Session} session @param {number} offsetMs */
export function setOffset(session, offsetMs) {
  session.offsetMs = Number.isFinite(offsetMs) ? offsetMs : 0;
}

/** 画面が、縮む輪と動く印を、どれだけ先の位置で描くか(補正が − のとき)。 @param {Session} session */
export function viewLeadMs(session) {
  return Math.max(0, -session.offsetMs);
}

/** 判定を、押した時刻からどれだけ遅らせるか(補正が + のとき)。 @param {Session} session */
function judgeDelayMs(session) {
  return Math.max(0, session.offsetMs);
}

/** 経過時間を渡す(前からの窓口。テストと、時計を使わないところ用)。止めている間は何もしない。進めたら true。 @param {Session} session @param {number} dtMs */
export function advance(session, dtMs) {
  if (session.paused) return false;
  update(session.game, Math.min(session.maxStepMs, Math.max(0, dtMs)));
  return true;
}

/** 釣りのタップ(いまのゲームの時刻で判定する。前からの窓口)。止めている間は数えない(null を返す)。 @param {Session} session */
export function tapSession(session) {
  if (session.paused) return null;
  return tap(session.game);
}

/** 竿のボタンなどの操作。止めている間は行わない。行ったら fn の返り値、行わなければ false。 @param {Session} session @param {(game: any) => any} fn */
export function act(session, fn) {
  if (session.paused) return false;
  return fn(session.game);
}

/**
 * ゲームの時刻 target でタップを判定する。clockMs より後なら進めてから、前ならさかのぼって。
 * @param {Session} session @param {number} target
 */
function tapAtGameTime(session, target) {
  if (session.clockMs === null) return tap(session.game);
  const diff = target - session.clockMs;
  if (diff > 0) {
    update(session.game, Math.min(session.maxStepMs, diff));
    session.clockMs = target;
    return tap(session.game);
  }
  return tap(session.game, -diff);
}

/**
 * 判定を待っているタップのうち、判定の時刻が limit までのものを判定する。判定した結果の一覧を返す。
 * @param {Session} session @param {number} limit
 */
function flushQueue(session, limit) {
  /** @type {any[]} */
  const results = [];
  while (session.queue.length > 0 && session.queue[0] <= limit) {
    const target = /** @type {number} */ (session.queue.shift());
    const r = tapAtGameTime(session, target);
    results.push(r);
    session.onTap?.(r);
  }
  return results;
}

/**
 * 描画の時刻 nowMs まで進める(D-284)。止めている間は、時計だけ進める。
 * 判定を待っているタップ(補正が +)は、その時刻に届いたところで判定する。進めたら true。
 * @param {Session} session @param {number} nowMs
 */
export function advanceTo(session, nowMs) {
  const limit = nowMs;
  if (session.clockMs === null || session.paused) {
    session.clockMs = session.clockMs === null ? limit : Math.max(session.clockMs, limit);
    return false;
  }
  flushQueue(session, limit);
  const dt = limit - session.clockMs;
  if (dt <= 0) return false;
  session.clockMs = limit;
  update(session.game, Math.min(session.maxStepMs, dt));
  return true;
}

/**
 * 押した時刻 eventMs で判定するタップ(D-284)。判定の時刻 = eventMs +(補正が + ならその分)。止めている間は数えない(null)。
 * 判定の時刻が、いま(nowMs。ハンドラが呼ばれた時刻)の時計で届いていれば、すぐ判定して結果を返す。
 * 届いていなければ(補正が +)、取っておいて null を返し、届いたときに onTap で知らせる。
 * @param {Session} session @param {number} eventMs @param {number} [nowMs]
 */
export function tapAt(session, eventMs, nowMs = eventMs) {
  if (session.paused) return null;
  if (!Number.isFinite(eventMs)) return tap(session.game);
  const target = eventMs + judgeDelayMs(session);
  if (target <= nowMs) {
    // 先に取っておいたタップがあれば、順番に判定してから。
    flushQueue(session, target);
    return tapAtGameTime(session, target);
  }
  session.queue.push(target);
  return null;
}
