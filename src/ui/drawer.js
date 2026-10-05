// ドロワーメニュー(引き出しメニュー)の画面(D-130・D-134・D-135)。
// 右上の ☰ で、右からメニューが出る。もう一度 ☰ を押すか、外側をタップすると閉じる。
// タブは MENU_TABS(表)から作る。一覧のタブは、行を押すとその下に詳細が出る(2 段構え)。
// 開いている間は onOpenChange(true) を呼び、画面が釣りを止める。

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** 一覧のタブの中身({ header, sections })を container に描く。 */
export function renderListView(container, view) {
  if (view.header) container.append(el("div", "menu-header", view.header));
  for (const section of view.sections) {
    const box = el("section", "menu-section");
    if (section.title) box.append(el("h3", "", section.title));
    const list = el("ul", "menu-list");
    for (const row of section.rows) {
      const item = el("li");
      const button = el("button", "menu-row");
      button.type = "button";
      button.append(el("span", "menu-label", row.label), el("span", "menu-value", row.value));
      item.append(button);
      if (row.detail) {
        const detail = el("dl", "menu-detail");
        detail.hidden = true;
        for (const [key, value] of row.detail) detail.append(el("dt", "", key), el("dd", "", value));
        item.append(detail);
        button.setAttribute("aria-expanded", "false");
        button.addEventListener("click", () => {
          detail.hidden = !detail.hidden;
          button.setAttribute("aria-expanded", String(!detail.hidden));
        });
      } else {
        button.disabled = true;
      }
      list.append(item);
    }
    box.append(list);
    container.append(box);
  }
}

/**
 * ドロワーを作る。
 * - app:画面全体の要素。toggle:☰ のボタン。hud:上の数の欄(メニューはこの下から出す)。
 * - tabs:タブの表。ctx:タブの部品に渡すもの。onOpenChange(open):開閉を知らせる。
 */
export function createDrawer({ app, toggle, hud, tabs, ctx, onOpenChange }) {
  const backdrop = el("div", "drawer-backdrop");
  const drawer = el("aside", "drawer");
  drawer.id = "drawer";
  drawer.setAttribute("aria-label", "メニュー");
  const bar = el("nav", "drawer-tabs");
  const body = el("div", "drawer-body");
  drawer.append(bar, body);
  app.append(backdrop, drawer);

  let current = tabs[0].id;
  let open = false;
  const tabButtons = new Map();
  for (const tab of tabs) {
    const b = el("button", "drawer-tab", tab.name);
    b.type = "button";
    b.dataset.tab = tab.id;
    b.addEventListener("click", () => {
      current = tab.id;
      render();
    });
    tabButtons.set(tab.id, b);
    bar.append(b);
  }

  // keepScroll:同じタブの中身を作り直すとき(装着や分解のあと)は、スクロールの位置を保つ。
  function render(keepScroll = false) {
    const scroll = body.scrollTop;
    for (const [id, b] of tabButtons) b.classList.toggle("active", id === current);
    body.replaceChildren();
    const tab = tabs.find((t) => t.id === current);
    if (tab.view) renderListView(body, tab.view(ctx));
    else tab.mount(body, ctx);
    body.scrollTop = keepScroll ? scroll : 0;
  }
  // タブの部品から、作り直しを頼めるようにする。
  ctx.rerender = () => render(true);

  function setOpen(value) {
    if (open === value) return;
    open = value;
    if (open) {
      drawer.style.top = `${hud.offsetHeight}px`;
      render();
    }
    app.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "✕" : "☰";
    onOpenChange(open);
  }

  // メニューの中と外側のタップは、釣りの操作に届かないようにする(下の絵やボタンに伝えない)。
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
