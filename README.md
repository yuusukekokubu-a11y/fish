# fish

## 概要

fish の目的はまだ決まっていません(`docs/SPEC.md` の「目的と範囲」、`docs/DESIGN.md` の「検討中の論点」を参照)。
今は、開発の流れ(議論 → 依頼 → 実装 → 報告 → レビュー)を回すための土台だけがあります。

- 言語:Python 3.12
- テストの道具:pytest
- ライセンス:MIT(`LICENSE`)

## 動かし方

```
python -m pip install -e ".[dev]"
```

機能はまだありません。

## テストの回し方

| やりたいこと | コマンド |
| --- | --- |
| 速いテスト(既定) | `python -m pytest` |
| 特定のテストだけ | `python -m pytest tests/test_xxx.py` |
| 重いテスト | `python scripts/run_slow_tests.py` |

- `pytest` を何も指定せずに実行すると、速いテストだけが回ります。
- 重いテストには `@pytest.mark.slow`(marker:テストに付ける目印)を付け、`tests/slow/` に置きます。重いテストが 0 件でも成功として終わります。
- GitHub では次のように回ります(設定は `.github/workflows/ci.yml`)。
  - PR:速いテスト。計算本体(`src/fish/`)が変わったときだけ重いテストも。
  - main への取り込み後:速いテストだけ。
  - 手動:Actions の画面で「ci」を選び「Run workflow」を押すと、重いテストが回ります。

## docs の地図

| 文書 | 書いてあること |
| --- | --- |
| `docs/ACTIVE_DECISIONS.md` | 今有効な決定の一覧(分野ごと)。最初に読む。 |
| `docs/DECISIONS.md` | すべての決定の記録(D 番号・日付・理由)。 |
| `docs/SPEC.md` | 仕様:何をするか。 |
| `docs/DESIGN.md` | 設計:どう作るか、どこに何を書くか、検討中の論点。 |
| `docs/ROADMAP.md` | 依頼の予定(完了・作業中・これから)。 |
| `docs/REQUESTS.md` | 要望の控え(対応済み・候補・時期の決まったもの)。 |
| `CLAUDE.md` | Code(Claude Code)の作業手順書。 |
| `.github/ISSUE_TEMPLATE/report.md` | 報告 Issue のひな形。 |
| `.github/pull_request_template.md` | PR の本文のひな形。 |
