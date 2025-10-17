#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use chrono::Local;
use std::io;

#[derive(Debug, Deserialize)]
struct Recipe {
    profile: String,
    fragments: Vec<String>,
    #[serde(default)]
    params: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct Fragment {
    id: String,
    kind: String,
    #[serde(default)]
    trust: Option<String>,
    #[serde(default)]
    merge_strategy: Option<String>,
    content: String,
}

#[derive(Debug, Serialize)]
struct ComposeResult {
    final_prompt: String,
    sha256: String,
    model: String,
}

fn read_yaml<T: for<'de> Deserialize<'de>>(p: &Path) -> Result<T> {
    let s = fs::read_to_string(p)?;
    let v = serde_yaml::from_str::<T>(&s)?;
    Ok(v)
}

fn render_placeholders(s: &str, params: &serde_json::Value) -> String {
    let mut out = s.to_string();
    if let Some(obj) = params.as_object() {
        for (k, v) in obj.iter() {
            let key = format!("{{{{{}}}}}", k);
            let val = if v.is_string() {
                v.as_str().unwrap().to_string()
            } else {
                v.to_string()
            };
            out = out.replace(&key, &val);
        }
    }
    out
}

#[tauri::command]
fn compose_prompt(recipe_path: String, inline_params: serde_json::Value) -> Result<ComposeResult, String> {
    _compose_prompt(&recipe_path, Some(inline_params)).map_err(|e| e.to_string())
}

fn _compose_prompt(recipe_path: &str, inline_params: Option<serde_json::Value>) -> Result<ComposeResult> {
    let rp = PathBuf::from(recipe_path);
    let recipe: Recipe = read_yaml(&rp)?;

    // base dir
    let base = rp.parent().unwrap().parent().unwrap_or_else(|| Path::new("."));

    // merge params (inline override recipe.params)
    let mut params = recipe.params.clone();
    if let (Some(mut obj), Some(inline)) = (params.as_object().cloned(), inline_params) {
        if let Some(inline_obj) = inline.as_object() {
            for (k, v) in inline_obj.iter() {
                obj.insert(k.clone(), v.clone());
            }
        }
        params = serde_json::Value::Object(obj);
    }

    // load fragments
    let mut blocks: Vec<String> = vec![];
    for frag_id in recipe.fragments.iter() {
        let frag_path = base.join("fragments").join(format!("{}.yaml", frag_id.replace('.', "/")));
        let frag: Fragment = read_yaml(&frag_path)
          .with_context(|| format!("Failed to read fragment: {}", frag_path.display()))?;
        let rendered = render_placeholders(&frag.content, &params);
        blocks.push(rendered);
    }

    let user_input = params.get("user_input").and_then(|v| v.as_str()).unwrap_or("").to_string();

    // final prompt with delimiter for user input
    let final_prompt = format!("{}\n---\nUSER_INPUT (verbatim):\n```text\n{}\n```",
        blocks.join("\n\n"),
        user_input
    );

    // sha256
    let mut hasher = Sha256::new();
    hasher.update(final_prompt.as_bytes());
    let sha256 = hex::encode(hasher.finalize());

    Ok(ComposeResult { final_prompt, sha256, model: recipe.profile })
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage { role: String, content: String }

#[derive(Debug, Serialize, Deserialize)]
struct ChatPayload {
    model: String,
    stream: bool,
    messages: Vec<ChatMessage>,
}

#[tauri::command]
async fn run_ollama_chat(model: String, system_text: String, user_text: String) -> Result<String, String> {
    let payload = ChatPayload {
        model,
        stream: false,
        messages: vec![
            ChatMessage { role: "system".into(), content: system_text },
            ChatMessage { role: "user".into(), content: user_text },
        ],
    };

    let client = reqwest::Client::new();
    let res = client.post("http://localhost:11434/api/chat")
        .json(&payload)
        .send().await.map_err(|e| e.to_string())?;

    let txt = res.text().await.map_err(|e| e.to_string())?;
    Ok(txt)
}

#[tauri::command]
fn save_run(recipe_path: String, final_prompt: String, response_text: String) -> Result<String, String> {
    let ts = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let dir = PathBuf::from("runs").join(ts);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    fs::write(dir.join("recipe.path.txt"), recipe_path).map_err(|e| e.to_string())?;
    fs::write(dir.join("prompt.final.txt"), final_prompt).map_err(|e| e.to_string())?;
    fs::write(dir.join("response.raw.jsonl"), response_text).map_err(|e| e.to_string())?;

    Ok(dir.display().to_string())
}

// ---------- Sandbox helpers ----------
fn ensure_under(base: &Path, target: &Path) -> Result<(), io::Error> {
    let base = base.canonicalize()?;
    let target = target.canonicalize()?;
    if !target.starts_with(&base) {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "path out of sandbox"));
    }
    Ok(())
}

// ---------- Project file I/O ----------
#[derive(Debug, Serialize)]
struct ProjectEntry { path: String, name: String, size: u64 }

#[tauri::command]
fn list_project_files(exts: Option<Vec<String>>) -> Result<Vec<ProjectEntry>, String> {
    use walkdir::WalkDir;
    let base = PathBuf::from("project");
    if !base.exists() { fs::create_dir_all(&base).map_err(|e| e.to_string())?; }
    let mut out = vec![];
    let allow_exts: Option<Vec<String>> = exts.map(|v| v.into_iter().map(|s| s.to_lowercase()).collect());
    for e in WalkDir::new(&base).into_iter().filter_map(|e| e.ok()) {
        if e.file_type().is_file() {
            let p = e.path();
            let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if let Some(ref allow) = allow_exts {
                if !allow.contains(&ext) { continue; }
            }
            let meta = fs::metadata(p).map_err(|e| e.to_string())?;
            let rel = p.strip_prefix(&base).unwrap().to_string_lossy().to_string();
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            out.push(ProjectEntry { path: rel, name, size: meta.len() });
        }
    }
    out.sort_by(|a,b| a.path.cmp(&b.path));
    Ok(out)
}

#[derive(Debug, Serialize)]
struct FileContent { path: String, content: String }

#[tauri::command]
fn read_project_file(rel_path: String) -> Result<FileContent, String> {
    let base = PathBuf::from("project");
    let p = base.join(&rel_path);
    if !p.exists() { return Err("file not found".into()); }
    ensure_under(&base, &p).map_err(|e| e.to_string())?;
    let txt = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    Ok(FileContent { path: p.display().to_string(), content: txt })
}

#[tauri::command]
fn write_project_file(rel_path: String, content: String) -> Result<String, String> {
    let base = PathBuf::from("project");
    let p = base.join(&rel_path);
    if let Some(dir) = p.parent() { fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    ensure_under(&base, &p).map_err(|e| e.to_string())?;
    fs::write(&p, content).map_err(|e| e.to_string())?;
    Ok(p.display().to_string())
}

// ---------- Workspace persistence ----------
#[derive(Debug, Serialize, Deserialize, Default)]
struct Workspace {
    version: u32,
    left_text: String,
    right_text: String,
    recipe_path: String,
    model: String,
    params: serde_json::Value,
    project_path: Option<String>,
    updated_at: String,
}

fn workspace_path(app: &tauri::AppHandle) -> PathBuf {
    if let Some(mut p) = app.path_resolver().app_data_dir() {
        p.push("workspace.json");
        return p;
    }
    PathBuf::from("workspace.json")
}

#[tauri::command]
fn read_workspace(app: tauri::AppHandle) -> Result<Option<Workspace>, String> {
    let p = workspace_path(&app);
    match fs::read_to_string(&p) {
        Ok(s) => {
            let ws: Workspace = serde_json::from_str(&s).map_err(|e| e.to_string())?;
            Ok(Some(ws))
        }
        Err(err) => {
            if err.kind() == std::io::ErrorKind::NotFound { Ok(None) } else { Err(err.to_string()) }
        }
    }
}

#[tauri::command]
fn write_workspace(app: tauri::AppHandle, ws: Workspace) -> Result<String, String> {
    let p = workspace_path(&app);
    if let Some(dir) = p.parent() { fs::create_dir_all(dir).map_err(|e| e.to_string())?; }
    let s = serde_json::to_string_pretty(&ws).map_err(|e| e.to_string())?;
    fs::write(&p, s).map_err(|e| e.to_string())?;
    Ok(p.display().to_string())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        compose_prompt,
        run_ollama_chat,
        save_run,
        list_project_files,
        read_project_file,
        write_project_file,
        read_workspace,
        write_workspace
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
