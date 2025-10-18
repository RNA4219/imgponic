use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use futures_util::future::{AbortHandle, Abortable};
use serde::Deserialize;
use tokio::sync::Mutex;
#[derive(Clone, Default)]
pub struct StreamState {
    inner: Arc<Mutex<Option<TrackedHandle>>>,
    counter: Arc<AtomicUsize>,
}
struct TrackedHandle {
    id: usize,
    handle: AbortHandle,
}
impl StreamState {
    pub async fn register(&self, handle: AbortHandle) -> (usize, Option<AbortHandle>) {
        let mut guard = self.inner.lock().await;
        let id = self.counter.fetch_add(1, Ordering::SeqCst) + 1;
        let previous = guard.replace(TrackedHandle { id, handle });
        (id, previous.map(|tracked| tracked.handle))
    }

    pub async fn take(&self) -> Option<AbortHandle> {
        let mut guard = self.inner.lock().await;
        guard.take().map(|tracked| tracked.handle)
    }

    pub async fn clear_if(&self, id: usize) {
        let mut guard = self.inner.lock().await;
        if guard.as_ref().map(|tracked| tracked.id) == Some(id) {
            guard.take();
        }
    }
}
#[derive(Debug, Deserialize)]
struct OllamaChunk {
    #[serde(default)]
    response: String,
    #[serde(default)]
    done: bool,
    #[serde(default)]
    error: Option<String>,
}
#[derive(Debug, PartialEq, Eq)]
pub enum OllamaEvent {
    Chunk(String),
    Done,
    Error(String),
}
pub fn parse_ollama_jsonl_chunk(line: &str) -> Result<Vec<OllamaEvent>, serde_json::Error> {
    let chunk: OllamaChunk = serde_json::from_str(line)?;
    if let Some(err) = chunk.error {
        return Ok(vec![OllamaEvent::Error(err)]);
    }
    let mut events = Vec::new();
    if !chunk.response.is_empty() {
        events.push(OllamaEvent::Chunk(chunk.response));
    }
    if chunk.done {
        events.push(OllamaEvent::Done);
    }
    Ok(events)
}
#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::future::Aborted;
    use std::time::Duration;

    #[tokio::test]
    async fn abort_resets_state() {
        let state = StreamState::default();
        let (handle, registration) = AbortHandle::new_pair();
        assert!(state.register(handle).await.1.is_none());
        let join = tokio::spawn(async move {
            Abortable::new(
                async move {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                },
                registration,
            )
            .await
        });
        let handle = state.take().await.expect("handle stored");
        handle.abort();
        assert!(state.take().await.is_none());
        assert!(matches!(join.await.unwrap(), Err(Aborted)));
    }

    #[tokio::test]
    async fn replacing_handle_aborts_previous() {
        let state = StreamState::default();
        let (handle1, registration1) = AbortHandle::new_pair();
        assert!(state.register(handle1).await.1.is_none());
        let join = tokio::spawn(async move {
            Abortable::new(
                async move {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                },
                registration1,
            )
            .await
        });
        let (handle2, _registration2) = AbortHandle::new_pair();
        let prev = state.register(handle2).await.1.expect("previous handle");
        prev.abort();
        assert!(matches!(join.await.unwrap(), Err(Aborted)));
    }

    #[test]
    fn parse_chunk_events() {
        for (input, expected) in [
            (
                r#"{"response":"Hel","done":false}"#,
                vec![OllamaEvent::Chunk("Hel".into())],
            ),
            (r#"{"response":"","done":true}"#, vec![OllamaEvent::Done]),
            (
                r#"{"error":"boom"}"#,
                vec![OllamaEvent::Error("boom".into())],
            ),
            (
                r#"{"response":"Hi","done":true}"#,
                vec![OllamaEvent::Chunk("Hi".into()), OllamaEvent::Done],
            ),
        ] {
            assert_eq!(parse_ollama_jsonl_chunk(input).unwrap(), expected);
        }
    }
}
