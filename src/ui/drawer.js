// @ts-check
// ドロワー(目次:D-130・D-152・D-161)。右上の ☰ で、右から目次が出る。
// 項目は画面の表(screens.js の SCREENS)から作る。押すと、その全画面に移る(目次は閉じる)。
// もう一度 ☰(✕)を押すか、外側をタップすると閉じる。目次と外側のタップは、釣りの操作に届かない。
// 開くと履歴を 1 つ足し、スマホの「戻る」(ブラウザの履歴)で閉じる(D-173)。✕や外側で閉じたときは、足した履歴を戻す。
// 項目を押したときは、目次の履歴を、その画面の履歴に置き換える(戻るでメイン画面に戻る)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { button, el } from "./list_view.js";
import { drawerItems } from "./screens.js";

/**
 * 目次を作る。
 * @param {object} options
 * @param {HTMLElement} options.app 画面全体
 * @param {HTMLElement} options.toggle ☰ のボタン
 * @param {HTMLElement} options.hud 上の数の欄(目次はこの下から出す)
 * @param {readonly { id: string, title: string }[]} options.screens 画面の表
 * @param {(id: string, replace: boolean) => void} options.onSelect 項目を押したとき(replace は、目次の履歴を置き換えるか)
 * @param {(open: boolean) => void} options.onOpenChange 開閉を知らせる
 * @param {(id: string) => "warn" | "full" | null} [options.badgeFor] 項目の「!」の印(開くたびに作り直す:D-216)
 */
export function createDrawer({ app, toggle, hud, screens, onSelect, onOpenChange, badgeFor = () => null }) {
  const backdrop = el("div", "drawer-backdrop");
  const drawer = el("nav", "drawer");
  drawer.id = "drawer";
  drawer.setAttribute("aria-label", "目次");
  const list = el("ul", "drawer-list");
  for (const item of drawerItems(screens)) {
    const li = el("li");
    const b = button(item.label, "drawer-item");
    b.dataset.screen = item.id;
    const badge = el("span", "drawer-badge", "!");
    badge.hidden = true;
    b.append(badge);
    b.addEventListener("click", () => {
      const replace = isDrawerEntry();
      setOpen(false, "select");
      onSelect(item.id, replace);
    });
    li.append(b);
    list.append(li);
  }
  drawer.append(list);
  app.append(backdrop, drawer);

  let open = false;
  /** 項目の「!」の印を、今の状態に合わせる(黄:もうすぐいっぱい・赤:いっぱい)。 */
  function refreshBadges() {
    for (const b of Array.from(drawer.querySelectorAll("[data-screen]"))) {
      const node = /** @type {HTMLElement} */ (b);
      const badge = /** @type {HTMLElement} */ (node.querySelector(".drawer-badge"));
      const level = badgeFor(node.dataset.screen ?? "");
      badge.hidden = level === null;
      badge.className = `drawer-badge ${level ?? ""}`.trim();
      badge.setAttribute("aria-label", level === "full" ? "いっぱい" : "もうすぐいっぱい");
    }
  }
  /** 今の履歴が、目次を開いたときに足したものか。 */
  function isDrawerEntry() {
    return history.state?.drawer === true;
  }
  /**
   * 開く・閉じる。how は閉じ方:"ui"(✕・外側。足した履歴を戻す)、"history"(戻るで閉じた)、"select"(項目を押した)。
   * @param {boolean} value @param {"ui" | "history" | "select"} [how]
   */
  function setOpen(value, how = "ui") {
    if (open === value) return;
    open = value;
    if (open) history.pushState({ drawer: true }, "", location.href);
    else if (how === "ui" && isDrawerEntry()) history.back();
    if (open) drawer.style.top = `${hud.offsetHeight}px`;
    if (open) refreshBadges();
    app.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "✕" : "☰";
    onOpenChange(open);
  }

  // 目次の中と外側のタップは、釣りの操作に届かないようにする(下の絵やボタンに伝えない)。
  for (const node of [backdrop, drawer, toggle]) {
    node.addEventListener("pointerdown", (event) => event.stopPropagation());
  }
  // 外側のタップは、指を離したとき(click)に閉じる。押した瞬間に閉じると、そのあとの click が下の竿のボタンに届くため。
  backdrop.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(false);
  });
  toggle.addEventListener("click", () => setOpen(!open));
  // 戻るで、目次の履歴から離れたら閉じる。
  window.addEventListener("popstate", () => {
    if (open && !isDrawerEntry()) setOpen(false, "history");
  });
  // 再読み込みしたときに目次の履歴が残っていたら、ただのメイン画面の履歴にする(目次は閉じた状態で始まる)。
  if (isDrawerEntry()) history.replaceState(null, "", location.href);

  return { isOpen: () => open, setOpen };
}
