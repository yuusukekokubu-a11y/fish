// 設定の画面の中身(D-130・D-152):セーブコードと「データを消す」。
// 動きは前の画面の隅にあったときと同じ(D-059・D-065・D-092)。
// - セーブコード:書き出し・コピー・読み込み。読み込みは、コードが正しく、上書きの確認に「はい」と答えたときだけ保存を書き換える。
// - データを消す:3 秒のうちに 2 回押したときだけ消す。

import { decodeSaveCode, encodeSaveCode } from "../core/savecode.js";

// 「データを消す」を 2 回目に押せる時間。
export const RESET_CONFIRM_MS = 3000;

function el(tag, attrs = {}, text = "") {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text) node.textContent = text;
  return node;
}

/**
 * 設定の画面の中身を container に作る。
 * ctx:{ game, storage: { save(progress) → 保存できたら true, clear() }, reload() }。
 */
export function mountSettings(container, ctx) {
  const { game, storage, reload } = ctx;

  const code = el("section", { class: "screen-section" });
  code.append(el("h2", { class: "section-title" }, "セーブコード"));
  const text = el("textarea", { id: "code-text", spellcheck: "false", autocomplete: "off", "aria-label": "セーブコード" });
  const status = el("div", { id: "code-status", role: "status" });
  const buttons = el("div", { id: "code-buttons" });
  const exportButton = el("button", { id: "code-export", type: "button" }, "書き出し");
  const copy = el("button", { id: "code-copy", type: "button" }, "コピー");
  const importButton = el("button", { id: "code-import", type: "button" }, "読み込み");
  buttons.append(exportButton, copy, importButton);
  code.append(text, status, buttons);

  const danger = el("section", { class: "screen-section" });
  danger.append(el("h2", { class: "section-title" }, "データ"));
  const reset = el("button", { id: "reset", type: "button" }, "データを消す");
  danger.append(reset);
  container.append(code, danger);

  const show = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("error", isError);
  };

  exportButton.addEventListener("click", () => {
    text.value = encodeSaveCode(game.progress);
    show("書き出しました");
  });
  copy.addEventListener("click", async () => {
    if (text.value === "") text.value = encodeSaveCode(game.progress);
    try {
      await navigator.clipboard.writeText(text.value);
      show("コピーしました");
    } catch {
      // コピーが使えないブラウザでは、選んだ状態にして手で写せるようにする。
      text.focus();
      text.select();
      show("選んだ文字をコピーしてください");
    }
  });
  importButton.addEventListener("click", () => {
    const result = decodeSaveCode(text.value);
    if (!result.ok) {
      show(result.message, true);
      return;
    }
    if (!window.confirm("いまのデータを上書きしますか?")) {
      show("やめました");
      return;
    }
    if (!storage.save(result.progress)) {
      show("保存できませんでした", true);
      return;
    }
    reload();
  });

  let armedUntil = 0;
  let timer = null;
  const disarm = () => {
    armedUntil = 0;
    reset.classList.remove("armed");
    reset.textContent = "データを消す";
  };
  reset.addEventListener("click", () => {
    const now = performance.now();
    if (now < armedUntil) {
      clearTimeout(timer);
      storage.clear();
      reload();
      return;
    }
    armedUntil = now + RESET_CONFIRM_MS;
    reset.classList.add("armed");
    reset.textContent = "もう一度押すと消えます";
    clearTimeout(timer);
    timer = setTimeout(disarm, RESET_CONFIRM_MS);
  });
}
