# Tauri 2 / GTK4 移行調査メモ

- ビルドログ
  - `cargo check --all-targets 2>&1 | tee target/tauri-api-diff.log` を実行した結果、`glib-sys v0.18.1` のビルドスクリプトが `glib-2.0` の pkg-config エントリを検出できず終了。Linux 用 GTK4 依存関係の導入が未完了のため後続の Tauri 2 API 差分は未評価。
- アプリケーションエントリ（`src/main.rs`）
  - 本リポジトリでは `src-tauri/` ではなく `src/main.rs` がエントリーポイント。`configure_builder` はジェネリックな `tauri::Builder<R>` を引数・戻り値に取り、Tauri 2 が要求する `Runtime` パラメータと整合。
  - `apply_linux_overrides` は GTK4/Wayland 環境向けに X11 固有 API を廃しており、現状ビルダーに追加入力を行っていない。
  - プラグイン初期化は `tauri_plugin_fs::init()` / `tauri_plugin_dialog::init()` / `tauri_plugin_clipboard_manager::init()` をそのまま呼び出しており、各プラグイン v2 系のデフォルトシグネチャで動作する想定。
- 今後の確認対象
  - GTK4 を利用する Linux ビルド環境で `glib-2.0.pc` を提供し、`cargo check` がアプリケーションコードまで到達する状態を整える。

## 条件付きビルド方針

- `run_ollama_stream_impl`（`src/main.rs`）: `#[cfg(feature = "gtk4")]` / `#[cfg_attr(feature = "gtk4", tauri::command)]` を両方付与済み。
- `run_ollama_stream`（`src/main.rs`）:  `#[cfg_attr(feature = "gtk4", tauri::command)]` のみ。`#[cfg(feature = "gtk4")]` を追加する必要がある。
- `abort_current_stream`（`src/main.rs`）: `#[cfg_attr(feature = "gtk4", tauri::command)]` は存在するが、`#[cfg(feature = "gtk4")]` が欠落しており今後の修正対象。
- `workspace_path` / `read_workspace` / `write_workspace`（`src/main.rs`）: `#[cfg(any(feature = "gtk4", feature = "gtk4_compat"))]` と `#[cfg_attr(any(feature = "gtk4", feature = "gtk4_compat"), tauri::command)]` を使用して GTK4 系のビルドでのみ公開。
- `configure_builder`（`src/main.rs`）: `#[cfg(any(feature = "gtk4", feature = "gtk4_compat"))]` で GTK4 有効時のみ GUI ビルドを構成。

特に `abort_current_stream` への `#[cfg(feature = "gtk4")]` 付与漏れは GTK4 ビルド専用コマンド群との整合性を欠くため、後続作業での是正が必要。
