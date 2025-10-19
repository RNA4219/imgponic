# Tauri 2 / GTK4 移行調査メモ

- ビルドログ
  - `cargo check --all-targets 2>&1 | tee target/tauri-api-diff.log` を実行した結果、`glib-sys v0.18.1` のビルドスクリプトが `glib-2.0` の pkg-config エントリを検出できず終了。Linux 用 GTK4 依存関係の導入が未完了のため後続の Tauri 2 API 差分は未評価。
- アプリケーションエントリ（`src/main.rs`）
  - 本リポジトリでは `src-tauri/` ではなく `src/main.rs` がエントリーポイント。`configure_builder` はジェネリックな `tauri::Builder<R>` を引数・戻り値に取り、Tauri 2 が要求する `Runtime` パラメータと整合。
  - `apply_linux_overrides` は GTK4/Wayland 環境向けに X11 固有 API を廃しており、現状ビルダーに追加入力を行っていない。
  - プラグイン初期化は `tauri_plugin_fs::init()` / `tauri_plugin_dialog::init()` / `tauri_plugin_clipboard_manager::init()` をそのまま呼び出しており、各プラグイン v2 系のデフォルトシグネチャで動作する想定。
- 今後の確認対象
  - GTK4 を利用する Linux ビルド環境で `glib-2.0.pc` を提供し、`cargo check` がアプリケーションコードまで到達する状態を整える。
