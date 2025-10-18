use std::fs;

use promptforge::tests::_compose_prompt;

#[test]
fn compose_prompt_snapshot() {
    let temp = tempfile::tempdir().expect("failed to create temp dir");
    let base = temp.path();

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

    let recipe_path = recipes_dir.join("demo.yaml");

    let result = _compose_prompt(recipe_path.to_str().unwrap(), None).expect("compose prompt");

    insta::assert_snapshot!(result.final_prompt);
}
