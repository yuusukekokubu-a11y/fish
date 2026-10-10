// 降臨の画面の文字(D-396・D-397・D-403)。
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { createGame } from "../src/core/fishing.js";
import { kourinView, charmEffectText } from "../src/ui/kourin_view.js";
import { addRaidEffects, raidMessage, raidNight, raidResultView, rewardText } from "../src/ui/kourin_fx.js";
import { createEffects } from "../src/ui/effects.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { progressAt } from "./helpers.js";

test("港では「港を越えると」。磯からはウロコパワー・替えられる鱗・4 キャラ(Lv・くせ・お守り・1 回の値段・挑む。D-408・D-409・D-411)", () => {
  assert.equal(kourinView(createGame(1, { progress: progressAt(3) })).unlocked, false);
  const stage = DEFAULT_CONTENT.stageByNumber.get(7);
  const kourin = { power: 500, cleared: { kani: 2 }, raid: null };
  const game = createGame(1, { progress: progressAt(7, "crafted", { scales: { [stage.craft.scale]: 3 }, kourin }) });
  const v = kourinView(game);
  assert.equal(v.unlocked, true);
  assert.deepEqual([v.power.text, v.power.scaleText, v.power.convertLabel, v.power.canConvert], ["ウロコパワー 500", "替えられる鱗 3 枚(+1920)", "鱗をウロコパワーに替える(+1920)", true]);
  assert.deepEqual(
    v.chars.map((c) => [c.name, c.levelText, c.quirkText, c.charmText, c.clearedText, c.costText, c.startLabel, c.canStart, c.startNote]),
    [
      ["疾風の大エビ", "Lv1", "印が速い", "倒すと 静めの守り", "まだ討伐していない", "1 回 ウロコパワー 240", "挑む(−240)", true, "挑むと呼び出して、そのまま戦います(倒すまで、ほかの相手には挑めません)"],
      ["鉄壁の大ガニ", "Lv3", "防御の壁", "倒すと 破りの守り", "Lv2 まで討伐", "1 回 ウロコパワー 960", "挑む(−960)", false, "ウロコパワーがあと 460 足りません"],
      ["不死の大ダコ", "Lv1", "自動回復", "倒すと 和らぎの守り", "まだ討伐していない", "1 回 ウロコパワー 240", "挑む(−240)", true, "挑むと呼び出して、そのまま戦います(倒すまで、ほかの相手には挑めません)"],
      ["刹那の大イカ", "Lv1", "制限時間が短い", "倒すと 刻の守り", "まだ討伐していない", "1 回 ウロコパワー 240", "挑む(−240)", true, "挑むと呼び出して、そのまま戦います(倒すまで、ほかの相手には挑めません)"],
    ],
  );
  assert.deepEqual([v.chars[0].ratio, v.chars[1].ratio], [1, 500 / 960], "貯金が 1 回の値段に届いている割合");
});

test("呼んでいるキャラ(残りの体力・報酬の区切り・挑戦の回数。挑むのボタンは同じカードに:D-409。挑むたびに払う:D-411)と、お守り(レベル・効果・付けているか)", () => {
  const game = createGame(1, {
    progress: progressAt(13, "none", {
      kourin: { power: 5000, cleared: { tako: 4 }, raid: { char: "tako", hp: 1234, tries: 2, paid: 3 } },
      charms: { levels: { shizume: 15, toki: 5 }, equipped: "toki" },
    }),
  });
  const v = kourinView(game);
  const tako = v.chars.find((c) => c.id === "tako");
  assert.deepEqual([tako?.current, tako?.levelText, tako?.stepsText, tako?.triesText, tako?.canStart], [true, "Lv5", "報酬 3 / 10", "挑戦 2 回", true]);
  assert.match(tako?.hpText ?? "", /^残り 1234 \/ /);
  // ほかの相手は、呼んでいる相手を倒すまで挑めない。
  const ebi = v.chars.find((c) => c.id === "ebi");
  assert.deepEqual([ebi?.canStart, ebi?.startNote], [false, "不死の大ダコを倒すまで、ほかの相手には挑めません"]);
  assert.deepEqual(
    v.charms.map((c) => [c.name, c.levelText, c.effectText, c.equipped]),
    [
      ["静めの守り", "Lv15", "印の速さ −20%", false],
      ["刻の守り", "Lv5", "制限時間 +15%(ヌシ戦・降臨)", true],
    ],
  );
  assert.equal(charmEffectText("yaburi", 0.25), "ダメージ +25%(ヌシ戦・降臨)");
  assert.equal(charmEffectText("yawaragi", 0.3), "くせ −30%(ヌシ戦・降臨)");
});

test("夜の背景は降臨の戦いと結果の間だけ。文と、区切りの報酬の文字", () => {
  const game = createGame(1, { progress: progressAt(13) });
  assert.equal(raidNight(game), false);
  const fake = { cast: { raid: { char: "ebi", level: 3 }, fish: { name: "降臨・疾風の大エビ" } }, phase: "minigame", lastResult: null };
  assert.equal(raidNight(fake), true);
  assert.equal(raidMessage(fake), "降臨・疾風の大エビ Lv3との勝負!");
  const after = { ...fake, phase: "result", lastResult: { raid: { defeated: false, damage: 1500, hpLeft: 250, maxHp: 1000, rewards: [] } } };
  assert.equal(raidMessage(after), "1500 ダメージ!(残り 25%)");
  assert.equal(raidMessage({ ...after, lastResult: { raid: { defeated: true, rewards: [] } } }), "降臨・疾風の大エビ Lv3を討伐した!");
  assert.equal(raidMessage(game), null);
  assert.equal(rewardText({ type: "coins", coins: 1200 }, DEFAULT_CONTENT), "+1200 ウロコイン");
  assert.equal(rewardText({ type: "charm", charm: "toki", level: 1, fresh: true }, DEFAULT_CONTENT), "刻の守りを授かった!");
  assert.equal(rewardText({ type: "charm", charm: "toki", level: 4, fresh: false }, DEFAULT_CONTENT), "刻の守り Lv4");
  assert.equal(rewardText({ type: "item", item: { kind: "reel" }, scrapped: true }, DEFAULT_CONTENT), "クレート 1 回:リール(自動分解)");
  const fx = createEffects();
  addRaidEffects(fx, { raid: { defeated: true, rewards: [{ type: "coins", coins: 5 }, { type: "charm", charm: "toki", level: 1, fresh: true }] } }, 0, DEFAULT_CONTENT);
  assert.equal(fx.banner.text, "討伐!");
  // 報酬の中身は挑戦の終わりのシートに出すので、浮かぶ文字にはしない(D-404)。
  assert.deepEqual(fx.floats, []);
});

test("降臨の報酬の一覧(挑戦の終わりのシート):名前と Lv・ダメージ・報酬ごとの行。報酬がなければ次の区切りまでの残り", () => {
  const item = { id: 1, kind: "reel", rarity: "epic", grade: 1, effect: 0, skills: [] };
  const v = raidResultView(
    { char: "kani", level: 2, defeated: false, damage: 300, hpLeft: 700, maxHp: 1000, rewards: [
      { step: 1, type: "coins", coins: 120 },
      { step: 2, type: "item", item, scrapped: true, scrapCoins: 30 },
      { step: 3, type: "coins", coins: 120, full: "gear" },
    ] },
    DEFAULT_CONTENT,
    10,
  );
  assert.equal(v.title, "鉄壁の大ガニ Lv2に挑戦");
  assert.equal(v.sub, "300 ダメージ(残り 70%)");
  assert.deepEqual(v.rows.map((r) => r.tag), ["ウロコイン", "クレート", "ウロコイン"]);
  assert.ok(v.rows[1].text.startsWith("★★★ ") && v.rows[1].text.endsWith("のリール"), v.rows[1].text);
  assert.equal(v.rows[1].note, "自動分解 +30 ウロコイン");
  assert.equal(v.rows[2].note, "装備の持ち物がいっぱいのため");
  assert.equal(v.empty, "");
  const none = raidResultView({ char: "ebi", level: 1, defeated: false, damage: 50, hpLeft: 650, maxHp: 1000, rewards: [] }, DEFAULT_CONTENT, 10);
  assert.equal(none.empty, "今回の報酬はなし(次の報酬まで あと 5%)");
  const win = raidResultView({ char: "ika", level: 3, defeated: true, damage: 90, hpLeft: 0, maxHp: 1000, rewards: [{ step: 10, type: "charm", charm: "toki", level: 3, fresh: false }] }, DEFAULT_CONTENT, 10);
  assert.equal(win.title, "刹那の大イカ Lv3を討伐!");
  assert.deepEqual([win.rows[0].tag, win.rows[0].text], ["お守り", "刻の守り が Lv3 に"]);
});
