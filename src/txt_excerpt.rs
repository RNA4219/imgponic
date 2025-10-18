use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

const DEFAULT_MAX_BYTES: u64 = 40_000;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct TxtExcerpt {
    pub path: String,
    pub size_bytes: u64,
    pub used_bytes: u64,
    pub sha256: String,
    pub excerpt: String,
    pub truncated: bool,
}

pub fn load_txt_excerpt(path: &str, max_bytes: Option<u64>) -> Result<TxtExcerpt, String> {
    let base = PathBuf::from("corpus");
    let input_path = Path::new(path);
    let target = if input_path.is_absolute() {
        input_path.to_path_buf()
    } else {
        base.join(input_path)
    };

    if !target.exists() {
        return Err("file not found".into());
    }

    ensure_under(&base, &target).map_err(|e| e.to_string())?;

    let metadata = fs::metadata(&target).map_err(|e| e.to_string())?;
    let size_bytes = metadata.len();

    let content = fs::read_to_string(&target).map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let sha256 = hex::encode(hasher.finalize());

    let limit_bytes = max_bytes.unwrap_or(DEFAULT_MAX_BYTES);
    let limit_bytes = limit_bytes.min(usize::MAX as u64) as usize;
    let truncated = size_bytes > limit_bytes as u64;
    let used_bytes = size_bytes.min(limit_bytes as u64);

    const TRUNCATION_MARKER: &str = "...[TRUNCATED]...";

    let excerpt = if !truncated {
        content.clone()
    } else if limit_bytes == 0 {
        String::new()
    } else {
        let head_len = limit_bytes * 3 / 4;
        let tail_len = limit_bytes - head_len;

        let head = slice_prefix(&content, head_len);
        let tail = slice_suffix(&content, tail_len);

        let mut parts: Vec<&str> = Vec::new();
        if !head.is_empty() {
            parts.push(head);
        }
        parts.push(TRUNCATION_MARKER);
        if !tail.is_empty() {
            parts.push(tail);
        }

        parts.join("\n\n")
    };

    Ok(TxtExcerpt {
        path: target
            .canonicalize()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string(),
        size_bytes,
        used_bytes,
        sha256,
        excerpt,
        truncated,
    })
}

fn ensure_under(base: &Path, target: &Path) -> Result<(), io::Error> {
    let base = base.canonicalize()?;
    let target = target.canonicalize()?;
    if !target.starts_with(&base) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "path out of sandbox",
        ));
    }
    Ok(())
}

fn slice_prefix<'a>(s: &'a str, max_bytes: usize) -> &'a str {
    let end = max_bytes.min(s.len());
    let mut idx = end;
    while idx > 0 && !s.is_char_boundary(idx) {
        idx -= 1;
    }
    &s[..idx]
}

fn slice_suffix<'a>(s: &'a str, max_bytes: usize) -> &'a str {
    if max_bytes == 0 {
        return "";
    }
    if max_bytes >= s.len() {
        return s;
    }
    let mut start = s.len() - max_bytes;
    while start < s.len() && !s.is_char_boundary(start) {
        start += 1;
    }
    &s[start..]
}
