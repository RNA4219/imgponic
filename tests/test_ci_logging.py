from __future__ import annotations

import re
from pathlib import Path


def _resolve_workflow_path(base_dir: Path | None = None) -> Path:
    """Return the workflow file path, preferring ``tests.yml`` over ``test.yml``."""

    root = base_dir or Path(".")
    workflows_dir = root / ".github" / "workflows"
    preferred = workflows_dir / "tests.yml"
    if preferred.exists():
        return preferred
    return workflows_dir / "test.yml"


def _extract_rust_block(workflow: str) -> str:
    match = re.search(r"(?ms)^  rust:\n(?P<body>.*?)(?=^  \w|\Z)", workflow)
    if match is None:
        raise AssertionError("rust job not found in workflow")
    return match.group("body")


def _extract_step(block: str, name: str) -> str:
    pattern = rf"(?ms)^ {{6}}- name: {re.escape(name)}\n(?P<body>(?: {{8}}.*\n)+)"
    match = re.search(pattern, block)
    if match is None:
        raise AssertionError(f"{name} step not found")
    return match.group("body")


# NOTE: The CI workflow may be named ``tests.yml`` or ``test.yml``; keep both variants supported.
def test_resolve_workflow_path_prefers_tests(tmp_path: Path) -> None:
    workflows_dir = tmp_path / ".github" / "workflows"
    workflows_dir.mkdir(parents=True)
    tests_file = workflows_dir / "tests.yml"
    tests_file.write_text("name: tests", encoding="utf-8")

    assert _resolve_workflow_path(tmp_path) == tests_file


def test_resolve_workflow_path_falls_back_to_test(tmp_path: Path) -> None:
    workflows_dir = tmp_path / ".github" / "workflows"
    workflows_dir.mkdir(parents=True)
    test_file = workflows_dir / "test.yml"
    test_file.write_text("name: test", encoding="utf-8")

    assert _resolve_workflow_path(tmp_path) == test_file


def test_rust_job_uploads_cargo_test_log() -> None:
    workflow_text = _resolve_workflow_path().read_text(encoding="utf-8")

    rust_block = _extract_rust_block(workflow_text)

    run_tests_body = _extract_step(rust_block, "Run tests")
    assert "run: |\n          set -o pipefail\n" in run_tests_body
    assert "          mkdir -p artifacts\n" in run_tests_body
    assert (
        "          RUST_BACKTRACE=1 CARGO_TERM_COLOR=always cargo test -- --nocapture | tee artifacts/cargo-test.log\n"
        in run_tests_body
    )

    upload_body = _extract_step(rust_block, "Upload cargo test log")
    assert "if: ${{ always() }}\n" in upload_body
    assert "uses: actions/upload-artifact@v4\n" in upload_body
    assert "path: artifacts/cargo-test.log\n" in upload_body
