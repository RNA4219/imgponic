use std::fs;
use std::path::{Path, PathBuf};

use promptforge::project_test_support::{read_project_file, write_project_file};

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

#[test]
fn write_project_file_allows_new_paths_and_preserves_reading() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let _dir_guard = DirGuard::change_to(temp_dir.path());

    let rel_path = "notes/new_entry.txt";
    let returned_path =
        write_project_file(rel_path.into(), "hello world".into()).expect("write project file");
    assert_eq!(
        returned_path,
        Path::new("project").join(rel_path).display().to_string()
    );

    let written_path = PathBuf::from("project").join(rel_path);
    let persisted = fs::read_to_string(&written_path).expect("read written file");
    assert_eq!(persisted, "hello world");

    let file = read_project_file(rel_path.into()).expect("read project file");
    assert_eq!(file.content, "hello world");

    let err =
        write_project_file("../evil.txt".into(), "nope".into()).expect_err("sandbox violation");
    assert!(
        err.contains("path out of sandbox"),
        "unexpected error: {}",
        err
    );
}
