#[cfg(any(feature = "gtk4", feature = "gtk4_compat"))]
mod commands {
    #[cfg(feature = "gtk4")]
    use promptforge::StreamState;
    use promptforge::{
        self, ComposeResult, FileContent, ProjectEntry, PromptFileEntry, SetupCheckOutcome,
        TxtExcerpt, Workspace,
    };
    use serde_json::Value;
    use tauri::AppHandle;
    #[cfg(feature = "gtk4")]
    use tauri::{State, WebviewWindow};

    #[tauri::command]
    pub fn compose_prompt_cmd(
        recipe_path: String,
        inline_params: Value,
    ) -> Result<ComposeResult, String> {
        promptforge::compose_prompt(recipe_path, inline_params)
    }

    #[tauri::command]
    pub async fn run_ollama_chat_cmd(
        model: String,
        system_text: String,
        user_text: String,
    ) -> Result<String, String> {
        promptforge::run_ollama_chat(model, system_text, user_text).await
    }

    #[cfg(feature = "gtk4")]
    #[tauri::command]
    pub async fn run_ollama_stream_cmd(
        window: WebviewWindow,
        state: State<'_, StreamState>,
        model: String,
        system_text: String,
        user_text: String,
    ) -> Result<(), String> {
        promptforge::run_ollama_stream(window, state, model, system_text, user_text).await
    }

    #[cfg(feature = "gtk4")]
    #[tauri::command]
    pub async fn abort_current_stream_cmd(state: State<'_, StreamState>) -> Result<(), String> {
        promptforge::abort_current_stream(state).await
    }

    #[tauri::command]
    pub fn save_run_cmd(
        recipe_path: String,
        final_prompt: String,
        response_text: String,
        response_jsonl: Option<String>,
    ) -> Result<String, String> {
        promptforge::save_run(recipe_path, final_prompt, response_text, response_jsonl)
    }

    #[tauri::command]
    pub fn list_prompt_files_cmd(kind: String) -> Result<Vec<PromptFileEntry>, String> {
        promptforge::list_prompt_files(kind)
    }

    #[tauri::command]
    pub fn read_prompt_file_cmd(rel_path: String) -> Result<FileContent, String> {
        promptforge::read_prompt_file(rel_path)
    }

    #[tauri::command]
    pub fn list_project_files_cmd(exts: Option<Vec<String>>) -> Result<Vec<ProjectEntry>, String> {
        promptforge::list_project_files(exts)
    }

    #[tauri::command]
    pub fn read_project_file_cmd(rel_path: String) -> Result<FileContent, String> {
        promptforge::read_project_file(rel_path)
    }

    #[tauri::command]
    pub fn write_project_file_cmd(rel_path: String, content: String) -> Result<String, String> {
        promptforge::write_project_file(rel_path, content)
    }

    #[tauri::command]
    pub fn load_txt_excerpt_cmd(
        path: String,
        max_bytes: Option<u64>,
    ) -> Result<TxtExcerpt, String> {
        promptforge::load_txt_excerpt(path, max_bytes)
    }

    #[tauri::command]
    pub fn read_workspace_cmd(app: AppHandle) -> Result<Option<Workspace>, String> {
        promptforge::read_workspace(&app)
    }

    #[tauri::command]
    pub fn write_workspace_cmd(app: AppHandle, ws: Workspace) -> Result<String, String> {
        promptforge::write_workspace(&app, ws)
    }

    #[tauri::command]
    pub async fn check_ollama_setup_cmd(
        base_url: Option<String>,
        model: Option<String>,
    ) -> Result<SetupCheckOutcome, String> {
        promptforge::check_ollama_setup(base_url, model).await
    }

    pub fn apply_handlers(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
        #[cfg(feature = "gtk4")]
        {
            builder.invoke_handler(tauri::generate_handler![
                compose_prompt_cmd,
                run_ollama_chat_cmd,
                run_ollama_stream_cmd,
                abort_current_stream_cmd,
                save_run_cmd,
                list_prompt_files_cmd,
                read_prompt_file_cmd,
                list_project_files_cmd,
                read_project_file_cmd,
                write_project_file_cmd,
                load_txt_excerpt_cmd,
                read_workspace_cmd,
                write_workspace_cmd,
                check_ollama_setup_cmd,
            ])
        }
        #[cfg(not(feature = "gtk4"))]
        {
            builder.invoke_handler(tauri::generate_handler![
                compose_prompt_cmd,
                run_ollama_chat_cmd,
                save_run_cmd,
                list_prompt_files_cmd,
                read_prompt_file_cmd,
                list_project_files_cmd,
                read_project_file_cmd,
                write_project_file_cmd,
                load_txt_excerpt_cmd,
                read_workspace_cmd,
                write_workspace_cmd,
                check_ollama_setup_cmd,
            ])
        }
    }
}

#[cfg(any(feature = "gtk4", feature = "gtk4_compat"))]
fn main() {
    commands::apply_handlers(promptforge::configure_builder(tauri::Builder::new()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(any(feature = "gtk4", feature = "gtk4_compat")))]
fn main() {
    eprintln!("promptforge built without gtk4 feature; GUI runtime is disabled");
}
