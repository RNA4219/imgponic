#!/usr/bin/env bash
set -euo pipefail

# Ensure GTK4 development files are available.
if ! pkg-config --exists gtk4; then
  echo "error: gtk4 development files are not available via pkg-config" >&2
  exit 1
fi

# Ensure WebKit development files are available (prefer 6.0, allow 4.1 fallback).
if pkg-config --exists webkitgtk-6.0; then
  webkit_pkg="webkitgtk-6.0"
elif pkg-config --exists webkit2gtk-4.1; then
  webkit_pkg="webkit2gtk-4.1"
else
  echo "error: neither webkitgtk-6.0 nor webkit2gtk-4.1 development files are available via pkg-config" >&2
  exit 1
fi

echo "GTK4/WebKit stack check passed: gtk4 and ${webkit_pkg} detected."
