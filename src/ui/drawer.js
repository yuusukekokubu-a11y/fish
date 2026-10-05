// @ts-check
// ドロワー(目次:D-130・D-152・D-161)。右上の ☰ で、右から目次が出る。
// 項目は画面の表(screens.js の SCREENS)から作る。押すと、その全画面に移る(目次は閉じる)。
// もう一度 ☰(✕)を押すか、外側をタップすると閉じる。目次と外側のタップは、釣りの操作に届かない。
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
 * @param {(id: string) => void} options.onSelect 項目を押したとき
 * @param {(open: boolean) => void} options.onOpenChange 開閉を知らせる
 */
export function createDrawer({ app, toggle, hud, screens, onSelect, onOpenChange }) {
  const backdrop = el("div", "drawer-backdrop");
  const drawer = el("nav", "drawer");
  drawer.id = "drawer";
  drawer.setAttribute("aria-label", "目次");
  const list = el("ul", "drawer-list");
  for (const item of drawerItems(screens)) {
    const li = el("li");
    const b = button(item.label, "drawer-item");
    b.dataset.screen = item.id;
    b.addEventListener("click", () => {
      setOpen(false);
      onSelect(item.id);
    });
    li.append(b);
    list.append(li);
  }
  drawer.append(list);
  app.append(backdrop, drawer);

  let open = false;
  /** @param {boolean} value */
  function setOpen(value) {
    if (open === value) return;
    open = value;
    if (open) drawer.style.top = `${hud.offsetHeight}px`;
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

  return { isOpen: () => open, setOpen };
}
