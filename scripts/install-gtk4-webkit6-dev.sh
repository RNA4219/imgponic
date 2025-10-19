#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  SUDO=()
elif command -v sudo >/dev/null 2>&1; then
  SUDO=(sudo)
else
  echo "このスクリプトの実行には管理者権限が必要です。rootで実行するかsudoを用意してください。" >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive "${SUDO[@]}" apt-get update
  DEBIAN_FRONTEND=noninteractive "${SUDO[@]}" apt-get install -y \
    build-essential pkg-config cmake \
    libglib2.0-dev libgtk-3-dev \
    libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev \
    libsoup2.4-dev libsoup-3.0-dev libgdk-pixbuf-2.0-dev libpango1.0-dev libcairo2-dev
elif command -v dnf >/dev/null 2>&1; then
  "${SUDO[@]}" dnf groupinstall -y "Development Tools"
  "${SUDO[@]}" dnf install -y \
    glib2-devel gtk3-devel \
    webkit2gtk4.1-devel javascriptcoregtk4.1-devel \
    libsoup-devel libsoup3-devel gdk-pixbuf2-devel pango-devel cairo-devel
elif command -v pacman >/dev/null 2>&1; then
  "${SUDO[@]}" pacman -S --needed --noconfirm base-devel \
    glib2 gtk3 webkit2gtk-4.1 javascriptcoregtk-4.1 libsoup \
    gdk-pixbuf2 pango cairo
else
  echo "Unsupported distro. Use Ubuntu 24.04+ or a container." >&2
  exit 1
fi

pkg-config --modversion glib-2.0 gtk+-3.0 webkit2gtk-4.1 javascriptcoregtk-4.1 libsoup-2.4 libsoup-3.0
