#!/usr/bin/env bash
set -euo pipefail

if ! pkg-config --exists gtk+-3.0; then
  echo "error: gtk+-3.0 development files are not available via pkg-config" >&2
  exit 1
fi

if pkg-config --exists gtk4; then
  echo "GTK stack check passed: gtk+-3.0 available and gtk4 detected."
else
  echo "GTK stack check passed: gtk+-3.0 available (gtk4 optional)."
fi
