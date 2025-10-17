from __future__ import annotations

import importlib.util
import json
import py_compile
import statistics
from importlib.abc import Loader
from pathlib import Path
from types import ModuleType

import pytest


WORKFLOW_ROOT = Path(__file__).resolve().parents[1]


def load_analyze_module() -> ModuleType:
    module_path = WORKFLOW_ROOT / "scripts" / "analyze.py"
    spec = importlib.util.spec_from_file_location("analyze", module_path)
    if spec is None or spec.loader is None:
        pytest.fail("Failed to load analyze.py spec")
    loader = spec.loader
    if not isinstance(loader, Loader):
        pytest.fail("analyze.py loader does not support exec_module")
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def test_analyze_paths_within_workflow_root() -> None:
    analyze = load_analyze_module()

    assert analyze.BASE_DIR == WORKFLOW_ROOT
    assert analyze.LOG == WORKFLOW_ROOT / "logs" / "test.jsonl"
    assert analyze.REPORT == WORKFLOW_ROOT / "reports" / "today.md"
    assert analyze.ISSUE_OUT == WORKFLOW_ROOT / "reports" / "issue_suggestions.md"


def test_analyze_script_compiles() -> None:
    script_path = WORKFLOW_ROOT / "scripts" / "analyze.py"
    py_compile.compile(str(script_path), doraise=True)


def test_analyze_paths_use_workflow_root() -> None:
    analyze = load_analyze_module()

    assert analyze.LOG == WORKFLOW_ROOT / "logs" / "test.jsonl"
    assert analyze.REPORT == WORKFLOW_ROOT / "reports" / "today.md"
    assert analyze.ISSUE_OUT == WORKFLOW_ROOT / "reports" / "issue_suggestions.md"


def test_p95_fallback_returns_max_when_quantiles_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    analyze = load_analyze_module()

    def _raise_statistics_error(*_args: object, **_kwargs: object) -> list[float]:
        raise statistics.StatisticsError("forced failure")

    monkeypatch.setattr(analyze.statistics, "quantiles", _raise_statistics_error)

    assert analyze.p95([10, 20]) == 20


def test_p95_fallback_uses_ceiling(monkeypatch: pytest.MonkeyPatch) -> None:
    analyze = load_analyze_module()

    def _raise_statistics_error(*_args: object, **_kwargs: object) -> list[float]:
        raise statistics.StatisticsError("forced failure")

    monkeypatch.setattr(analyze.statistics, "quantiles", _raise_statistics_error)

    assert analyze.p95([100, 200]) == 200


def test_load_results_sanitizes_non_numeric_durations(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()
    log_path = tmp_path / "results.jsonl"
    log_entries = [
        {"name": "case-null", "duration_ms": None, "status": "pass"},
        {"name": "case-str", "duration_ms": "7", "status": "pass"},
        {"name": "case-float", "duration_ms": 5.6, "status": "pass"},
        {"name": "case-missing", "status": "pass"},
    ]
    log_path.write_text(
        "\n".join(json.dumps(entry) for entry in log_entries) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(analyze, "LOG", log_path)

    _tests, durs, _fails, statuses = analyze.load_results()

    assert durs == [0, 0, 5, 0]
    assert all(isinstance(dur, int) for dur in durs)

    p95_value = analyze.p95(durs)
    assert isinstance(p95_value, int)
    assert statuses["case-null"] == {"pass"}


def test_load_results_prefers_manifest_logs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "custom.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "custom::case", "status": "pass", "duration_ms": 12})
        + "\n",
        encoding="utf-8",
    )

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(
        "targets:\n  - name: unit\n    logs: [\"logs/custom.jsonl\"]\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"

    for attr, value in {
        "BASE_DIR": tmp_path,
        "REPORT": report_path,
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    tests, durs, fails, statuses = analyze.load_results()
    assert (tests, durs, fails) == (["custom::case"], [12], [])
    assert statuses["custom::case"] == {"pass"}

    analyze.main()

    contents = report_path.read_text(encoding="utf-8")
    assert "Total tests: 1" in contents
    assert "- Failures: 0" in contents


def test_load_results_prefers_manifest_logs_even_when_log_overridden(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "custom.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "custom::case", "status": "pass", "duration_ms": 12})
        + "\n",
        encoding="utf-8",
    )

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(
        "targets:\n  - name: unit\n    logs: [\"logs/custom.jsonl\"]\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"

    for attr, value in {
        "BASE_DIR": tmp_path,
        "LOG": tmp_path / "logs" / "ignored.jsonl",
        "REPORT": report_path,
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    tests, durs, fails, statuses = analyze.load_results()
    assert (tests, durs, fails) == (["custom::case"], [12], [])
    assert statuses["custom::case"] == {"pass"}

    analyze.main()

    contents = report_path.read_text(encoding="utf-8")
    assert "Total tests: 1" in contents
    assert "- Failures: 0" in contents


def test_load_report_output_rejects_parent_escape(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    analyze = load_analyze_module()

    report_path = tmp_path / "reports" / "today.md"

    for attr, value in {
        "BASE_DIR": tmp_path,
        "REPORT": report_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    caplog.set_level("WARNING")

    manifest = {"report": {"output": "../outside.md"}}
    chosen = analyze.load_report_output_path(manifest=manifest)

    assert chosen == report_path
    assert any("outside base directory" in record.message for record in caplog.records)


def _exercise_missing_yaml_log_detection(
    analyze: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    manifest_text: str,
) -> Path:
    log_path = tmp_path / "logs" / "custom.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "custom::case", "status": "pass", "duration_ms": 12})
        + "\n",
        encoding="utf-8",
    )

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(manifest_text, encoding="utf-8")

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"

    import builtins

    original_import = builtins.__import__

    def _missing_yaml_import(name: str, *args: object, **kwargs: object):
        if name == "yaml":
            raise ModuleNotFoundError("forced missing yaml")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _missing_yaml_import)

    for attr, value in {
        "BASE_DIR": tmp_path,
        "REPORT": report_path,
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    tests, durs, fails, statuses = analyze.load_results()
    assert (tests, durs, fails) == (["custom::case"], [12], [])
    assert statuses["custom::case"] == {"pass"}

    analyze.main()

    return report_path


def _prepare_manifest_with_yaml_fallback(
    analyze: ModuleType,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    manifest_text: str,
) -> None:
    log_path = tmp_path / "logs" / "custom.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "custom::case", "status": "pass", "duration_ms": 12})
        + "\n",
        encoding="utf-8",
    )

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(manifest_text, encoding="utf-8")

    import builtins

    original_import = builtins.__import__

    def _missing_yaml_import(name: str, *args: object, **kwargs: object):
        if name == "yaml":
            raise ModuleNotFoundError("forced missing yaml")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _missing_yaml_import)

    for attr, value in {
        "BASE_DIR": tmp_path,
        "LOG": tmp_path / "logs" / "ignored.jsonl",
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)


def test_load_report_output_accepts_hash_when_yaml_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(
        'report.output: "reports/#1.md"\n',
        encoding="utf-8",
    )

    import builtins

    original_import = builtins.__import__

    def _missing_yaml_import(name: str, *args: object, **kwargs: object):
        if name == "yaml":
            raise ModuleNotFoundError("forced missing yaml")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _missing_yaml_import)

    report_path = tmp_path / "reports" / "today.md"

    for attr, value in {
        "BASE_DIR": tmp_path,
        "REPORT": report_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    chosen = analyze.load_report_output_path()

    assert chosen == tmp_path / "reports" / "#1.md"


def test_load_results_prefers_block_manifest_logs_when_yaml_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    report_path = _exercise_missing_yaml_log_detection(
        analyze,
        tmp_path,
        monkeypatch,
        "targets:\n  - name: unit\n    logs:\n      - logs/custom.jsonl\n",
    )

    contents = report_path.read_text(encoding="utf-8")
    assert "Total tests: 1" in contents
    assert "- Failures: 0" in contents


def test_load_results_reads_inline_comment_inline_logs_with_yaml_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    _prepare_manifest_with_yaml_fallback(
        analyze,
        tmp_path,
        monkeypatch,
        "targets:\n  - name: unit\n    logs: [\"logs/custom.jsonl\"]  # comment\n",
    )

    tests, durs, fails, statuses = analyze.load_results()

    assert (tests, durs, fails) == (["custom::case"], [12], [])
    assert statuses["custom::case"] == {"pass"}


def test_load_results_reads_inline_logs_without_quotes_when_yaml_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    _prepare_manifest_with_yaml_fallback(
        analyze,
        tmp_path,
        monkeypatch,
        "targets:\n  - name: unit\n    logs: [logs/custom.jsonl]\n",
    )

    tests, durs, fails, statuses = analyze.load_results()

    assert (tests, durs, fails) == (["custom::case"], [12], [])
    assert statuses["custom::case"] == {"pass"}


def test_load_results_reads_inline_comment_block_logs_with_yaml_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    _prepare_manifest_with_yaml_fallback(
        analyze,
        tmp_path,
        monkeypatch,
        "targets:\n  - name: unit\n    logs:  # comment\n      - logs/custom.jsonl\n",
    )

    tests, durs, fails, statuses = analyze.load_results()

    assert (tests, durs, fails) == (["custom::case"], [12], [])
    assert statuses["custom::case"] == {"pass"}


def test_load_results_handles_inline_comment_block_logs_when_yaml_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    report_path = _exercise_missing_yaml_log_detection(
        analyze,
        tmp_path,
        monkeypatch,
        (
            "targets:\n"
            "  - name: unit\n"
            "    logs:  # コメント\n"
            "      - logs/custom.jsonl\n"
        ),
    )

    contents = report_path.read_text(encoding="utf-8")
    assert "Total tests: 1" in contents
    assert "- Failures: 0" in contents


def test_load_results_handles_inline_comment_inline_logs_when_yaml_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    report_path = _exercise_missing_yaml_log_detection(
        analyze,
        tmp_path,
        monkeypatch,
        "targets:\n  - name: unit\n    logs: [\"logs/custom.jsonl\"]  # コメント\n",
    )

    contents = report_path.read_text(encoding="utf-8")
    assert "Total tests: 1" in contents
    assert "- Failures: 0" in contents


def test_main_uses_safe_report_output_when_manifest_escapes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    analyze = load_analyze_module()

    manifest_path = tmp_path / "reflection.yaml"
    manifest_path.write_text(
        "report:\n  output: \"../outside.md\"\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"

    for attr, value in {
        "BASE_DIR": tmp_path,
        "LOG": tmp_path / "missing.jsonl",
        "REPORT": report_path,
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": manifest_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    caplog.set_level("WARNING")

    analyze.main()

    assert report_path.exists()
    assert not (tmp_path.parent / "outside.md").exists()
    assert any("outside base directory" in record.message for record in caplog.records)


def test_main_reports_zero_when_no_log(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    report_path = tmp_path / "reports" / "today.md"
    monkeypatch.setattr(analyze, "LOG", tmp_path / "missing.jsonl")
    monkeypatch.setattr(analyze, "REPORT", report_path)

    analyze.main()

    contents = report_path.read_text(encoding="utf-8")

    assert "Total tests: 0" in contents
    assert "Pass rate:" in contents and "100.00%" not in contents


def test_main_timestamp_is_timezone_aware(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    report_path = tmp_path / "reports" / "today.md"
    monkeypatch.setattr(analyze, "LOG", tmp_path / "missing.jsonl")
    monkeypatch.setattr(analyze, "REPORT", report_path)

    analyze.main()

    header = report_path.read_text(encoding="utf-8").splitlines()[0]

    assert "+00:00 UTC" in header


def test_main_reports_zero_when_log_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "empty.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text("", encoding="utf-8")

    report_path = tmp_path / "reports" / "today.md"
    monkeypatch.setattr(analyze, "LOG", log_path)
    monkeypatch.setattr(analyze, "REPORT", report_path)

    analyze.main()

    contents = report_path.read_text(encoding="utf-8")

    assert "Total tests: 0" in contents
    assert "Pass rate: 0.00%" in contents


def test_main_reports_flaky_rate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "flaky.jsonl"
    log_path.parent.mkdir(parents=True)
    entries = [
        {"name": "test_a", "status": "pass", "duration_ms": 10},
        {"name": "test_a", "status": "fail", "duration_ms": 12},
        {"name": "test_b", "status": "pass", "duration_ms": 8},
        {"name": "test_c", "status": "fail", "duration_ms": 7},
    ]
    log_path.write_text(
        "\n".join(json.dumps(entry) for entry in entries) + "\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue.md"
    monkeypatch.setattr(analyze, "LOG", log_path)
    monkeypatch.setattr(analyze, "REPORT", report_path)
    monkeypatch.setattr(analyze, "ISSUE_OUT", issue_path)

    _tests, _durs, _fails, statuses = analyze.load_results()
    assert statuses["test_a"] == {"pass", "fail"}

    analyze.main()

    contents = report_path.read_text(encoding="utf-8")

    assert "- Flaky rate: 33.33%" in contents


def test_main_records_issue_todos_for_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "failures.jsonl"
    log_path.parent.mkdir(parents=True)
    entries = [
        {"name": "sample::fail", "status": "fail", "duration_ms": 42},
        {"name": "sample::fail", "status": "fail", "duration_ms": 45},
    ]
    log_path.write_text(
        "\n".join(json.dumps(entry) for entry in entries) + "\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"
    monkeypatch.setattr(analyze, "LOG", log_path)
    monkeypatch.setattr(analyze, "REPORT", report_path)
    monkeypatch.setattr(analyze, "ISSUE_OUT", issue_path)

    analyze.main()

    report_contents = report_path.read_text(encoding="utf-8").splitlines()
    assert "- sample::fail (x2): 仮説=前処理の不安定/依存の競合/境界値不足" in report_contents

    contents = issue_path.read_text(encoding="utf-8").splitlines()

    assert (
        "- [ ] sample::fail の再現手順/前提/境界値を追加" in contents
    )
    assert (
        "- [ ] sample::fail の再現手順/前提/境界値の工程を増やす" in contents
    )


def test_main_removes_issue_notes_when_no_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "success.jsonl"
    log_path.parent.mkdir(parents=True)
    entries = [
        {"name": "test_a", "status": "pass", "duration_ms": 5},
        {"name": "test_b", "status": "pass", "duration_ms": 7},
    ]
    log_path.write_text(
        "\n".join(json.dumps(entry) for entry in entries) + "\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"
    issue_path.parent.mkdir(parents=True)
    issue_path.write_text("既存のメモ", encoding="utf-8")

    monkeypatch.setattr(analyze, "LOG", log_path)
    monkeypatch.setattr(analyze, "REPORT", report_path)
    monkeypatch.setattr(analyze, "ISSUE_OUT", issue_path)

    analyze.main()

    if issue_path.exists():
        assert issue_path.read_text(encoding="utf-8").strip() == ""
    else:
        assert not issue_path.exists()


def test_main_skips_issue_notes_when_suggestions_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "failures.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "disabled::fail", "status": "fail", "duration_ms": 15})
        + "\n",
        encoding="utf-8",
    )

    issue_path = tmp_path / "reports" / "issue_suggestions.md"
    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text("actions:\n  suggest_issues: false\n", encoding="utf-8")

    for attr, value in {
        "LOG": log_path,
        "REPORT": tmp_path / "reports" / "today.md",
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    analyze.main()

    assert not issue_path.exists()


def test_main_omits_why_why_heading_with_manifest_opt_out(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "failures.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        "\n".join(
            json.dumps({"name": "disabled::fail", "status": "fail", "duration_ms": value})
            for value in (11, 13)
        )
        + "\n",
        encoding="utf-8",
    )

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(
        "report:\n  include_why_why: false\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"

    for attr, value in {
        "LOG": log_path,
        "REPORT": report_path,
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    analyze.main()

    contents = report_path.read_text(encoding="utf-8")

    assert "- Failures: 2" in contents
    assert "## Why-Why" not in contents


def test_main_removes_existing_issue_notes_when_suggestions_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "failures.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "disabled::fail", "status": "fail", "duration_ms": 15})
        + "\n",
        encoding="utf-8",
    )

    issue_path = tmp_path / "reports" / "issue_suggestions.md"
    issue_path.parent.mkdir(parents=True)
    issue_path.write_text("既存のメモ", encoding="utf-8")

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text("actions:\n  suggest_issues: false\n", encoding="utf-8")

    report_path = tmp_path / "reports" / "today.md"

    for attr, value in {
        "LOG": log_path,
        "REPORT": report_path,
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    analyze.main()

    assert not issue_path.exists()


def test_main_uses_reflection_manifest_to_skip_issue_suggestions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "failures.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "disabled::fail", "status": "fail", "duration_ms": 15})
        + "\n",
        encoding="utf-8",
    )

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text("actions:\n  suggest_issues: false\n", encoding="utf-8")

    manifest = analyze.load_reflection_manifest(reflection_path)
    assert manifest.get("actions", {}).get("suggest_issues") is False

    issue_path = tmp_path / "reports" / "issue_suggestions.md"

    for attr, value in {
        "LOG": log_path,
        "REPORT": tmp_path / "reports" / "today.md",
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    analyze.main()

    assert not issue_path.exists()


def test_main_passes_loaded_manifest_to_issue_suggestions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "failures.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "case::fail", "status": "fail", "duration_ms": 10})
        + "\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"

    for attr, value in {
        "LOG": log_path,
        "REPORT": report_path,
        "ISSUE_OUT": issue_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    manifest_data: dict[str, object] = {
        "actions": {"suggest_issues": True},
        "report": {},
    }

    calls: dict[str, object] = {}

    def _load_manifest_stub() -> dict[str, object]:
        calls["manifest_calls"] = int(calls.get("manifest_calls", 0)) + 1
        return manifest_data

    def _report_path_stub(*, manifest: dict[str, object], **_kwargs: object) -> Path:
        calls["report_manifest"] = manifest
        return tmp_path / "reports" / "custom.md"

    def _include_why_stub(*, manifest: dict[str, object], **_kwargs: object) -> bool:
        calls["include_manifest"] = manifest
        return False

    def _suggest_issues_stub(*, manifest: dict[str, object], **_kwargs: object) -> bool:
        calls["issue_manifest"] = manifest
        return False

    monkeypatch.setattr(analyze, "load_reflection_manifest", _load_manifest_stub)
    monkeypatch.setattr(analyze, "load_report_output_path", _report_path_stub)
    monkeypatch.setattr(analyze, "load_report_include_why", _include_why_stub)
    monkeypatch.setattr(analyze, "load_actions_suggest_issues", _suggest_issues_stub)

    analyze.main()

    assert calls.get("manifest_calls") == 1
    assert calls.get("report_manifest") is manifest_data
    assert calls.get("include_manifest") is manifest_data
    assert calls.get("issue_manifest") is manifest_data


def test_main_writes_report_to_custom_manifest_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "empty.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text("", encoding="utf-8")
    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(
        "report:\n  output: reports/custom.md\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(analyze, "LOG", log_path)
    monkeypatch.setattr(analyze, "REPORT", tmp_path / "reports" / "today.md")
    monkeypatch.setattr(analyze, "REFLECTION_MANIFEST", reflection_path)
    monkeypatch.setattr(analyze, "BASE_DIR", tmp_path)

    analyze.main()
    custom_report = tmp_path / "reports" / "custom.md"
    assert custom_report.exists()
    contents = custom_report.read_text(encoding="utf-8")
    assert "Total tests: 0" in contents


def test_main_prefers_manifest_output_over_report_constant(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "failures.jsonl"
    log_path.parent.mkdir(parents=True)
    log_path.write_text(
        json.dumps({"name": "case::fail", "status": "fail", "duration_ms": 12})
        + "\n",
        encoding="utf-8",
    )

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(
        "report:\n  output: reports/custom.md\n",
        encoding="utf-8",
    )

    default_report = tmp_path / "reports" / "today.md"

    for attr, value in {
        "LOG": log_path,
        "REPORT": default_report,
        "ISSUE_OUT": tmp_path / "reports" / "issue_suggestions.md",
        "REFLECTION_MANIFEST": reflection_path,
        "BASE_DIR": tmp_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    analyze.main()

    custom_report = tmp_path / "reports" / "custom.md"
    assert custom_report.exists()
    assert not default_report.exists()

def test_main_skips_why_why_section_when_disabled(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    log_path = tmp_path / "logs" / "failures.jsonl"
    log_path.parent.mkdir(parents=True)
    entries = [
        {"name": "disabled::fail", "status": "fail", "duration_ms": 10},
        {"name": "disabled::fail", "status": "fail", "duration_ms": 12},
    ]
    log_path.write_text(
        "\n".join(json.dumps(entry) for entry in entries) + "\n",
        encoding="utf-8",
    )

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(
        "report:\n  include_why_why: false\n",
        encoding="utf-8",
    )

    report_path = tmp_path / "reports" / "today.md"
    issue_path = tmp_path / "reports" / "issue_suggestions.md"

    for attr, value in {
        "LOG": log_path,
        "REPORT": report_path,
        "ISSUE_OUT": issue_path,
        "REFLECTION_MANIFEST": reflection_path,
    }.items():
        monkeypatch.setattr(analyze, attr, value)

    analyze.main()

    contents = report_path.read_text(encoding="utf-8")

    assert "- Failures: 2" in contents
    assert "## Why-Why (draft)" not in contents


def test_main_generates_report_when_yaml_unavailable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze = load_analyze_module()

    reflection_path = tmp_path / "reflection.yaml"
    reflection_path.write_text(
        'report:\n  output: "reports/#1.md"  # comment\n',
        encoding="utf-8",
    )

    logs_path = tmp_path / "logs" / "test.jsonl"
    logs_path.parent.mkdir(parents=True, exist_ok=True)
    logs_path.write_text("", encoding="utf-8")

    monkeypatch.setattr(analyze, "BASE_DIR", tmp_path)
    monkeypatch.setattr(analyze, "DEFAULT_LOG", logs_path)
    monkeypatch.setattr(analyze, "LOG", logs_path)
    monkeypatch.setattr(analyze, "DEFAULT_REPORT", tmp_path / "reports" / "today.md")
    monkeypatch.setattr(analyze, "REPORT", tmp_path / "reports" / "today.md")
    monkeypatch.setattr(
        analyze, "ISSUE_OUT", tmp_path / "reports" / "issue_suggestions.md"
    )
    monkeypatch.setattr(analyze, "REFLECTION_MANIFEST", reflection_path)

    import builtins

    real_import = builtins.__import__

    def _disabled_import(name: str, *args: object, **kwargs: object):
        if name == "yaml":
            raise ModuleNotFoundError("yaml disabled for test")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _disabled_import)

    analyze.main()

    report_path = tmp_path / "reports" / "#1.md"
    assert report_path.exists()
