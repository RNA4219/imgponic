use std::fs;

#[test]
fn tauri_builder_uses_new_constructor() {
    let source = fs::read_to_string("src/main.rs").expect("src/main.rs should be readable");

    assert!(
        source.contains("configure_builder(tauri::Builder::new())"),
        "src/main.rs should construct the builder with tauri::Builder::new()"
    );

    assert!(
        !source.contains("configure_builder(tauri::Builder::default())"),
        "legacy tauri::Builder::default() flow should be removed"
    );
}
