use std::fs;
use std::path::Path;
use std::collections::HashSet;

fn detect_gtk_major_version(lockfile_path: &Path) -> Option<u32> {
    let contents = fs::read_to_string(lockfile_path).ok()?;
    let mut in_package = false;

    for line in contents.lines() {
        let trimmed = line.trim();

        if trimmed == "[[package]]" {
            in_package = false;
            continue;
        }

        match trimmed {
            "name = \"gtk4\"" => return Some(4),
            "name = \"gtk\"" => {
                in_package = true;
                continue;
            }
            _ => {}
        }

        if in_package && trimmed.starts_with("version =") {
            // The gtk crate (without the numeric suffix) targets GTK3.
            return Some(3);
        }
    }

    None
}

fn tauri_linux_dependencies(config_path: &Path) -> serde_json::Result<HashSet<String>> {
    let contents = fs::read_to_string(config_path)
        .expect("tauri.conf.json should be readable");

    let value: serde_json::Value = serde_json::from_str(&contents)?;
    let depends = value
        .get("bundle")
        .and_then(|bundle| bundle.get("linux"))
        .and_then(|linux| linux.get("deb"))
        .and_then(|deb| deb.get("depends"))
        .and_then(|deps| deps.as_array())
        .expect("bundle.linux.deb.depends should be an array");

    let mut result = HashSet::new();
    for entry in depends {
        let dep = entry
            .as_str()
            .expect("dependency entries should be strings")
            .to_string();
        result.insert(dep);
    }

    Ok(result)
}

#[test]
fn gtk3_stack_declares_required_deps() {
    let gtk_major = detect_gtk_major_version(Path::new("Cargo.lock"))
        .expect("gtk entry should exist in Cargo.lock");

    if gtk_major != 3 {
        eprintln!("gtk major version is {}, skipping GTK3 dependency assertion", gtk_major);
        return;
    }

    let depends = tauri_linux_dependencies(Path::new("tauri.conf.json"))
        .expect("tauri.conf.json should parse as JSON");

    let expected = ["libgtk-3-0", "libwebkit2gtk-4.1-0", "libsoup2.4-1"];

    for dep in expected {
        assert!(
            depends.contains(dep),
            "missing GTK3 runtime dependency: {}",
            dep
        );
    }
}
