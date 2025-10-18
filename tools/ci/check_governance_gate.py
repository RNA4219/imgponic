from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path
from typing import Iterable, Sequence

DEFAULT_DIFF_REFSPECS: Sequence[str] = ("origin/main...", "main...", "HEAD")
INTENT_PATTERN = re.compile(r"Intent\s*[：:]\s*INT-[0-9A-Z]+(?:-[0-9A-Z]+)*", re.IGNORECASE)
EVALUATION_HEADING_PATTERN = re.compile(r"^#{2,6}\s*EVALUATION\b", re.IGNORECASE | re.MULTILINE)
EVALUATION_ANCHOR_PATTERN = re.compile(r"\[Acceptance Criteria\]\((?:\.\./)?EVALUATION\.md?#acceptance-criteria\)|\[Acceptance Criteria\]\(#acceptance-criteria\)", re.IGNORECASE)
PRIORITY_PATTERN = re.compile(r"Priority\s*Score\s*:\s*\d+(?:\.\d+)?", re.IGNORECASE)


def load_forbidden_patterns(policy_path: Path) -> list[str]:
    if not policy_path.exists():
        return []

    patterns: list[str] = []
    in_self_modification = False
    in_forbidden_paths = False
    current_indent: int | None = None

    for raw_line in policy_path.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))

        if stripped.endswith(":"):
            key = stripped[:-1].strip()
            if indent == 0:
                in_self_modification = key == "self_modification"
                in_forbidden_paths = False
                current_indent = None
            elif in_self_modification and key == "forbidden_paths":
                in_forbidden_paths = True
                current_indent = indent
            elif indent <= (current_indent or indent):
                in_forbidden_paths = False
            continue

        if in_self_modification and in_forbidden_paths and stripped.startswith("- "):
            value = stripped[2:].strip()
            if value and value[0] in {'"', "'"} and value[-1] == value[0]:
                value = value[1:-1]
            if value:
                patterns.append(value.lstrip("/"))
            continue

        if in_forbidden_paths and indent <= (current_indent or indent):
            in_forbidden_paths = False

    return patterns


def _run_git_diff(refspec: str) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", refspec],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def collect_changed_paths(refspecs: Sequence[str] = DEFAULT_DIFF_REFSPECS) -> list[str]:
    last_error: subprocess.CalledProcessError | None = None
    for refspec in refspecs:
        try:
            return _run_git_diff(refspec)
        except subprocess.CalledProcessError as error:
            last_error = error
    if last_error is not None:
        raise last_error
    return []


def find_forbidden_matches(paths: Iterable[str], patterns: Sequence[str]) -> list[str]:
    matches: list[str] = []
    for path in paths:
        normalized = path.lstrip("./")
        for pattern in patterns:
            if fnmatch(normalized, pattern):
                matches.append(normalized)
                break
    return matches


def read_event_body(event_path: Path) -> str | None:
    if not event_path.exists():
        return None
    payload = json.loads(event_path.read_text(encoding="utf-8"))
    pull_request = payload.get("pull_request")
    if isinstance(pull_request, dict):
        body = pull_request.get("body")
        if isinstance(body, str):
            return body
    return None


def _read_file(path: Path) -> str | None:
    if not path.exists():
        print(f"PR body file not found: {path}", file=sys.stderr)
        return None
    return path.read_text(encoding="utf-8")


def resolve_pr_body(*, cli_body: str | None = None, cli_body_path: Path | None = None) -> str | None:
    if cli_body is not None:
        return cli_body
    if cli_body_path is not None:
        return _read_file(cli_body_path)

    env_body = os.environ.get("PR_BODY")
    if env_body is not None:
        return env_body

    env_body_path = os.environ.get("PR_BODY_PATH")
    if env_body_path:
        return _read_file(Path(env_body_path))

    event_path_value = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path_value:
        print("PR body data is unavailable. Set PR_BODY or GITHUB_EVENT_PATH.", file=sys.stderr)
        return None

    event_body = read_event_body(Path(event_path_value))
    if event_body is None:
        print("PR body data is unavailable. Set PR_BODY or GITHUB_EVENT_PATH.", file=sys.stderr)
    return event_body


def validate_pr_body(body: str | None) -> bool:
    text = body or ""
    success = True

    if not INTENT_PATTERN.search(text):
        print("PR body must include 'Intent: INT-xxx'", file=sys.stderr)
        success = False

    has_heading = bool(EVALUATION_HEADING_PATTERN.search(text))
    has_anchor = bool(EVALUATION_ANCHOR_PATTERN.search(text))
    if not has_heading or not has_anchor:
        print("PR must reference EVALUATION (acceptance) anchor", file=sys.stderr)
        success = False

    if not PRIORITY_PATTERN.search(text):
        print(
            "Consider adding 'Priority Score: <number>' based on prioritization.yaml",
            file=sys.stderr,
        )

    return success


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Governance gate checks")
    parser.add_argument("--pr-body", help="PR本文を直接指定")
    parser.add_argument("--pr-body-path", type=Path, help="PR本文ファイル")
    return parser.parse_args(list(argv))


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or ())
    repo_root = Path(__file__).resolve().parents[2]
    policy_path = repo_root / "governance" / "policy.yaml"
    forbidden_patterns = load_forbidden_patterns(policy_path)

    try:
        changed_paths = collect_changed_paths()
    except subprocess.CalledProcessError as error:
        print(f"Failed to collect changed paths: {error}", file=sys.stderr)
        return 1

    violations = find_forbidden_matches(changed_paths, forbidden_patterns)
    if violations:
        print(
            "Forbidden path modifications detected:\n" + "\n".join(f" - {path}" for path in violations),
            file=sys.stderr,
        )
        return 1

    body = resolve_pr_body(cli_body=args.pr_body, cli_body_path=args.pr_body_path)
    if body is None:
        return 1

    if not validate_pr_body(body):
        return 1

    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(tuple(sys.argv[1:])))
