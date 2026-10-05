// 釣りの進め方の小さな窓口(D-134)。画面は、時間とタップをここを通して計算本体に渡す。
// メニューを開いている間は「止めている」状態にし、経過時間もタップも計算本体に渡さない。
// 計算本体には止める仕組みを足さないので、開閉の有無で結果は変わらない。

import { tap, update } from "../core/fishing.js";

/**
 * game を進める窓口を作る。
 * maxStepMs:1 回に進める時間の上限(裏に回って戻ったときに、一気に何匹も進まないようにする)。
 */
export function createSession(game, { maxStepMs = 100 } = {}) {
  return { game, maxStepMs, paused: false };
}

/** 止める・再開する。 */
export function setPaused(session, paused) {
  session.paused = paused;
}

/** 経過時間を渡す。止めている間は何もしない。進めたら true。 */
export function advance(session, dtMs) {
  if (session.paused) return false;
  update(session.game, Math.min(session.maxStepMs, Math.max(0, dtMs)));
  return true;
}

/** 釣りのタップ。止めている間は数えない(null を返す)。 */
export function tapSession(session) {
  if (session.paused) return null;
  return tap(session.game);
}

/** 竿のボタンなどの操作。止めている間は行わない。行ったら fn の返り値、行わなければ false。 */
export function act(session, fn) {
  if (session.paused) return false;
  return fn(session.game);
}
