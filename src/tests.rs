use std::fs;
use std::path::{Path, PathBuf};

use hex::encode;
use sha2::{Digest, Sha256};
use tempfile::tempdir_in;

pub use super::_compose_prompt;

fn ensure_corpus_dir() -> PathBuf {
    let base = PathBuf::from("corpus");
    if !base.exists() {
        fs::create_dir_all(&base).expect("failed to create corpus dir");
    }
    base
}

fn to_forward_slash(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[test]
fn load_txt_excerpt_without_limit_returns_full_content() {
    let base = ensure_corpus_dir();
    let temp = tempdir_in(&base).expect("failed to create tempdir");
    let file_path = temp.path().join("sample.txt");
    let content = "Alpha\nBeta\nGamma";
    fs::write(&file_path, content).expect("failed to write sample");

    let rel = file_path.strip_prefix(&base).expect("strip corpus prefix");
    let rel_str = to_forward_slash(rel);

    let result = super::load_txt_excerpt(rel_str.clone(), None).expect("load excerpt");
    let canonical = file_path.canonicalize().expect("canonicalize file");

    assert_eq!(result.path, canonical.to_string_lossy());
    assert_eq!(result.size_bytes, content.as_bytes().len() as u64);
    assert_eq!(result.used_bytes, content.as_bytes().len() as u64);
    assert!(!result.truncated);
    assert_eq!(result.excerpt, content);

    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    assert_eq!(result.sha256, encode(hasher.finalize()));

    drop(temp);
}

#[test]
fn load_txt_excerpt_applies_head_tail_with_limit() {
    let base = ensure_corpus_dir();
    let temp = tempdir_in(&base).expect("failed to create tempdir");
    let file_path = temp.path().join("long.txt");
    let content = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    fs::write(&file_path, content).expect("failed to write long file");

    let rel = file_path.strip_prefix(&base).expect("strip corpus prefix");
    let rel_str = to_forward_slash(rel);

    let max_bytes = 20;
    let result = super::load_txt_excerpt(rel_str, Some(max_bytes)).expect("load excerpt");
    assert!(result.truncated);
    assert_eq!(result.used_bytes, max_bytes as u64);

    let expected_head = &content[..15];
    let expected_tail = &content[content.len() - 5..];
    let expected_excerpt = format!("{}\n...\n{}", expected_head, expected_tail);
    assert_eq!(result.excerpt, expected_excerpt);

    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    assert_eq!(result.sha256, encode(hasher.finalize()));

    drop(temp);
}

#[test]
fn load_txt_excerpt_returns_not_found_for_missing_file() {
    let base = ensure_corpus_dir();
    let rel = Path::new("missing.txt");
    let rel_str = to_forward_slash(rel);
    let err = super::load_txt_excerpt(rel_str, None).expect_err("expected error");
    assert_eq!(err, "file not found");
    // keep base alive
    drop(base);
}

#[test]
fn load_txt_excerpt_rejects_out_of_sandbox() {
    let base = ensure_corpus_dir();
    let err = super::load_txt_excerpt("../src/main.rs".into(), None).expect_err("expected error");
    assert_eq!(err, "path out of sandbox");
    drop(base);
}
