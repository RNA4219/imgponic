fn main() {
    if std::env::var_os("CARGO_FEATURE_GTK4").is_some() {
        tauri_build::build();
    }
}
