#!/usr/bin/env bash
set -euo pipefail
need(){ command -v "$1" >/dev/null 2>&1; }

if need apt-get; then
  sudo apt-get update
  sudo apt-get install -y \
    build-essential pkg-config cmake \
    libglib2.0-dev libgtk-3-dev libgtk-4-dev \
    libwebkitgtk-6.0-dev libjavascriptcoregtk-6.0-dev \
    libsoup-3.0-dev libgdk-pixbuf-2.0-dev libpango1.0-dev libcairo2-dev
elif need dnf; then
  sudo dnf -y groupinstall "Development Tools"
  sudo dnf -y install \
    glib2-devel gtk3-devel gtk4-devel \
    webkitgtk6-devel javascriptcoregtk6-devel \
    libsoup3-devel gdk-pixbuf2-devel pango-devel cairo-devel
elif need pacman; then
  sudo pacman -S --needed --noconfirm base-devel \
    glib2 gtk3 gtk4 webkitgtk-6.0 javascriptcoregtk-6.0 libsoup3 \
    gdk-pixbuf2 pango cairo
else
  echo "Unsupported distro. Use Ubuntu 24.04+ or a container." >&2
  exit 1
fi

# sanity check
pkg-config --modversion glib-2.0
pkg-config --modversion gdk-3.0
pkg-config --modversion gtk4
pkg-config --modversion webkitgtk-6.0
pkg-config --modversion javascriptcoregtk-6.0
pkg-config --modversion libsoup-3.0
