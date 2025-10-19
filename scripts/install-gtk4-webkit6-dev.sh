#!/usr/bin/env bash
set -euo pipefail

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y \
    build-essential pkg-config cmake \
    libglib2.0-dev libgtk-4-dev \
    libwebkitgtk-6.0-dev libjavascriptcoregtk-6.0-dev \
    libsoup-3.0-dev libgdk-pixbuf-2.0-dev libpango1.0-dev libcairo2-dev
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf groupinstall -y "Development Tools"
  sudo dnf install -y \
    glib2-devel gtk4-devel \
    webkitgtk6-devel javascriptcoregtk6-devel \
    libsoup3-devel gdk-pixbuf2-devel pango-devel cairo-devel
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --needed --noconfirm base-devel \
    glib2 gtk4 webkitgtk-6.0 javascriptcoregtk-6.0 libsoup3 \
    gdk-pixbuf2 pango cairo
else
  echo "Unsupported distro. Use Ubuntu 24.04+ or a container." >&2
  exit 1
fi

pkg-config --modversion glib-2.0 gtk4 webkitgtk-6.0 javascriptcoregtk-6.0 libsoup-3.0
