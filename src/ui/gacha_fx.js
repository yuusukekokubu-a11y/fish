// @ts-check
// 引く演出(D-121・D-139・D-162・D-401)。画面全体に重ねて出す。見た目だけで、結果は演出の前に確定・保存済み。
// 1. 溜め:木のクレートが、だんだん大きく揺れる(1.2 秒)。後ろに、一番良いレア度の色の光の筋が回り始める
// 2. 開く:ふたが跳ね上がり、中から光の柱。レア度の色で画面が光る(エピック以上は紙吹雪、レジェンドは画面の揺れと「レジェンド!」)
// 3. 装備が出る(1 回は 1 枚、10 連は一覧で 1 枚ずつ順に。一番良いレア度を強調)
// どこをタップしても、溜めと光は飛ばして結果へ。結果が出ているときにタップすると閉じる。
// 紙吹雪の散り方は決まった並び(乱数は使わない)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144)。

/** @typedef {ReturnType<typeof import("./gear_view.js").pullResultView>} PullResult */

// 溜めの長さ(1 回で 1.5 秒以内:依頼の条件)と、光の長さ。
export const CHARGE_MS = 1200;
export const FLASH_MS = 450;
// レア度ごとの光の強さ(高いほど派手)。
const FLASH_STRENGTH = /** @type {Record<string, number>} */ ({ normal: 0.35, rare: 0.55, epic: 0.75, legend: 0.95 });

/**
 * @param {string} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** レア度の順(紙吹雪と見出しの出し分け)。 */
const RARITY_RANK = /** @type {Record<string, number>} */ ({ normal: 0, rare: 1, epic: 2, legend: 3 });
/** 一番良いレア度の見出し(レアより上のときだけ)。 */
const BEST_TITLE = /** @type {Record<string, string>} */ ({ epic: "エピック!", legend: "レジェンド!" });

/** 決まった並びの 0〜1 の数(紙吹雪の散り方。乱数は使わない)。 @param {number} i @param {number} k */
function spread(i, k) {
  let h = (i + 1) * 374761393 + (k + 1) * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * 紙吹雪(エピック以上)。count 個の四角を、CSS の変数で散らす(落ち方は crate.css の fx-confetti)。
 * @param {number} count @param {string[]} colors
 */
function confetti(count, colors) {
  const box = el("div", "fx-confetti");
  for (let i = 0; i < count; i++) {
    const piece = el("i");
    piece.style.setProperty("--x", `${Math.round(spread(i, 1) * 100)}%`);
    piece.style.setProperty("--dx", `${Math.round((spread(i, 2) - 0.5) * 160)}px`);
    piece.style.setProperty("--delay", `${Math.round(spread(i, 3) * 600)}ms`);
    piece.style.setProperty("--dur", `${1600 + Math.round(spread(i, 4) * 1200)}ms`);
    piece.style.setProperty("--rot", `${Math.round(spread(i, 5) * 720)}deg`);
    piece.style.setProperty("--c", colors[i % colors.length]);
    box.append(piece);
  }
  return box;
}

/** 装備 1 個のカード。 @param {PullResult["items"][number]} v @param {boolean} big */
function card(v, big) {
  const c = el("div", big ? "fx-card big" : "fx-card");
  c.style.setProperty("--rarity", v.color);
  c.dataset.rarity = v.rarityId;
  const top = el("div", "fx-card-top");
  top.append(el("span", "fx-rarity", `${v.stars} ${v.rarity}`));
  if (v.better) top.append(el("span", "fx-better", "▲"));
  c.append(top, el("div", "fx-name", v.name), el("div", "fx-effect", v.effect));
  // 補足の 1 行(グローブのグレードと対応段階:D-334)。
  const note = /** @type {{ note?: string }} */ (v).note;
  if (note) c.append(el("div", "fx-note", note));
  // スキル(「・」で区切る)。初めて出会ったスキルのそばに小さく NEW(D-301)。
  if (v.skills.length > 0) {
    const box = el("div", "fx-skills");
    v.skills.forEach((x, i) => {
      if (i > 0) box.append("・");
      const name = el("span", "fx-skill", x.text);
      box.append(name);
      if (/** @type {{ isNew?: boolean }} */ (x).isNew) box.append(el("span", "fx-new", "NEW"));
    });
    c.append(box);
  }
  return c;
}

/**
 * 演出を出す。閉じたら onClose を呼ぶ。返り値の skip() で、結果まで飛ばせる。
 * link を渡すと、結果の下にそのボタン(例:「装備を見る」)を出す。押すと閉じてから link.onClick を呼ぶ。
 * @param {HTMLElement} root 画面全体の要素 @param {PullResult} result @param {string} crateName
 * @param {() => void} onClose @param {{ label: string, onClick: () => void } | null} [link]
 * @param {{ text: string, ids: boolean[] } | null} [scrap] 自動分解(D-266):見出しと、引いた順に分解したかどうか。
 *   分解したものは、結果の一覧から外して、折りたたみの一覧に入れる(黙って消さない)。
 */
export function playPull(root, result, crateName, onClose, link = null, scrap = null) {
  const overlay = el("div", "fx-overlay");
  overlay.dataset.best = result.best;
  const bestColor = result.items.find((v) => v.rarityId === result.best)?.color ?? "#ffffff";
  overlay.style.setProperty("--best", bestColor);
  overlay.style.setProperty("--flash", String(FLASH_STRENGTH[result.best] ?? 0.5));

  const stage = el("div", "fx-stage");
  // 木のクレート:ふた・金具・胴(名前)。後ろに光の筋、中に光の柱。
  const box = el("div", "fx-crate charging");
  const lid = el("div", "fx-crate-lid");
  lid.append(el("div", "fx-crate-latch"));
  box.append(el("div", "fx-beam"), lid, el("div", "fx-crate-body", crateName));
  const rays = el("div", "fx-rays");
  stage.append(rays, box);
  const flash = el("div", "fx-flash");
  const hint = el("div", "fx-hint", "タップで飛ばす");
  overlay.append(stage, flash, hint);
  root.append(overlay);

  /** @type {ReturnType<typeof setTimeout>[]} */
  const timers = [];
  let phase = "charge";

  function showResult() {
    if (phase === "result") return;
    phase = "result";
    for (const t of timers) clearTimeout(t);
    overlay.classList.remove("flashing");
    stage.replaceChildren();
    const single = result.items.length === 1;
    const rank = RARITY_RANK[result.best] ?? 0;
    // 一番良いレア度がエピック以上なら、大きな見出しと紙吹雪。光の筋は結果の後ろで回り続ける。
    if (rank >= 2) {
      stage.append(el("div", `fx-best-title ${result.best}`, BEST_TITLE[result.best]));
      overlay.append(confetti(rank >= 3 ? 36 : 20, rank >= 3 ? [bestColor, "#fff1b8", "#ffffff", "#ffd166"] : [bestColor, "#ffffff", "#fff1b8"]));
    }
    if (rank >= 1) overlay.prepend(el("div", "fx-rays result"));
    const title = el("div", "fx-title", single ? "手に入れた!" : `${result.items.length} 個 手に入れた!`);
    const list = el("div", single ? "fx-list single" : "fx-list");
    const scrapList = el("div", "fx-list fx-scrap-list");
    let shown = 0;
    result.items.forEach((v, i) => {
      const c = card(v, single);
      if (!single && v.rarityId === result.best && result.best !== "normal") c.classList.add("best");
      if (v.rarityId === "legend") c.classList.add("legend");
      if (scrap?.ids[i]) scrapList.append(c);
      else {
        // 1 枚ずつ順に出す(10 連)。
        c.style.setProperty("--delay", `${shown * 70}ms`);
        shown += 1;
        list.append(c);
      }
    });
    stage.append(title, list.childElementCount > 0 ? list : el("p", "fx-empty", "残った装備はありません"));
    if (scrap?.text) {
      const details = el("details", "fx-scrap");
      details.append(el("summary", "fx-scrap-title", scrap.text), scrapList);
      // 開く・閉じるのタップで、演出を閉じない。
      details.addEventListener("click", (event) => event.stopPropagation());
      stage.append(details);
    }
    if (link) {
      const go = el("button", "fx-link", link.label);
      go.setAttribute("type", "button");
      go.addEventListener("click", (event) => {
        event.stopPropagation();
        overlay.remove();
        onClose();
        link.onClick();
      });
      stage.append(go);
    }
    hint.textContent = "タップで閉じる";
    overlay.classList.add("done");
  }

  function close() {
    overlay.remove();
    onClose();
  }

  timers.push(
    setTimeout(() => {
      phase = "flash";
      overlay.classList.add("flashing");
      box.classList.add("open");
      if (result.best === "legend") overlay.classList.add("shake");
    }, CHARGE_MS),
  );
  timers.push(setTimeout(showResult, CHARGE_MS + FLASH_MS));

  // 演出のタップは、下の釣りやメニューに伝えない。
  overlay.addEventListener("pointerdown", (event) => event.stopPropagation());
  overlay.addEventListener("click", (event) => {
    event.stopPropagation();
    if (phase === "result") close();
    else showResult();
  });

  return { skip: showResult, close };
}
