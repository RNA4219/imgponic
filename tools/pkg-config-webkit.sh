#!/usr/bin/env bash
set -euo pipefail

real_pkg_config=$(command -v pkg-config || true)
if [[ -z "${real_pkg_config}" ]]; then
  echo "pkg-config binary not found" >&2
  exit 127
fi

declare -A mappings=(
  ["javascriptcoregtk-4.0"]="javascriptcoregtk-6.0"
  ["javascriptcoregtk-4.1"]="javascriptcoregtk-6.0"
  ["webkit2gtk-4.0"]="webkitgtk-6.0"
  ["webkit2gtk-4.1"]="webkitgtk-6.0"
)

args=("$@")
matched_keys=()
for key in "${!mappings[@]}"; do
  for arg in "${args[@]}"; do
    if [[ "${arg}" == *"${key}"* ]]; then
      matched_keys+=("${key}")
      break
    fi
  done
done

if [[ "${#matched_keys[@]}" -eq 0 ]]; then
  exec "${real_pkg_config}" "${args[@]}"
fi

all_present=true
for key in "${matched_keys[@]}"; do
  if ! "${real_pkg_config}" --exists "${key}"; then
    all_present=false
    break
  fi
done

if [[ "${all_present}" == true ]]; then
  exec "${real_pkg_config}" "${args[@]}"
fi

translated_args=()
for arg in "${args[@]}"; do
  translated="${arg}"
  for key in "${matched_keys[@]}"; do
    translated="${translated//${key}/${mappings[$key]}}"
  done
  translated_args+=("${translated}")
done

translated_keys=()
for key in "${matched_keys[@]}"; do
  translated_keys+=("${mappings[$key]}" )
done

all_translated_present=true
for key in "${translated_keys[@]}"; do
  if ! "${real_pkg_config}" --exists "${key}"; then
    all_translated_present=false
    break
  fi
done

if [[ "${all_translated_present}" == true ]]; then
  exec "${real_pkg_config}" "${translated_args[@]}"
fi

exec "${real_pkg_config}" "${args[@]}"
