use std::fs;
use std::path::{Path, PathBuf};

use promptforge::prompt_test_support::{list_prompt_files, read_prompt_file, PromptFileEntry};

struct DirGuard {
    original: PathBuf,
}

impl DirGuard {
    fn change_to(path: &Path) -> Self {
        let original = std::env::current_dir().expect("current dir");
        std::env::set_current_dir(path).expect("set current dir");
        Self { original }
    }
}

impl Drop for DirGuard {
    fn drop(&mut self) {
        let _ = std::env::set_current_dir(&self.original);
    }
}

fn collect_paths(entries: &[PromptFileEntry]) -> Vec<String> {
    entries.iter().map(|e| e.path.clone()).collect()
}

#[test]
fn list_prompt_files_returns_only_requested_kind() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let _dir_guard = DirGuard::change_to(temp_dir.path());

    fs::create_dir_all("prompts/system/sub").expect("create system dir");
    fs::create_dir_all("prompts/task/sub").expect("create task dir");
    fs::write("prompts/system/sample.txt", "system").expect("write sample");
    fs::write("prompts/system/sub/nested.txt", "nested").expect("write nested");
    fs::write("prompts/task/other.txt", "task").expect("write task");

    let entries = list_prompt_files("system".into()).expect("list system prompts");
    let mut paths = collect_paths(&entries);
    paths.sort();

    assert_eq!(
        paths,
        vec![
            "system/sample.txt".to_string(),
            "system/sub/nested.txt".to_string(),
        ]
    );

    let task_entries = list_prompt_files("task".into()).expect("list task prompts");
    let task_paths = collect_paths(&task_entries);
    assert_eq!(task_paths, vec!["task/other.txt".to_string()]);

    let err = list_prompt_files("evil".into()).expect_err("invalid kind rejected");
    assert!(
        err.contains("invalid prompt kind"),
        "unexpected error: {}",
        err
    );
}

#[test]
fn read_prompt_file_requires_sandbox() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let _dir_guard = DirGuard::change_to(temp_dir.path());

    fs::create_dir_all("prompts/system").expect("create system dir");
    fs::write("prompts/system/sample.txt", "system text").expect("write sample");

    let file = read_prompt_file("system/sample.txt".into()).expect("read prompt");
    assert_eq!(file.content, "system text");

    let err = read_prompt_file("../outside.txt".into()).expect_err("sandbox rejection");
    assert!(
        err.contains("path out of sandbox"),
        "unexpected error: {}",
        err
    );
}
