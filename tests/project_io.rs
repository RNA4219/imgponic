use std::fs;
use std::path::{Path, PathBuf};

use promptforge::project_io_test_support::{
    list_project_files, read_project_file, write_project_file,
};

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

fn setup_temp_project() -> (tempfile::TempDir, CurrentDirGuard) {
    let temp_dir = tempfile::tempdir().expect("tempdir");
    let guard = CurrentDirGuard::change_to(temp_dir.path());
    (temp_dir, guard)
}

#[test]
fn project_file_io_accepts_allowed_extensions() {
    let (_temp_dir, _guard) = setup_temp_project();

    let content = "print('hello')";
    let path = "scripts/example.py";

    let write_result = write_project_file(path.into(), content.into());
    assert!(
        write_result.is_ok(),
        "write should succeed: {:?}",
        write_result
    );

    let read_result = read_project_file(path.into());
    let file = read_result.expect("read project file");
    assert!(file.path.ends_with(path));
    assert_eq!(file.content, content);
}

#[test]
fn project_file_io_rejects_disallowed_extensions() {
    let (temp_dir, _guard) = setup_temp_project();

    let blocked_path = "bin/malware.exe";
    let err = write_project_file(blocked_path.into(), "nope".into())
        .expect_err("write should reject disallowed extension");
    assert_eq!(err, "unsupported extension");

    let blocked_file = temp_dir.path().join("project").join(blocked_path);
    fs::create_dir_all(blocked_file.parent().unwrap()).expect("create parent dirs");
    fs::write(&blocked_file, b"binary").expect("seed blocked file");

    let err = read_project_file(blocked_path.into())
        .expect_err("read should reject disallowed extension");
    assert_eq!(err, "unsupported extension");
}

#[test]
fn list_project_files_filters_to_default_whitelist() {
    let (temp_dir, _guard) = setup_temp_project();

    let project_dir = temp_dir.path().join("project");
    fs::create_dir_all(project_dir.join("notes")).expect("create notes dir");

    fs::write(project_dir.join("notes/allowed.md"), "ok").expect("write allowed file");
    fs::write(project_dir.join("notes/skip.exe"), "no").expect("write blocked file");

    let entries = list_project_files(None).expect("list project files");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].path, "notes/allowed.md");
}
