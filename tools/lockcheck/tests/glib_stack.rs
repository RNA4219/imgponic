use semver::Version;
use std::fs;
use std::path::{Path, PathBuf};

type PackageVersion = (Version, String);

fn find_cargo_lock(start: PathBuf) -> PathBuf {
    let mut dir = start.clone();
    loop {
        let candidate = dir.join("Cargo.lock");
        if candidate.exists() {
            return candidate;
        }
        if !dir.pop() {
            panic!("Cargo.lock not found while traversing from {}", start.display());
        }
    }
}

fn read_lockfile() -> toml::Value {
    let start = Path::new(env!("CARGO_MANIFEST_DIR"));
    let lock_path = find_cargo_lock(start.to_path_buf());
    let contents = fs::read_to_string(lock_path).expect("Cargo.lock should be readable");
    toml::from_str(&contents).expect("Cargo.lock should be valid TOML")
}

fn version_from_entry(entry: &toml::Value) -> Option<PackageVersion> {
    let version = entry.get("version")?.as_str()?;
    let parsed = Version::parse(version).ok()?;
    Some((parsed, version.to_string()))
}

fn collect_packages<'a>(lock: &'a toml::Value) -> impl Iterator<Item = &'a toml::Value> {
    lock.get("package")
        .and_then(|packages| packages.as_array())
        .into_iter()
        .flatten()
}

#[test]
#[cfg(feature = "security")]
fn glib_stack_is_modern_and_slim() {
    let lock = read_lockfile();
    let mut latest_glib: Option<PackageVersion> = None;
    let mut has_gtk4 = false;
    let mut has_webkit6 = false;
    let mut has_gtk3 = false;
    let mut has_webkit2 = false;

    for entry in collect_packages(&lock) {
        let Some(name) = entry.get("name").and_then(|n| n.as_str()) else {
            continue;
        };

        match name {
            "glib" => {
                if let Some(candidate) = version_from_entry(entry) {
                    latest_glib = Some(match latest_glib {
                        Some(current) if current.0 >= candidate.0 => current,
                        _ => candidate,
                    });
                }
            }
            "gtk4" => has_gtk4 = true,
            "webkit6" => has_webkit6 = true,
            "gtk" => has_gtk3 = true,
            "webkit2gtk" => has_webkit2 = true,
            _ => {}
        }
    }

    let Some((version, raw)) = latest_glib else {
        panic!("glib package not found in Cargo.lock");
    };

    assert!(version >= Version::parse("0.20.0").unwrap(), "glib version too old: {raw}");
    assert!(has_gtk4 || has_gtk3, "no GTK stack present in Cargo.lock");
    assert!(has_webkit6 || has_webkit2, "no WebKit stack present in Cargo.lock");
    assert!(!(has_gtk4 && has_gtk3), "mixed GTK3/GTK4 stacks detected; remove legacy gtk crate");
    assert!(!(has_webkit6 && has_webkit2), "mixed WebKit2/WebKit6 stacks detected; remove legacy webkit2gtk crate");

    if !has_gtk4 {
        eprintln!("[lockcheck] gtk4 crate missing; GTK3 stack still active");
    }
    if !has_webkit6 {
        eprintln!("[lockcheck] webkit6 crate missing; WebKit2 stack still active");
    }
    if has_gtk3 {
        eprintln!("[lockcheck] gtk crate still present (legacy GTK3)");
    }
    if has_webkit2 {
        eprintln!("[lockcheck] webkit2gtk crate still present (legacy WebKit2)");
    }
}
