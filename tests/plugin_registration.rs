use promptforge::configure_builder;
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

fn build_app() -> tauri::App<MockRuntime> {
    configure_builder(mock_builder())
        .build(mock_context(noop_assets()))
        .expect("failed to build mock app")
}

#[test]
fn fs_plugin_is_registered() {
    let app = build_app();
    let handle = app.handle();

    assert!(handle
        .try_state::<tauri_plugin_fs::Fs<MockRuntime>>()
        .is_some());
}

#[test]
fn dialog_plugin_is_registered() {
    let app = build_app();
    let handle = app.handle();

    assert!(handle
        .try_state::<tauri_plugin_dialog::Dialog<MockRuntime>>()
        .is_some());
}

#[test]
fn clipboard_plugin_is_registered() {
    let app = build_app();
    let handle = app.handle();

    assert!(handle
        .try_state::<tauri_plugin_clipboard_manager::Clipboard<MockRuntime>>()
        .is_some());
}
