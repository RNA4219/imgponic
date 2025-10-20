# Tauri 2 / GTK4 移行調査メモ

## 現状整理

`cargo check --all-targets 2>&1 | tee target/tauri-api-diff.log` を実行したところ、
`glib-sys v0.18.1` のビルドスクリプトが `glib-2.0` の pkg-config エントリを検出できず終了した。
Linux 向け GTK4 依存関係の導入が未完了であるため、Tauri 2 API 差分の検証には至っていない。

アプリケーションエントリ（`src/main.rs`）では `configure_builder` が `tauri::Builder<R>` を引数・戻り値に
取り、Tauri 2 の `Runtime` 要件と整合している。
`apply_linux_overrides` は GTK4/Wayland 環境向けに X11 固有 API を排し、プラグイン初期化も v2 系のデフォ
ルトシグネチャで動作する想定のまま維持されている。

## 未完了タスク

- GTK4 を利用する Linux ビルド環境で `glib-2.0.pc` を提供し、`cargo check` がアプリケーションコードまで到達する状態を整える。

## 条件付きビルド方針

- `run_ollama_stream_impl`（`src/lib.rs`）: `#[cfg(feature = "gtk4")]` で GTK4 ビルド時のみ有効化。
- `run_ollama_stream`（`src/lib.rs`）: `#[cfg(feature = "gtk4")]` を共有し、`run_ollama_stream_impl` と同一条件
  で公開。
- `abort_current_stream`（`src/lib.rs`）: `#[cfg(feature = "gtk4")]` を共有し、`run_ollama_stream` と同条件で公
  開。
- `run_ollama_stream_cmd` / `abort_current_stream_cmd`（`src/main.rs`）: いずれも `#[cfg(feature = "gtk4")]` に
  より GTK4 ビルド時のみコンパイルされ、`#[tauri::command]` 属性は GTK4 有効時のみに適用される。
- `workspace_path` / `read_workspace` / `write_workspace`（`src/main.rs`）: `#[cfg(any(feature = "gtk4", feature = \
  "gtk4_compat"))]` と `#[cfg_attr(any(feature = "gtk4", feature = "gtk4_compat"), tauri::command)]` を使用し
  て GTK4 系のビルドでのみ公開。
- `configure_builder`（`src/main.rs`）: `#[cfg(any(feature = "gtk4", feature = "gtk4_compat"))]` で GTK4 有効時の
  み GUI ビルドを構成。

GTK4 ビルド専用コマンド群はいずれも `#[cfg(feature = "gtk4")]` を共有し、公開条件が揃っている。
