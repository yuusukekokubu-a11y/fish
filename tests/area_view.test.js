// 釣り場の見せ方のテスト(②-4d の条件 3・8・11:D-272〜D-278)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { createGame } from "../src/core/fishing.js";
import { makeCrates } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { syntheticContent } from "../src/core/synthetic.js";
import { areaRows, groupByArea, mixColors, oldAreaNotes, sceneColors, stageLabel, UNLOCK_NOTE, unlockMessage } from "../src/ui/area_view.js";
import { baitHud } from "../src/ui/bait_view.js";
import { crateCards } from "../src/ui/gear_view.js";
import { SCREENS } from "../src/ui/screens.js";
import { materialsView } from "../src/ui/screen_views.js";
import { progressAt, riverContent } from "./helpers.js";

const gameAt = (stage, extra = {}, content = undefined) => createGame(1, { progress: progressAt(stage, ROD_STEPS.NONE, extra), content });

test("釣り場の画面:目次に「釣り場」。解放済みは名前・色・いまいる印・進み具合(新しい釣り場だけ)、未解放は「???」と条件", () => {
  assert.ok(SCREENS.some((s) => s.id === "areas" && s.title === "釣り場"));
  assert.deepEqual(
    areaRows(gameAt(3)).map((r) => [r.name, r.unlocked, r.current, r.progressText, r.note]),
    [
      ["港", true, true, "段階 3/5", ""],
      // 磯・川・沖・外洋・深海は未解放(D-377)。
      ...Array.from({ length: 5 }, () => ["???", false, false, "", UNLOCK_NOTE]),
    ],
  );
  const rows = areaRows(gameAt(8, { area: "minato" }));
  assert.deepEqual(rows.map((r) => [r.name, r.current, r.newest, r.progressText]), [["港", true, false, ""], ["磯", false, true, "段階 3/5"], ...Array.from({ length: 4 }, () => ["???", false, false, ""])]);
  assert.deepEqual(rows[1].sky, ["#8fa9c4", "#e3e9ee"]);
});

test("竿の段階の言い方・解放の知らせ・古い釣り場の表示・絵の色", () => {
  const g = gameAt(7);
  assert.deepEqual([stageLabel(g.content, 1), stageLabel(g.content, 5), stageLabel(g.content, 7)], ["港 段階 1", "港 段階 5", "磯 段階 2"]);
  assert.equal(unlockMessage(g.content.areas[1]), "磯が解放された!磯に移りました");
  assert.equal(oldAreaNotes(g), null, "いちばん新しい釣り場では出さない");
  const old = gameAt(7, { area: "minato", bait: 4, useBait: true });
  assert.deepEqual(oldAreaNotes(old), { name: "磯", rod: "磯で製作・ヌシ戦ができます" });
  assert.equal(baitHud(old, oldAreaNotes(old).name).disabled, true);
  assert.deepEqual(sceneColors(old), { sky: ["#7ec8e3", "#c9ecf6"], sea: ["#1b6ca8", "#0b3954"] }, "港の色は前と同じ");
  assert.deepEqual(sceneColors(g).sea, ["#1f7a72", "#0b3433"]);
  const from = sceneColors(old);
  const to = sceneColors(g);
  assert.deepEqual(mixColors(from, to, 0), from);
  assert.deepEqual(mixColors(from, to, 1), to);
  assert.deepEqual(mixColors({ sky: ["#000000"], sea: ["#ffffff"] }, { sky: ["#ffffff"], sea: ["#000000"] }, 0.5), { sky: ["#808080"], sea: ["#808080"] });
});

test("クレートと素材:釣り場ごとのグループ。いちばん新しい釣り場だけ開く。表に釣り場を足すとグループが増える(D-272)", () => {
  const g = gameAt(7, { area: "minato" });
  const crates = makeCrates(g.content, DEFAULT_CONFIG);
  const groups = groupByArea(g, crateCards(g, crates), (c) => c.crate.stage, { skipEmpty: true });
  assert.deepEqual(groups.map((x) => [x.title, x.open, x.items.map((c) => c.crate.stage)]), [["港", false, [5, 4, 3, 2, 1]], ["磯", true, [7, 6]]]);
  // 川を足した表:川まで進むと、クレートも素材も 3 つ目のグループ(川)が開く。
  const river = gameAt(12, {}, riverContent());
  const riverGroups = groupByArea(river, crateCards(river, makeCrates(river.content, DEFAULT_CONFIG)), (c) => c.crate.stage, { skipEmpty: true });
  assert.deepEqual(riverGroups.map((x) => [x.title, x.open]), [["港", false], ["磯", false], ["川", true]]);
  assert.deepEqual(materialsView({ game: river }).sections.map((s) => [s.title, s.open]), [["港", false], ["磯", false], ["川", true]]);
  assert.deepEqual(areaRows(river).map((r) => r.name), ["港", "磯", "川"]);
});

test("限界:通し番号 100(20 の釣り場)でも、一覧 20 個・グループ 20 個が作れる", () => {
  const big = createGame(1, { content: syntheticContent(100), progress: progressAt(100) });
  const rows = areaRows(big);
  assert.equal(rows.length, 20);
  assert.deepEqual([rows[0].name, rows[19].name, rows[19].progressText], ["釣り場 1", "釣り場 20", "段階 5/5"]);
  assert.equal(materialsView({ game: big }).sections.length, 20);
  assert.equal(groupByArea(big, crateCards(big, makeCrates(big.content, DEFAULT_CONFIG)), (c) => c.crate.stage, { skipEmpty: true }).length, 20);
  assert.equal(stageLabel(big.content, 100), "釣り場 20 段階 5");
});
