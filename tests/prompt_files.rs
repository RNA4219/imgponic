use std::fs;
use std::path::{Path, PathBuf};

use promptforge::prompt_test_support::{list_prompt_files, read_prompt_file};

struct CurrentDirGuard {
    original: PathBuf,
}

impl CurrentDirGuard {
    fn change_to(path: &Path) -> Self {
        let original = std::env::current_dir().expect("current dir");
        std::env::set_current_dir(path).expect("set current dir");
        Self { original }
    }
}

impl Drop for CurrentDirGuard {
    fn drop(&mut self) {
        std::env::set_current_dir(&self.original).expect("restore current dir");
    }
}

#[test]
fn prompt_file_commands_enforce_kind_and_sandbox() {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let _guard = CurrentDirGuard::change_to(temp_dir.path());

    fs::create_dir_all("prompts/system").expect("create prompts/system");
    fs::write("prompts/system/sample.txt", "system prompt").expect("write sample");

    let entries = list_prompt_files("system".into()).expect("list prompt files");
    assert_eq!(entries.len(), 1, "unexpected entries: {:?}", entries);
    assert_eq!(entries[0].path, "system/sample.txt");
    assert_eq!(entries[0].name, "sample.txt");

    let file = read_prompt_file("system/sample.txt".into()).expect("read prompt file");
    assert!(file.path.ends_with("prompts/system/sample.txt"));
    assert_eq!(file.content, "system prompt");

    let err = list_prompt_files("evil".into()).expect_err("reject unsupported kind");
    assert_eq!(err, "unsupported prompt kind");

    let err = read_prompt_file("../evil.txt".into()).expect_err("reject sandbox escape");
    assert!(
        err.contains("path out of sandbox"),
        "unexpected error: {}",
        err
    );
}
