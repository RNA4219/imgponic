use std::fs;

#[test]
fn abort_current_stream_is_gtk4_gated() {
    let source = fs::read_to_string("src/main.rs").expect("src/main.rs should be readable");

    assert!(
        source.contains("#[cfg(feature = \"gtk4\")] async fn abort_current_stream"),
        "abort_current_stream should be guarded by #[cfg(feature = \"gtk4\")]"
    );
}
