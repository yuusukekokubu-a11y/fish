"""DECISIONS と ACTIVE_DECISIONS の対応(D-003)のテスト。"""

from __future__ import annotations

import re

from conftest import ROOT

DOCS = ROOT / "docs"
HEADING = re.compile(r"^## (D-\d{3}) ", re.MULTILINE)
REFERENCE = re.compile(r"D-\d{3}")


def decision_numbers():
    return HEADING.findall((DOCS / "DECISIONS.md").read_text(encoding="utf-8"))


def active_text():
    return (DOCS / "ACTIVE_DECISIONS.md").read_text(encoding="utf-8")


def test_decision_numbers_are_sequential_from_001():
    numbers = decision_numbers()
    assert numbers, "決定が 1 つもない"
    assert numbers == [f"D-{i:03d}" for i in range(1, len(numbers) + 1)]


def test_every_decision_is_listed_in_active_or_unlisted():
    listed = set(REFERENCE.findall(active_text()))
    missing = [n for n in decision_numbers() if n not in listed]
    assert not missing, f"ACTIVE_DECISIONS に出てこない決定:{missing}"


def test_active_refers_only_to_existing_decisions():
    unknown = set(REFERENCE.findall(active_text())) - set(decision_numbers())
    assert not unknown, f"DECISIONS にない番号:{sorted(unknown)}"


def test_unlisted_decisions_are_not_also_active():
    active, _, unlisted = active_text().partition("## 載せなかった決定")
    assert unlisted, "「載せなかった決定」の節がない"
    both = set(REFERENCE.findall(active)) & set(REFERENCE.findall(unlisted))
    assert not both, f"有効と載せなかったの両方にある番号:{sorted(both)}"
