// @ts-check
// 釣り場(D-272〜D-276)。竿は 1 本の通し番号 g のまま。釣り場は、g を 5 つずつ束ねた名前つきの区分。
// - 釣り場の表(AREA_ROWS)は、1 行に id・名前・最初の通し番号・段階の数・空と海の色を持つ。釣り場を足すときは、
//   ここに 1 行と、魚の表(fish.js)に 15 行を足すだけでよい(DESIGN の「釣り場を足す手順」)。
// - 表にない段階(確かめ用の大きな表など)には、名前と色を自動で作った釣り場を当てる(makeAreas)。
// - いちばん新しい釣り場 = 竿の段階 g が属する釣り場。いまいる釣り場は、進み具合の area(古い釣り場にいるときだけ持つ:D-280)。
// 画面に触らない。JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/**
 * 釣り場の表の 1 行。
 * @typedef {object} AreaRow
 * @property {string} id 保存に使う名前(小文字の英字。あとから変えない)
 * @property {string} name 画面に出す名前
 * @property {number} firstStage 最初の通し番号 g
 * @property {number} stages 段階の数(5)
 * @property {readonly [string, string]} sky 空の色(上・下)
 * @property {readonly [string, string]} sea 海の色(上・下)
 */

/** 釣り場 1 つの段階の数(D-272)。 */
export const AREA_STAGES = 5;

/**
 * 釣り場の表(並び:港 → 磯。以後、川 → 沖 → 外洋 → 深海 を足す)。行は並べ替えない。
 * @type {readonly AreaRow[]}
 */
export const AREA_ROWS = Object.freeze([
  { id: "minato", name: "港", firstStage: 1, stages: AREA_STAGES, sky: ["#7ec8e3", "#c9ecf6"], sea: ["#1b6ca8", "#0b3954"] },
  { id: "iso", name: "磯", firstStage: 6, stages: AREA_STAGES, sky: ["#8fa9c4", "#e3e9ee"], sea: ["#1f7a72", "#0b3433"] },
]);

// 表にない釣り場の色(確かめ用。順に使い回す)。
/** @type {readonly { sky: readonly [string, string], sea: readonly [string, string] }[]} */
const EXTRA_COLORS = Object.freeze([
  { sky: ["#f4a261", "#fde2c4"], sea: ["#2a6f97", "#012a4a"] },
  { sky: ["#a3c4f3", "#e7f0fd"], sea: ["#3a86ff", "#03256c"] },
  { sky: ["#b8a1d9", "#ece4f7"], sea: ["#5a4fcf", "#1d1a4f"] },
  { sky: ["#6c757d", "#ced4da"], sea: ["#14213d", "#000814"] },
]);

/**
 * 段階 1〜maxStage を覆う釣り場の一覧。表の行のうち maxStage までに始まるものを使い、足りない段階には
 * 「釣り場 n」を自動で作る(id は a + 番号)。
 * @param {readonly AreaRow[]} rows @param {number} maxStage
 * @returns {readonly AreaRow[]}
 */
export function makeAreas(rows, maxStage) {
  /** @type {AreaRow[]} */
  const areas = rows.filter((a) => a.firstStage <= maxStage).map((a) => Object.freeze({ ...a }));
  let next = areas.length > 0 ? areas[areas.length - 1].firstStage + areas[areas.length - 1].stages : 1;
  while (next <= maxStage) {
    const n = areas.length + 1;
    const c = EXTRA_COLORS[(n - 1) % EXTRA_COLORS.length];
    areas.push(Object.freeze({ id: `a${n}`, name: `釣り場 ${n}`, firstStage: next, stages: AREA_STAGES, sky: c.sky, sea: c.sea }));
    next += AREA_STAGES;
  }
  return Object.freeze(areas);
}

/**
 * @typedef {{ areas: readonly AreaRow[] }} AreaContent
 * @typedef {{ rodStage: number, area?: string }} AreaProgress
 */

/** 通し番号 g が属する釣り場(なければ最後の釣り場)。 @param {AreaContent} content @param {number} g */
export function areaOfStage(content, g) {
  const found = content.areas.find((a) => g >= a.firstStage && g < a.firstStage + a.stages);
  return found ?? content.areas[content.areas.length - 1];
}

/** 釣り場の中の位置(1〜5:D-276)。 @param {AreaContent} content @param {number} g */
export function areaPosition(content, g) {
  return g - areaOfStage(content, g).firstStage + 1;
}

/** 釣り場の最後の段階(5 体目のヌシ)か。 @param {AreaContent} content @param {number} g */
export function isAreaLastStage(content, g) {
  const a = areaOfStage(content, g);
  return g === a.firstStage + a.stages - 1;
}

/** いちばん新しい(竿の段階が属する)釣り場。 @param {AreaProgress} progress @param {AreaContent} content */
export function newestArea(progress, content) {
  return areaOfStage(content, progress.rodStage);
}

/** 解放済みか(最初の通し番号が、竿の段階以下)。 @param {AreaProgress} progress @param {AreaRow} area */
export function isAreaUnlocked(progress, area) {
  return area.firstStage <= progress.rodStage;
}

/** 解放済みの釣り場(表の順)。 @param {AreaProgress} progress @param {AreaContent} content */
export function unlockedAreas(progress, content) {
  return content.areas.filter((a) => isAreaUnlocked(progress, a));
}

/**
 * いまいる釣り場。area がない・表にない・未解放なら、いちばん新しい釣り場。
 * @param {AreaProgress} progress @param {AreaContent} content
 */
export function currentArea(progress, content) {
  const own = progress.area === undefined ? undefined : content.areas.find((a) => a.id === progress.area);
  return own && isAreaUnlocked(progress, own) ? own : newestArea(progress, content);
}

/** いちばん新しい釣り場にいるか(製作・ヌシ戦・餌はここでだけ:D-274)。 @param {AreaProgress} progress @param {AreaContent} content */
export function inNewestArea(progress, content) {
  return currentArea(progress, content) === newestArea(progress, content);
}

/**
 * 釣り場を移る。解放済みの釣り場だけ。いちばん新しい釣り場なら欄を消す(古い釣り場にいるときだけ持つ)。移れたら true。
 * @param {AreaProgress} progress @param {string} id @param {AreaContent} content
 */
export function setArea(progress, id, content) {
  const area = content.areas.find((a) => a.id === id);
  if (!area || !isAreaUnlocked(progress, area)) return false;
  if (area === newestArea(progress, content)) delete progress.area;
  else progress.area = area.id;
  return true;
}

/**
 * 釣り場の欄をそろえる(竿の段階を変えたあとなど)。未解放・表にない・いちばん新しい釣り場なら欄を消す。
 * @param {AreaProgress} progress @param {AreaContent} content
 */
export function normalizeArea(progress, content) {
  if (progress.area === undefined) return;
  const own = content.areas.find((a) => a.id === progress.area);
  if (!own || !isAreaUnlocked(progress, own) || own === newestArea(progress, content)) delete progress.area;
}

/**
 * いまいる釣り場で出る魚の段階の範囲(D-275)。いちばん新しい釣り場は、最初の段階〜竿の段階。古い釣り場は全段階。
 * @param {AreaProgress} progress @param {AreaContent} content @returns {{ area: AreaRow, min: number, max: number }}
 */
export function poolRange(progress, content) {
  const area = currentArea(progress, content);
  const last = area.firstStage + area.stages - 1;
  return { area, min: area.firstStage, max: area === newestArea(progress, content) ? Math.min(progress.rodStage, last) : last };
}

/**
 * 釣り場の表の点検(問題の文の一覧。空なら問題なし)。段階 1 から切れ目なく、各 5 段階で、最後の段階まで覆う。
 * @param {readonly AreaRow[]} areas @param {number} maxStage
 */
export function checkAreas(areas, maxStage) {
  /** @type {string[]} */
  const problems = [];
  const ids = new Set();
  let next = 1;
  for (const a of areas) {
    if (!/^[a-z][a-z0-9]{0,15}$/.test(a.id) || ids.has(a.id)) problems.push(`釣り場の id:${a.id}`);
    ids.add(a.id);
    if (typeof a.name !== "string" || a.name === "") problems.push(`釣り場の名前:${a.id}`);
    if (a.firstStage !== next) problems.push(`釣り場は切れ目なく並べる:${a.id}`);
    if (a.stages !== AREA_STAGES) problems.push(`釣り場の段階は ${AREA_STAGES}:${a.id}`);
    for (const c of [...a.sky, ...a.sea]) if (!/^#[0-9a-f]{6}$/.test(c)) problems.push(`釣り場の色:${a.id}`);
    next = a.firstStage + a.stages;
  }
  if (areas.length === 0 || next - 1 < maxStage) problems.push("釣り場が最後の段階まで覆っていない");
  return problems;
}
