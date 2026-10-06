// タイミングのミニゲーム:ゲージの上を印が往復し、命中範囲の中でタップすれば成功。

/**
 * 経過時間から印の位置(0〜1)を求める。0 → 1 → 0 と往復する。
 * sweepMs は、端から端まで動く時間。
 */
export function markerPosition(elapsedMs, sweepMs) {
  const cycle = (Math.max(0, elapsedMs) % (2 * sweepMs)) / sweepMs;
  return cycle <= 1 ? cycle : 2 - cycle;
}

/** 命中範囲の判定。境界(start と end ちょうど)は成功に含める。 */
export function isHit(position, zone) {
  return zone.start <= position && position <= zone.end;
}

/** 0 以上 1 未満の数 v から命中範囲を作る。ゲージの端から margin 以上はなす。 */
export function zoneAt(v, { zoneWidth, zoneMargin }) {
  const room = Math.max(0, 1 - 2 * zoneMargin - zoneWidth);
  const start = zoneMargin + v * room;
  return { start, end: start + zoneWidth };
}

/** 命中範囲を乱数で決める。 */
export function drawZone(rng, options) {
  return zoneAt(rng(), options);
}
