from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.codemap import update


def test_ensure_python_version_exits(monkeypatch, capsys):
    monkeypatch.setattr(update, "sys", SimpleNamespace(version_info=(3, 10, 0)))

    with pytest.raises(SystemExit) as excinfo:
        update.ensure_python_version()

    assert excinfo.value.code == 1
    captured = capsys.readouterr()
    assert "Python 3.11 or newer is required" in captured.out


def test_run_update_injects_front_matter_into_birdseye(tmp_path):
    root = tmp_path
    birdseye_dir = root / "docs" / "birdseye"
    caps_dir = birdseye_dir / "caps"
    caps_dir.mkdir(parents=True)

    index_path = birdseye_dir / "index.json"
    index_path.write_text(
        (
            "{\n"
            "  \"generated_at\": \"2025-10-16T12:00:00Z\",\n"
            "  \"nodes\": {\n"
            "    \"README.md\": {\n"
            "      \"role\": \"overview\",\n"
            "      \"caps\": \"docs/birdseye/caps/README.md.json\",\n"
            "      \"mtime\": \"2025-10-15T20:45:30Z\"\n"
            "    }\n"
            "  },\n"
            "  \"edges\": []\n"
            "}\n"
        ),
        encoding="utf-8",
    )

    capsule_path = caps_dir / "README.md.json"
    capsule_path.write_text(
        (
            "{\n"
            "  \"id\": \"README.md\",\n"
            "  \"role\": \"overview\",\n"
            "  \"public_api\": [],\n"
            "  \"summary\": \"...\",\n"
            "  \"deps_out\": [],\n"
            "  \"deps_in\": [],\n"
            "  \"risks\": [],\n"
            "  \"tests\": []\n"
            "}\n"
        ),
        encoding="utf-8",
    )

    markdown = (
        "---\n"
        "intent_id: INT-001\n"
        "owner: qa-team\n"
        "status: active   # draft|active|deprecated\n"
        "last_reviewed_at: 2025-10-14\n"
        "next_review_due: 2025-11-14\n"
        "---\n"
        "# README\n"
    )
    (root / "README.md").write_text(markdown, encoding="utf-8")

    options = update.UpdateOptions(targets=(root,), emit="index+caps")

    update.run_update(options)

    updated_index = json.loads(index_path.read_text(encoding="utf-8"))
    updated_capsule = json.loads(capsule_path.read_text(encoding="utf-8"))

    assert updated_index["generated_at"] != "2025-10-16T12:00:00Z"
    assert updated_index["nodes"]["README.md"]["metadata"] == {
        "intent_id": "INT-001",
        "owner": "qa-team",
        "status": "active",
        "last_reviewed_at": "2025-10-14",
        "next_review_due": "2025-11-14",
    }
    assert updated_capsule["metadata"] == {
        "intent_id": "INT-001",
        "owner": "qa-team",
        "status": "active",
        "last_reviewed_at": "2025-10-14",
        "next_review_due": "2025-11-14",
    }


def test_run_update_emit_index_only(tmp_path):
    root = tmp_path
    birdseye_dir = root / "docs" / "birdseye"
    caps_dir = birdseye_dir / "caps"
    caps_dir.mkdir(parents=True)

    index_path = birdseye_dir / "index.json"
    index_path.write_text(
        (
            "{\n"
            "  \"generated_at\": \"2025-10-16T12:00:00Z\",\n"
            "  \"nodes\": {\n"
            "    \"README.md\": {\n"
            "      \"role\": \"overview\",\n"
            "      \"caps\": \"docs/birdseye/caps/README.md.json\",\n"
            "      \"mtime\": \"2025-10-15T20:45:30Z\"\n"
            "    }\n"
            "  },\n"
            "  \"edges\": []\n"
            "}\n"
        ),
        encoding="utf-8",
    )

    capsule_path = caps_dir / "README.md.json"
    original_capsule = (
        "{\n"
        "  \"id\": \"README.md\",\n"
        "  \"role\": \"overview\",\n"
        "  \"public_api\": [],\n"
        "  \"summary\": \"...\",\n"
        "  \"deps_out\": [],\n"
        "  \"deps_in\": [],\n"
        "  \"risks\": [],\n"
        "  \"tests\": []\n"
        "}\n"
    )
    capsule_path.write_text(original_capsule, encoding="utf-8")

    markdown = (
        "---\n"
        "intent_id: INT-002\n"
        "owner: qa-team\n"
        "status: draft\n"
        "---\n"
        "# README\n"
    )
    (root / "README.md").write_text(markdown, encoding="utf-8")

    options = update.UpdateOptions(targets=(root,), emit="index")

    update.run_update(options)

    updated_index = json.loads(index_path.read_text(encoding="utf-8"))
    updated_capsule = capsule_path.read_text(encoding="utf-8")

    assert updated_index["nodes"]["README.md"]["metadata"] == {
        "intent_id": "INT-002",
        "owner": "qa-team",
        "status": "draft",
    }
    assert updated_capsule == original_capsule

