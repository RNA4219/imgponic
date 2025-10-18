#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::Client;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        task::JoinHandle,
    };

    async fn spawn_json_server(body: &'static str) -> (JoinHandle<()>, String) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = [0_u8; 1024];
            let _ = socket.read(&mut buf).await;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        });
        (handle, format!("http://{}", addr))
    }

    async fn assert_status(
        body: &'static str,
        required_model: Option<&str>,
        expected: SetupStatus,
    ) {
        let (server, base_url) = spawn_json_server(body).await;
        let result = check_ollama_setup_state(&Client::new(), &base_url, required_model).await;
        server.await.unwrap();
        assert_eq!(result.status, expected);
    }

    #[tokio::test]
    async fn validates_responses() {
        for (body, required_model, expected) in [
            (
                r#"{"models":[{"model":"llama2"}]}"#,
                Some("llama2"),
                SetupStatus::Ready,
            ),
            (
                r#"{"models":[{"model":"phi"}]}"#,
                Some("llama2"),
                SetupStatus::ModelMissing,
            ),
            (r#"{"models":[]}"#, None, SetupStatus::ModelMissing),
        ] {
            assert_status(body, required_model, expected).await;
        }
        let port = {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let port = listener.local_addr().unwrap().port();
            drop(listener);
            port
        };
        let url = format!("http://127.0.0.1:{}", port);
        assert_eq!(
            check_ollama_setup_state(&Client::new(), &url, None)
                .await
                .status,
            SetupStatus::ServerUnavailable
        );
    }
}

use reqwest::Client;
use serde::{Deserialize, Serialize};

const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";

#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SetupStatus {
    Ready,
    ServerUnavailable,
    ModelMissing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SetupCheckOutcome {
    pub status: SetupStatus,
    pub guidance: String,
}

impl SetupCheckOutcome {
    fn new(status: SetupStatus, guidance: &'static str) -> Self {
        Self {
            status,
            guidance: guidance.to_string(),
        }
    }
    fn ready() -> Self {
        Self::new(SetupStatus::Ready, "Ollama サーバーは利用可能です。")
    }
    fn server_unavailable() -> Self {
        Self::new(
            SetupStatus::ServerUnavailable,
            "Ollama サーバーに接続できません。サービスを起動してください。",
        )
    }
    fn model_missing() -> Self {
        Self::new(
            SetupStatus::ModelMissing,
            "Ollama でモデルを pull してから再度お試しください。",
        )
    }
}

#[derive(Debug, Deserialize)]
struct TagsResponse {
    #[serde(default)]
    models: Vec<TaggedModel>,
}

#[derive(Debug, Deserialize)]
struct TaggedModel {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

pub async fn check_ollama_setup_state(
    client: &Client,
    base_url: &str,
    required_model: Option<&str>,
) -> SetupCheckOutcome {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<TagsResponse>().await {
            Ok(tags) => {
                let has_any_model = tags
                    .models
                    .iter()
                    .any(|m| m.model.as_ref().or(m.name.as_ref()).is_some());
                if let Some(required) = required_model {
                    let has_required_model = tags.models.iter().any(|m| {
                        m.model.as_deref() == Some(required) || m.name.as_deref() == Some(required)
                    });
                    if !has_required_model {
                        return SetupCheckOutcome::model_missing();
                    }
                }
                if has_any_model {
                    SetupCheckOutcome::ready()
                } else {
                    SetupCheckOutcome::model_missing()
                }
            }
            Err(_) => SetupCheckOutcome::server_unavailable(),
        },
        _ => SetupCheckOutcome::server_unavailable(),
    }
}

#[tauri::command]
pub async fn check_ollama_setup(
    base_url: Option<String>,
    model: Option<String>,
) -> Result<SetupCheckOutcome, String> {
    let client = Client::new();
    let url = base_url.unwrap_or_else(|| DEFAULT_OLLAMA_URL.to_string());
    Ok(check_ollama_setup_state(&client, &url, model.as_deref()).await)
}
