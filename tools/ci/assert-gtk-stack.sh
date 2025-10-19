#!/usr/bin/env bash
set -euo pipefail

# Ensure GTK4 development files are available.
if ! pkg-config --exists gtk4; then
  echo "error: gtk4 development files are not available via pkg-config" >&2
  exit 1
fi

# Ensure WebKit6 development files are available.
if ! pkg-config --exists webkitgtk-6.0; then
  echo "error: webkitgtk-6.0 development files are not available via pkg-config" >&2
  exit 1
fi

echo "GTK4/WebKit6 stack check passed: gtk4 and webkitgtk-6.0 detected."
