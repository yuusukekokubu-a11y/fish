// 画面の表と、画面の切り替えの状態のテスト(②-4a2 の受け入れ条件 1・3・9、D-152・D-153・D-161)。

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  drawerItems,
  hashFor,
  initialNav,
  isPaused,
  SCREENS,
  screenFromHash,
  setDrawer,
  showScreen,
} from "../src/ui/screens.js";

test("目次は画面の表から作られ、装備・スキル・クレート・素材・ステータス・設定の 6 項目", () => {
  assert.deepEqual(drawerItems().map((i) => i.label), ["装備", "スキル", "クレート", "素材", "ステータス", "設定"]);
  for (const s of SCREENS) {
    assert.equal(typeof s.mount, "function", s.id);
    assert.match(s.id, /^[a-z]+$/);
  }
});

test("表に 1 行足すだけで、目次に項目が増える", () => {
  const more = [...SCREENS, { id: "zukan", title: "図鑑", mount: () => {} }];
  assert.deepEqual(drawerItems(more).map((i) => i.label), ["装備", "スキル", "クレート", "素材", "ステータス", "設定", "図鑑"]);
  assert.equal(screenFromHash("#zukan", more), "zukan");
  assert.equal(screenFromHash("#zukan"), null, "元の表にはない");
});

test("URL の「#」のあとで画面を表す。表にない名前や空はメイン画面", () => {
  for (const s of SCREENS) assert.equal(screenFromHash(hashFor(s.id)), s.id);
  for (const h of ["", "#", "#unknown", "#Equipment", "equipment-x"]) assert.equal(screenFromHash(h), null, h);
});

test("目次か全画面が開いていれば止める。全画面に移ると目次は閉じる。全画面の上では目次は開かない", () => {
  let nav = initialNav();
  assert.equal(isPaused(nav), false);
  nav = setDrawer(nav, true);
  assert.deepEqual(nav, { drawer: true, screen: null });
  assert.equal(isPaused(nav), true);
  nav = showScreen(nav, "equipment");
  assert.deepEqual(nav, { drawer: false, screen: "equipment" });
  assert.equal(isPaused(nav), true);
  assert.deepEqual(setDrawer(nav, true), nav);
  nav = showScreen(nav, null);
  assert.equal(isPaused(nav), false);
});
