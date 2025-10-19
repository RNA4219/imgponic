use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

use hex::encode;
use sha2::{Digest, Sha256};
use tempfile::{tempdir, tempdir_in};

pub use super::_compose_prompt;

pub struct DataDirGuard {
    prev: Option<OsString>,
}

impl DataDirGuard {
    pub fn set(path: &Path) -> Self {
        let prev = std::env::var_os("PROMPTFORGE_DATA_DIR");
        std::env::set_var("PROMPTFORGE_DATA_DIR", path);
        Self { prev }
    }
}

impl Drop for DataDirGuard {
    fn drop(&mut self) {
        if let Some(ref value) = self.prev {
            std::env::set_var("PROMPTFORGE_DATA_DIR", value);
        } else {
            std::env::remove_var("PROMPTFORGE_DATA_DIR");
        }
    }
}

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
    assert!(result.excerpt.contains("...[TRUNCATED]..."));
    let expected_excerpt = format!(
        "{head}\n\n...[TRUNCATED]...\n\n{tail}",
        head = expected_head,
        tail = expected_tail,
    );
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

mod compose_prompt_sandbox {
    use super::{DataDirGuard, _compose_prompt};
    use serde_json::json;
    use std::fs;
    use std::path::Path;

    fn write_valid_fixture(base: &Path) -> String {
        let recipes_dir = base.join("recipes");
        let fragments_dir = base.join("fragments/system");
        fs::create_dir_all(&recipes_dir).expect("failed to create recipes dir");
        fs::create_dir_all(&fragments_dir).expect("failed to create fragments dir");

        fs::write(
            recipes_dir.join("ok.yaml"),
            "profile: llama3\nfragments:\n  - system.prompt\n",
        )
        .expect("failed to write recipe");

        fs::write(
            fragments_dir.join("prompt.yaml"),
            "id: system.prompt\nkind: system\ncontent: |\n  Hello\n",
        )
        .expect("failed to write fragment");

        recipes_dir.join("ok.yaml").to_string_lossy().to_string()
    }

    #[test]
    fn compose_prompt_rejects_recipe_path_traversal() {
        let temp = tempdir().expect("failed to create temp dir");
        fs::create_dir_all(temp.path().join("recipes")).expect("failed to create recipes dir");
        let _guard = DataDirGuard::set(temp.path());

        let outside = temp.path().join("../escape.yaml");
        let err =
            _compose_prompt(outside.to_string_lossy().as_ref(), None).expect_err("expected error");
        assert_eq!(err.to_string(), "path out of sandbox");
    }

    #[test]
    fn compose_prompt_rejects_fragment_path_traversal() {
        let temp = tempdir().expect("failed to create temp dir");
        let recipe_path = temp.path().join("recipes/attack.yaml");
        fs::create_dir_all(recipe_path.parent().unwrap()).expect("failed to create recipes dir");
        fs::create_dir_all(temp.path().join("fragments/system"))
            .expect("failed to create fragments dir");

        fs::write(
            &recipe_path,
            "profile: llama3\nfragments:\n  - system/../../evil\n",
        )
        .expect("failed to write recipe");

        let _guard = DataDirGuard::set(temp.path());
        let err = _compose_prompt(recipe_path.to_string_lossy().as_ref(), None)
            .expect_err("expected error");
        assert_eq!(err.to_string(), "path out of sandbox");
    }

    #[test]
    fn compose_prompt_allows_in_sandbox() {
        let temp = tempdir().expect("failed to create temp dir");
        let recipe_path = write_valid_fixture(temp.path());
        let _guard = DataDirGuard::set(temp.path());

        let result = _compose_prompt(&recipe_path, None).expect("compose prompt");
        assert!(result.final_prompt.contains("Hello"));
    }

    #[test]
    fn compose_prompt_inline_params_without_recipe_params_keeps_user_input() {
        let temp = tempdir().expect("failed to create temp dir");
        let recipe_path = write_valid_fixture(temp.path());
        let _guard = DataDirGuard::set(temp.path());

        let inline_params = json!({ "user_input": "Inline text" });
        let result = _compose_prompt(&recipe_path, Some(inline_params)).expect("compose prompt");

        assert!(result.final_prompt.contains("Inline text"));
    }
}

mod ollama_stream_integration {
    use crate::{ollama_stream::StreamState, run_ollama_stream};

    use serde_json::from_str;
    use tauri::{test, Listener, Manager, WindowBuilder};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        sync::mpsc,
        time::{timeout, Duration},
    };

    async fn spawn_streaming_server(lines: Vec<String>) -> tokio::task::JoinHandle<()> {
        let listener = TcpListener::bind("127.0.0.1:11434")
            .await
            .expect("bind mock ollama server");
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut collected = Vec::new();
                let mut buf = [0u8; 1024];
                while let Ok(n) = socket.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    collected.extend_from_slice(&buf[..n]);
                    if collected.windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                }
                let mut response = b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ntransfer-encoding: chunked\r\n\r\n".to_vec();
                for line in lines {
                    response
                        .extend_from_slice(format!("{:x}\r\n{}\r\n", line.len(), line).as_bytes());
                }
                response.extend_from_slice(b"0\r\n\r\n");
                let _ = socket.write_all(&response).await;
                let _ = socket.shutdown().await;
            }
        })
    }

    #[tokio::test]
    async fn run_ollama_stream_emits_all_jsonl_lines() {
        let server = spawn_streaming_server(vec![
            "{\"response\":\"alpha \",\"done\":false}\n".to_string(),
            "{\"response\":\"beta\",\"done\":true}\n".to_string(),
        ])
        .await;

        let app = test::mock_app();
        let _ = app.manage(StreamState::default());
        let window = WindowBuilder::new(&app, "ollama-stream-test")
            .build()
            .expect("create window");

        let (jsonl_tx, mut jsonl_rx) = mpsc::unbounded_channel();
        let (end_tx, mut end_rx) = mpsc::unbounded_channel();

        let _ = window.listen("ollama:jsonl", move |event| {
            if let Ok(raw) = from_str::<String>(event.payload()) {
                let _ = jsonl_tx.send(raw);
            }
        });
        let _ = window.listen("ollama:end", move |_| {
            let _ = end_tx.send(());
        });

        let state = window.state::<StreamState>();
        run_ollama_stream(
            window.clone(),
            state,
            "mock-model".into(),
            "system".into(),
            "user".into(),
        )
        .await
        .expect("run stream command");

        let first = timeout(Duration::from_secs(5), jsonl_rx.recv())
            .await
            .expect("first jsonl event")
            .expect("jsonl payload");
        let second = timeout(Duration::from_secs(5), jsonl_rx.recv())
            .await
            .expect("second jsonl event")
            .expect("jsonl payload");
        timeout(Duration::from_secs(5), end_rx.recv())
            .await
            .expect("end event")
            .expect("end signal");

        assert_eq!(first, "{\"response\":\"alpha \",\"done\":false}\n");
        assert_eq!(second, "{\"response\":\"beta\",\"done\":true}\n");

        server.await.expect("server task completed");
    }
}
