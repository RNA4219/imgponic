#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::io;
    use std::path::Path;

    #[test]
    fn converts_v1_json_to_v2() {
        let v1 = WorkspaceV1 {
            version: 1,
            left_text: "left".to_string(),
            right_text: "right".to_string(),
            recipe_path: "recipe.yaml".to_string(),
            model: "model-x".to_string(),
            params: json!({"k": "v"}),
            project_path: Some("project".to_string()),
            updated_at: "2024-05-01T00:00:00Z".to_string(),
        };

        let v2 = from_v1(v1.clone());

        assert_eq!(v2.version, 2);
        assert_eq!(v2.tabs.len(), 1);
        assert_eq!(v2.active_tab.as_deref(), Some("default"));

        let tab = &v2.tabs[0];
        assert_eq!(tab.id, "default");
        assert_eq!(tab.left_text, v1.left_text);
        assert_eq!(tab.right_text, v1.right_text);
        assert_eq!(tab.recipe_path, v1.recipe_path);
        assert_eq!(tab.model, v1.model);
        assert_eq!(tab.params, v1.params);
        assert_eq!(tab.project_path, v1.project_path);
        assert_eq!(tab.updated_at, v1.updated_at);
    }

    #[test]
    fn write_with_backup_creates_workspace_backup() -> io::Result<()> {
        let base = std::env::temp_dir().join(format!(
            "workspace_v2_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        fs::create_dir_all(&base)?;
        let target = base.join("workspace.json");
        let backup = base.join("workspace.v1.bak");

        fs::write(&target, "{\"version\":1}")?;
        write_with_backup(&target, &backup, "{\"version\":2}")?;

        assert!(Path::new(&backup).exists());
        assert_eq!(fs::read_to_string(&backup)?, "{\"version\":1}");
        assert_eq!(fs::read_to_string(&target)?, "{\"version\":2}");

        fs::remove_dir_all(&base)?;
        Ok(())
    }
}

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct WorkspaceV1 {
    pub version: u32,
    pub left_text: String,
    pub right_text: String,
    pub recipe_path: String,
    pub model: String,
    pub params: Value,
    pub project_path: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceTab {
    pub id: String,
    pub left_text: String,
    pub right_text: String,
    pub recipe_path: String,
    pub model: String,
    pub params: Value,
    pub project_path: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceV2 {
    pub version: u32,
    pub tabs: Vec<WorkspaceTab>,
    pub active_tab: Option<String>,
}

pub fn from_v1(v1: WorkspaceV1) -> WorkspaceV2 {
    let tab = WorkspaceTab {
        id: "default".to_string(),
        left_text: v1.left_text.clone(),
        right_text: v1.right_text.clone(),
        recipe_path: v1.recipe_path.clone(),
        model: v1.model.clone(),
        params: v1.params.clone(),
        project_path: v1.project_path.clone(),
        updated_at: v1.updated_at.clone(),
    };

    WorkspaceV2 {
        version: 2,
        tabs: vec![tab],
        active_tab: Some("default".to_string()),
    }
}

pub fn write_with_backup(path: &Path, backup_path: &Path, contents: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if path.exists() {
        if let Some(parent) = backup_path.parent() {
            fs::create_dir_all(parent)?;
        }
        if backup_path.exists() {
            fs::remove_file(backup_path)?;
        }
        fs::rename(path, backup_path)?;
    }
    fs::write(path, contents)
}
