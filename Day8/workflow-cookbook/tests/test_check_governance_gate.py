import sys
from pathlib import Path

import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from tools.ci import check_governance_gate
from tools.ci.check_governance_gate import (
    find_forbidden_matches,
    load_forbidden_patterns,
    validate_pr_body,
)


@pytest.mark.parametrize(
    "changed_paths, patterns, expected",
    [
        ("""core/schema/model.yaml\ndocs/guide.md""".splitlines(), ["/core/schema/**"], ["core/schema/model.yaml"]),
        ("""docs/readme.md\nops/runbook.md""".splitlines(), ["/core/schema/**"], []),
        (
            """auth/service.py\ncore/schema/definitions.yml""".splitlines(),
            ["/auth/**", "/core/schema/**"],
            ["auth/service.py", "core/schema/definitions.yml"],
        ),
    ],
)
def test_find_forbidden_matches(changed_paths, patterns, expected):
    normalized = [pattern.lstrip("/") for pattern in patterns]
    assert find_forbidden_matches(changed_paths, normalized) == expected


def test_validate_pr_body_success(capsys):
    body = """
Intent: INT-123
## EVALUATION
- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)
Priority Score: 4.5 / 安全性強化
"""

    assert validate_pr_body(body) is True
    captured = capsys.readouterr()
    assert captured.err == ""


def test_validate_pr_body_accepts_segmented_intent(capsys):
    body = """
Intent: INT-2024-001
## EVALUATION
- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)
Priority Score: 3
"""

    assert validate_pr_body(body) is True
    captured = capsys.readouterr()
    assert captured.err == ""


def test_validate_pr_body_accepts_alphanumeric_segments(capsys):
    body = """
Intent: INT-OPS-7A
## EVALUATION
- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)
Priority Score: 2
"""

    assert validate_pr_body(body) is True
    captured = capsys.readouterr()
    assert captured.err == ""


def test_validate_pr_body_accepts_fullwidth_colon(capsys):
    body = """
Intent：INT-456
## EVALUATION
- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)
Priority Score: 1
"""

    assert validate_pr_body(body) is True
    captured = capsys.readouterr()
    assert captured.err == ""


def test_validate_pr_body_accepts_local_evaluation_anchor(capsys):
    body = """
Intent: INT-900
## EVALUATION
- [Acceptance Criteria](#acceptance-criteria)
Priority Score: 5
"""

    assert validate_pr_body(body) is True
    captured = capsys.readouterr()
    assert captured.err == ""


def test_validate_pr_body_missing_intent(capsys):
    body = """
## EVALUATION
- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)
Priority Score: 2
"""

    assert validate_pr_body(body) is False
    captured = capsys.readouterr()
    assert "PR body must include 'Intent: INT-xxx'" in captured.err


def test_validate_pr_body_missing_evaluation(capsys):
    body = """
Intent: INT-001
Priority Score: 3
"""

    assert validate_pr_body(body) is False
    captured = capsys.readouterr()
    assert "PR must reference EVALUATION (acceptance) anchor" in captured.err


def test_validate_pr_body_missing_evaluation_anchor(capsys):
    body = """
Intent: INT-001
## EVALUATION
"""

    assert validate_pr_body(body) is False
    captured = capsys.readouterr()
    assert "PR must reference EVALUATION (acceptance) anchor" in captured.err


def test_validate_pr_body_requires_evaluation_heading(capsys):
    body = """
Intent: INT-555
- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)
Evaluation anchor is explained here without heading.
"""

    assert validate_pr_body(body) is False
    captured = capsys.readouterr()
    assert "PR must reference EVALUATION (acceptance) anchor" in captured.err


def test_validate_pr_body_warns_without_priority_score(capsys):
    body = """
Intent: INT-789
## EVALUATION
- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)
"""

    assert validate_pr_body(body) is True
    captured = capsys.readouterr()
    assert "Consider adding 'Priority Score: <number>'" in captured.err


def test_pr_template_contains_required_sections():
    template = Path(".github/pull_request_template.md").read_text(encoding="utf-8")

    assert "Intent:" in template
    assert "## EVALUATION" in template
    assert "EVALUATION.md#acceptance-criteria" in template


def test_load_forbidden_patterns(tmp_path):
    policy = tmp_path / "policy.yaml"
    policy.write_text(
        """
self_modification:
  forbidden_paths:
    - "/core/schema/**"
    - '/auth/**'
  require_human_approval:
    - "/governance/**"
"""
    )

    assert load_forbidden_patterns(policy) == ["core/schema/**", "auth/**"]


def test_collect_changed_paths_falls_back(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(args, **kwargs):  # type: ignore[no-untyped-def]
        calls.append(list(args))
        refspec = args[-1]
        if refspec in {"origin/main...", "main..."}:
            raise check_governance_gate.subprocess.CalledProcessError(128, args)
        return type("Result", (), {"stdout": "first.txt\nsecond.txt\n"})()

    monkeypatch.setattr(check_governance_gate.subprocess, "run", fake_run)

    changed = check_governance_gate.collect_changed_paths()

    assert changed == ["first.txt", "second.txt"]
    assert calls == [
        ["git", "diff", "--name-only", "origin/main..."],
        ["git", "diff", "--name-only", "main..."],
        ["git", "diff", "--name-only", "HEAD"],
    ]


def test_main_accepts_pr_body_env(monkeypatch, capsys):
    monkeypatch.setattr(check_governance_gate, "collect_changed_paths", lambda: [])
    monkeypatch.setenv(
        "PR_BODY",
        """Intent: INT-999\n## EVALUATION\n- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)\nPriority Score: 2\n""",
    )
    monkeypatch.delenv("GITHUB_EVENT_PATH", raising=False)

    exit_code = check_governance_gate.main()

    assert exit_code == 0
    captured = capsys.readouterr()
    assert captured.err == ""


def test_main_accepts_pr_body_path_argument(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(check_governance_gate, "collect_changed_paths", lambda: [])
    monkeypatch.delenv("PR_BODY", raising=False)
    monkeypatch.delenv("GITHUB_EVENT_PATH", raising=False)
    body_path = tmp_path / "body.md"
    body_path.write_text(
        """Intent: INT-4242\n## EVALUATION\n- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)\nPriority Score: 2\n""",
        encoding="utf-8",
    )

    exit_code = check_governance_gate.main(("--pr-body-path", str(body_path)))

    assert exit_code == 0
    captured = capsys.readouterr()
    assert captured.err == ""


def test_main_requires_pr_body(monkeypatch, capsys):
    monkeypatch.setattr(check_governance_gate, "collect_changed_paths", lambda: [])
    monkeypatch.delenv("PR_BODY", raising=False)
    monkeypatch.delenv("GITHUB_EVENT_PATH", raising=False)

    exit_code = check_governance_gate.main()

    assert exit_code == 1
    captured = capsys.readouterr()
    assert "PR body data is unavailable" in captured.err
