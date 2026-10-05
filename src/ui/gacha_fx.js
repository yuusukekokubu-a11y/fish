// @ts-check
// 引く演出(D-121・D-139・D-162)。画面全体に重ねて出す。見た目だけで、結果は演出の前に確定・保存済み。
// 1. 溜め:クレートが揺れる(1.2 秒)
// 2. レア度の色の光(一番良いレア度の色。レジェンドは画面全体の光と揺れ)
// 3. 装備が出る(1 回は 1 枚、10 連は一覧で、一番良いレア度を強調)
// どこをタップしても、溜めと光は飛ばして結果へ。結果が出ているときにタップすると閉じる。
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

/** 装備 1 個のカード。 @param {PullResult["items"][number]} v @param {boolean} big */
function card(v, big) {
  const c = el("div", big ? "fx-card big" : "fx-card");
  c.style.setProperty("--rarity", v.color);
  c.dataset.rarity = v.rarityId;
  const top = el("div", "fx-card-top");
  top.append(el("span", "fx-rarity", `${v.stars} ${v.rarity}`));
  if (v.better) top.append(el("span", "fx-better", "▲"));
  c.append(top, el("div", "fx-name", v.name), el("div", "fx-effect", v.effect));
  return c;
}

/**
 * 演出を出す。閉じたら onClose を呼ぶ。返り値の skip() で、結果まで飛ばせる。
 * link を渡すと、結果の下にそのボタン(例:「装備を見る」)を出す。押すと閉じてから link.onClick を呼ぶ。
 * @param {HTMLElement} root 画面全体の要素 @param {PullResult} result @param {string} crateName
 * @param {() => void} onClose @param {{ label: string, onClick: () => void } | null} [link]
 */
export function playPull(root, result, crateName, onClose, link = null) {
  const overlay = el("div", "fx-overlay");
  overlay.dataset.best = result.best;
  const bestColor = result.items.find((v) => v.rarityId === result.best)?.color ?? "#ffffff";
  overlay.style.setProperty("--best", bestColor);
  overlay.style.setProperty("--flash", String(FLASH_STRENGTH[result.best] ?? 0.5));

  const stage = el("div", "fx-stage");
  const box = el("div", "fx-crate charging");
  box.append(el("div", "fx-crate-lid"), el("div", "fx-crate-body", crateName));
  stage.append(box);
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
    const title = el("div", "fx-title", single ? "手に入れた!" : `${result.items.length} 個 手に入れた!`);
    const list = el("div", single ? "fx-list single" : "fx-list");
    for (const v of result.items) {
      const c = card(v, single);
      if (!single && v.rarityId === result.best && result.best !== "normal") c.classList.add("best");
      list.append(c);
    }
    stage.append(title, list);
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
