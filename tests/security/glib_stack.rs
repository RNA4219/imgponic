use std::fs;

use semver::Version;

fn read_lockfile() -> toml::Value {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let lock_path = format!("{manifest_dir}/Cargo.lock");
    let contents = fs::read_to_string(lock_path).expect("Cargo.lock should be readable");
    toml::from_str(&contents).expect("Cargo.lock should parse as TOML")
}

#[test]
#[cfg(feature = "security")]
fn glib_and_companions_are_upgraded() {
    let lock = read_lockfile();
    let packages = lock
        .get("package")
        .and_then(|v| v.as_array())
        .expect("Cargo.lock should contain packages");

    let mut max_glib: Option<Version> = None;
    let mut has_gtk4 = false;
    let mut has_webkit6 = false;
    let mut has_gtk3 = false;
    let mut has_webkit2gtk = false;

    for pkg in packages {
        let Some(name) = pkg.get("name").and_then(|v| v.as_str()) else {
            continue;
        };
        let version_str = pkg
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or_default();

        match name {
            "glib" => {
                if let Ok(version) = Version::parse(version_str) {
                    max_glib = Some(match max_glib {
                        Some(current) => current.max(version),
                        None => version,
                    });
                }
            }
            "gtk4" => has_gtk4 = true,
            "webkit6" => has_webkit6 = true,
            "gtk" => has_gtk3 = true,
            "webkit2gtk" => has_webkit2gtk = true,
            _ => {}
        }
    }

    let max_glib = max_glib.expect("glib should appear in Cargo.lock");
    assert!(
        max_glib >= Version::parse("0.20.0").unwrap(),
        "glib version too old: {max_glib}"
    );
    assert!(has_gtk4, "gtk4 not present in Cargo.lock");
    assert!(has_webkit6, "webkit6 not present in Cargo.lock");
    assert!(!has_gtk3, "gtk (GTK3) should be removed from Cargo.lock");
    assert!(!has_webkit2gtk, "webkit2gtk should be removed from Cargo.lock");
}
