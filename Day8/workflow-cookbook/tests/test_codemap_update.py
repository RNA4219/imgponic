from __future__ import annotations

from types import SimpleNamespace

import pytest

from tools.codemap import update


def test_ensure_python_version_exits(monkeypatch, capsys):
    monkeypatch.setattr(update, "sys", SimpleNamespace(version_info=(3, 10, 0)))

    with pytest.raises(SystemExit) as excinfo:
        update.ensure_python_version()

    assert excinfo.value.code == 1
    captured = capsys.readouterr()
    assert "Python 3.11 or newer is required" in captured.out


def test_run_update_reports_missing_resources(tmp_path, capsys):
    absent_target = tmp_path / "absent"
    incomplete_target = tmp_path / "incomplete"
    incomplete_target.mkdir()
    complete_target = tmp_path / "complete"
    complete_target.mkdir()
    (complete_target / "index.json").write_text("{}", encoding="utf-8")
    (complete_target / "caps").mkdir()

    options = update.UpdateOptions(
        targets=(absent_target, incomplete_target, complete_target),
        emit="index",
    )

    update.run_update(options)

    output_lines = capsys.readouterr().out.strip().splitlines()

    assert f"[ERROR] {absent_target}: missing target" in output_lines
    assert f"[ERROR] {incomplete_target}: missing index.json" in output_lines
    assert f"[ERROR] {incomplete_target}: missing caps" in output_lines
    assert f"[OK] {complete_target}: resources ready" in output_lines
    assert f"[TODO] Analyse {absent_target}" in output_lines
    assert f"[TODO] Analyse {incomplete_target}" in output_lines
    assert f"[TODO] Analyse {complete_target}" in output_lines
    assert "[TODO] Emit artefacts: index" in output_lines

