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

WEBKIT_PKG_CONFIG=(webkitgtk-6.0 javascriptcoregtk-6.0)

if command -v apt-get >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive "${SUDO[@]}" apt-get update

  common_pkgs=(
    build-essential
    pkg-config
    cmake
    libglib2.0-dev
    libgtk-4-dev
    libgdk-pixbuf-2.0-dev
    libpango1.0-dev
    libcairo2-dev
  )

  deb_webkit6=(
    libwebkitgtk-6.0-dev
    libjavascriptcoregtk-6.0-dev
    libsoup-3.0-dev
  )
  deb_webkit41=(
    libwebkit2gtk-4.1-dev
    libjavascriptcoregtk-4.1-dev
    libsoup-3.0-dev
  )

  if apt-cache show libwebkitgtk-6.0-dev >/dev/null 2>&1; then
    selected_pkgs=("${common_pkgs[@]}" "${deb_webkit6[@]}")
    WEBKIT_PKG_CONFIG=(webkitgtk-6.0 javascriptcoregtk-6.0)
  else
    selected_pkgs=("${common_pkgs[@]}" "${deb_webkit41[@]}")
    WEBKIT_PKG_CONFIG=(webkit2gtk-4.1 javascriptcoregtk-4.1)
  fi

  DEBIAN_FRONTEND=noninteractive "${SUDO[@]}" apt-get install -y "${selected_pkgs[@]}"
elif command -v dnf >/dev/null 2>&1; then
  "${SUDO[@]}" dnf groupinstall -y "Development Tools"

  dnf_webkit6=(
    webkitgtk6.0-devel
    javascriptcoregtk6.0-devel
  )
  dnf_webkit41=(
    webkit2gtk4.1-devel
    javascriptcoregtk4.1-devel
  )

  if dnf info webkitgtk6.0-devel >/dev/null 2>&1; then
    selected_pkgs=(glib2-devel gtk4-devel libsoup3-devel gdk-pixbuf2-devel pango-devel cairo-devel "${dnf_webkit6[@]}")
    WEBKIT_PKG_CONFIG=(webkitgtk-6.0 javascriptcoregtk-6.0)
  else
    selected_pkgs=(glib2-devel gtk4-devel libsoup3-devel gdk-pixbuf2-devel pango-devel cairo-devel "${dnf_webkit41[@]}")
    WEBKIT_PKG_CONFIG=(webkit2gtk-4.1 javascriptcoregtk-4.1)
  fi

  "${SUDO[@]}" dnf install -y "${selected_pkgs[@]}"
elif command -v pacman >/dev/null 2>&1; then
  "${SUDO[@]}" pacman -S --needed --noconfirm base-devel

  pacman_common=(
    glib2
    gtk4
    # Arch では libsoup-3.0.pc を提供する libsoup3 パッケージが必要。
    libsoup3
    gdk-pixbuf2
    pango
    cairo
  )

  if pacman -Si webkitgtk-6.0 >/dev/null 2>&1; then
    # Arch 系 webkitgtk-6.0 パッケージには javascriptcoregtk-6.0.pc も同梱されるため、
    # pacman では webkitgtk-6.0 のみをインストールしつつ、pkg-config 検証は .pc の提供前提で維持する。
    WEBKIT_PKG_CONFIG=(webkitgtk-6.0 javascriptcoregtk-6.0)
    pacman_webkit=(webkitgtk-6.0)
  else
    # webkit2gtk-4.1 も javascriptcoregtk-4.1.pc を提供するので、同じ前提で検証を継続する。
    WEBKIT_PKG_CONFIG=(webkit2gtk-4.1 javascriptcoregtk-4.1)
    pacman_webkit=(webkit2gtk-4.1)
  fi

  "${SUDO[@]}" pacman -S --needed --noconfirm "${pacman_common[@]}" "${pacman_webkit[@]}"
else
  echo "Unsupported distro. Use Ubuntu 24.04+ or a container." >&2
  exit 1
fi

pkg-config --modversion glib-2.0 gtk4 "${WEBKIT_PKG_CONFIG[@]}" libsoup-3.0
