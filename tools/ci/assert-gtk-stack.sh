#!/usr/bin/env bash
set -euo pipefail

if ! pkg-config --exists gtk4; then
  echo "error: gtk4 development files are not available via pkg-config" >&2
  exit 1
fi

if pkg-config --exists gtk+-3.0; then
  echo "error: gtk+-3.0 should not be present in the toolchain" >&2
  exit 1
fi

echo "GTK stack check passed: gtk4 available, gtk+-3.0 absent."
