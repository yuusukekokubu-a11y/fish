"""GitHub のテストの設定が決まりどおりかのテスト(D-005・D-012〜D-015)。"""

from __future__ import annotations

import re

import pytest
import yaml

from conftest import ROOT

WORKFLOW_DIR = ROOT / ".github" / "workflows"
CI = WORKFLOW_DIR / "ci.yml"
ALLOWED_ACTIONS = {"actions/checkout", "actions/setup-python"}
SHA = re.compile(r"^[0-9a-f]{40}$")


def load(path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def triggers(workflow):
    # YAML 1.1 では「on」が真偽値の True として読まれるため、両方を見る。
    return workflow.get("on", workflow.get(True))


@pytest.fixture(scope="module")
def ci():
    return load(CI)


def all_workflows():
    return sorted(WORKFLOW_DIR.glob("*.y*ml"))


def test_triggers(ci):
    on = triggers(ci)
    assert "pull_request" in on
    assert on["push"]["branches"] == ["main"]
    assert "workflow_dispatch" in on


def test_old_pr_runs_are_cancelled(ci):
    concurrency = ci["concurrency"]
    assert "github.event.pull_request.number" in concurrency["group"]
    assert "pull_request" in str(concurrency["cancel-in-progress"])


def test_python_version_is_single(ci):
    assert ci["env"]["PYTHON_VERSION"] == "3.12"
    for job in ci["jobs"].values():
        assert "strategy" not in job, "版は 1 つだけで確かめる(D-009)"


def test_fast_job_runs_default_pytest_on_pr_and_main(ci):
    fast = ci["jobs"]["fast"]
    assert fast["if"] == "github.event_name != 'workflow_dispatch'"
    runs = [s.get("run", "") for s in fast["steps"]]
    assert "python -m pytest" in runs
    assert not any("slow" in r for r in runs)


def test_slow_job_runs_only_on_core_change_or_manual(ci):
    slow = ci["jobs"]["slow"]
    condition = " ".join(slow["if"].split())
    assert "needs.changes.outputs.needs_slow == 'true'" in condition
    assert "github.event_name == 'workflow_dispatch'" in condition
    assert "github.event_name == 'pull_request'" in condition
    assert "push" not in condition, "main への取り込み後は速いテストだけ"
    runs = [s.get("run", "") for s in slow["steps"]]
    assert "python scripts/run_slow_tests.py" in runs


def test_changes_job_uses_decision_script(ci):
    changes = ci["jobs"]["changes"]
    assert changes["if"] == "github.event_name == 'pull_request'"
    script = " ".join(s.get("run", "") for s in changes["steps"])
    assert "scripts/ci_needs_slow.py" in script
    assert changes["outputs"]["needs_slow"] == "${{ steps.decide.outputs.needs_slow }}"


def test_result_job_collects_all_jobs(ci):
    result = ci["jobs"]["ci-result"]
    others = set(ci["jobs"]) - {"ci-result"}
    assert set(result["needs"]) == others
    assert result["if"] == "always()"


def test_every_job_has_timeout(ci):
    for name, job in ci["jobs"].items():
        assert "timeout-minutes" in job, name


@pytest.mark.parametrize("path", all_workflows(), ids=lambda p: p.name)
def test_actions_are_few_and_pinned(path):
    workflow = load(path)
    for job in workflow["jobs"].values():
        for step in job.get("steps", []):
            uses = step.get("uses")
            if uses is None:
                continue
            name, _, ref = uses.partition("@")
            assert name in ALLOWED_ACTIONS, f"許可していない部品:{uses}(D-014)"
            assert SHA.match(ref), f"commit の番号で固定していない:{uses}(D-014)"
