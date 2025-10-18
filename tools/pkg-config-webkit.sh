#!/usr/bin/env bash
set -euo pipefail

real_pkg_config=$(command -v pkg-config || true)
if [[ -z "${real_pkg_config}" ]]; then
  echo "pkg-config binary not found" >&2
  exit 127
fi

args=("$@")
needs_translation=false
for arg in "${args[@]}"; do
  if [[ "${arg}" == *"javascriptcoregtk-4.0"* ]]; then
    needs_translation=true
    break
  fi
done

if [[ "${needs_translation}" == false ]]; then
  exec "${real_pkg_config}" "${args[@]}"
fi

if "${real_pkg_config}" --exists javascriptcoregtk-4.0; then
  exec "${real_pkg_config}" "${args[@]}"
fi

translated_args=()
for arg in "${args[@]}"; do
  translated_args+=("${arg//javascriptcoregtk-4.0/javascriptcoregtk-4.1}")
done

if "${real_pkg_config}" --exists javascriptcoregtk-4.1; then
  exec "${real_pkg_config}" "${translated_args[@]}"
fi

exec "${real_pkg_config}" "${args[@]}"
