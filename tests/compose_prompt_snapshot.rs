use std::env;
use std::fs;
use std::sync::{Mutex, MutexGuard, OnceLock};

use promptforge::tests::{DataDirGuard, _compose_prompt};

fn env_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

#[test]
fn compose_prompt_snapshot() {
    let _guard = env_lock();
    let temp = tempfile::tempdir().expect("failed to create temp dir");
    let base = temp.path();

    let _guard = DataDirGuard::set(base);

    let recipes_dir = base.join("recipes");
    let fragments_dir = base.join("fragments/system");
    fs::create_dir_all(&recipes_dir).expect("failed to create recipes dir");
    fs::create_dir_all(&fragments_dir).expect("failed to create fragments dir");

    fs::write(
        recipes_dir.join("demo.yaml"),
        r"profile: llama3
fragments:
  - system.prompt
params:
  app_name: PromptForge
  current_date: 2024-01-01
  user_input: Please summarize the document.
",
    )
    .expect("failed to write recipe");

    fs::write(
        fragments_dir.join("prompt.yaml"),
        r"id: system.prompt
kind: system
content: |
  System instructions for {{app_name}}.
  Current date: {{current_date}}
",
    )
    .expect("failed to write fragment");

    env::set_var("PROMPTFORGE_DATA_DIR", base.to_str().unwrap());

    let recipe_path = recipes_dir.join("demo.yaml");

    let result = _compose_prompt(recipe_path.to_str().unwrap(), None).expect("compose prompt");

    insta::assert_snapshot!(result.final_prompt);

    env::remove_var("PROMPTFORGE_DATA_DIR");
}
