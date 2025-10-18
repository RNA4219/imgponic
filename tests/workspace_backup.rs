use std::fs;
use std::path::Path;

use promptforge::workspace_test_support::{workspace_path, write_workspace, Workspace};
use serde_json::json;

struct EnvVarGuard {
    key: &'static str,
    original: Option<String>,
}

impl EnvVarGuard {
    fn set(key: &'static str, value: &Path) -> Self {
        let original = std::env::var(key).ok();
        std::env::set_var(key, value);
        Self { key, original }
    }
}

impl Drop for EnvVarGuard {
    fn drop(&mut self) {
        if let Some(ref value) = self.original {
            std::env::set_var(self.key, value);
        } else {
            std::env::remove_var(self.key);
        }
    }
}

#[test]
fn write_workspace_creates_backup_before_overwrite() {
    let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
    let _home_guard = EnvVarGuard::set("HOME", temp_dir.path());
    let _xdg_guard = EnvVarGuard::set("XDG_DATA_HOME", temp_dir.path());

    let app = tauri::test::mock_app();
    let handle = app.handle();

    let workspace_file = workspace_path(&handle);
    if let Some(parent) = workspace_file.parent() {
        fs::create_dir_all(parent).expect("failed to create workspace dir");
    }

    let original_content = r#"{"version":0,"left_text":"old","right_text":"","recipe_path":"recipes/old.yaml","model":"llama2","params":{"foo":"bar"},"project_path":null,"updated_at":"2024-01-01T00:00:00"}"#;
    fs::write(&workspace_file, original_content).expect("failed to seed workspace file");

    let backup_file = workspace_file.with_file_name("workspace.bak");

    let workspace = Workspace {
        version: 1,
        left_text: "new left".into(),
        right_text: "new right".into(),
        recipe_path: "recipes/new.yaml".into(),
        model: "llama3".into(),
        params: json!({"baz": "qux"}),
        project_path: Some("project/path".into()),
        updated_at: "2024-02-01T12:00:00Z".into(),
    };
    let expected_json = serde_json::to_value(&workspace).expect("serialize workspace");

    let result = write_workspace(handle.clone(), workspace).expect("write workspace");
    assert_eq!(result, workspace_file.display().to_string());

    let persisted = fs::read_to_string(&workspace_file).expect("read persisted workspace");
    let persisted_json: serde_json::Value =
        serde_json::from_str(&persisted).expect("parse persisted workspace");
    assert_eq!(persisted_json, expected_json);

    let backup_content = fs::read_to_string(&backup_file).expect("read backup workspace");
    assert_eq!(backup_content, original_content);
}
