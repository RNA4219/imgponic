from __future__ import annotations

from pathlib import Path
from typing import Iterable

import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from tools.ci import check_governance_gate


def _write_policy(tmp_path: Path, lines: Iterable[str]) -> Path:
    policy = tmp_path / "policy.yaml"
    policy.write_text("\n".join(lines), encoding="utf-8")
    return policy


def test_load_forbidden_patterns(tmp_path: Path) -> None:
    policy = _write_policy(
        tmp_path,
        (
            "self_modification:",
            "  forbidden_paths:",
            "    - '/core/schema/**'",
            '    - "/auth/**"',
            "  require_human_approval:",
            "    - '/governance/**'",
        ),
    )

    assert check_governance_gate.load_forbidden_patterns(policy) == [
        "core/schema/**",
        "auth/**",
    ]


@pytest.mark.parametrize(
    "changed, expected",
    [
        (["core/schema/model.yaml"], ["core/schema/model.yaml"]),
        (["docs/readme.md"], []),
        (["auth/service.py", "other.txt"], ["auth/service.py"]),
    ],
)
def test_find_forbidden_matches(changed: list[str], expected: list[str]) -> None:
    patterns = ["core/schema/**", "auth/**"]

    assert check_governance_gate.find_forbidden_matches(changed, patterns) == expected


def test_validate_pr_body_success(capsys: pytest.CaptureFixture[str]) -> None:
    body = """Intent: INT-123\n## EVALUATION\n- [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)\nPriority Score: 2\n"""

    assert check_governance_gate.validate_pr_body(body)
    assert capsys.readouterr().err == ""


@pytest.mark.parametrize(
    "body, message",
    [
        ("## EVALUATION\n- [Acceptance Criteria](#acceptance-criteria)", "Intent"),
        ("Intent: INT-1", "EVALUATION"),
    ],
)
def test_validate_pr_body_failures(
    body: str, message: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert not check_governance_gate.validate_pr_body(body)
    assert message in capsys.readouterr().err


def test_collect_changed_paths_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []

    def fake_run(args, **kwargs):  # type: ignore[no-untyped-def]
        calls.append(list(args))
        if args[-1] in {"origin/main...", "main..."}:
            raise check_governance_gate.subprocess.CalledProcessError(1, args)
        return type("Result", (), {"stdout": "a.txt\nb.txt\n"})()

    monkeypatch.setattr(check_governance_gate.subprocess, "run", fake_run)

    assert check_governance_gate.collect_changed_paths() == ["a.txt", "b.txt"]
    assert calls[-1][-1] == "HEAD"


def test_main_skips_when_pr_body_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(tmp_path / "event.json"))
    monkeypatch.setattr(check_governance_gate, "collect_changed_paths", lambda: [])
    monkeypatch.setattr(check_governance_gate, "load_forbidden_patterns", lambda *_: [])

    assert check_governance_gate.main(()) == 0
    captured = capsys.readouterr()
    assert "Skipping PR body validation" in captured.err


def test_main_accepts_pr_body_env(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv(
        "PR_BODY",
        "Intent: INT-42\n## EVALUATION\n- [Acceptance Criteria](#acceptance-criteria)\nPriority Score: 1\n",
    )
    monkeypatch.setattr(check_governance_gate, "collect_changed_paths", lambda: [])
    monkeypatch.setattr(check_governance_gate, "load_forbidden_patterns", lambda *_: [])

    assert check_governance_gate.main(()) == 0
    assert capsys.readouterr().err == ""
