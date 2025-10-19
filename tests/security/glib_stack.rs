use std::fs;

fn parse_version_components(version: &str) -> Option<(u32, u32, u32)> {
    let core = version.split(['+', '-']).next().map(str::trim)?;
    let mut parts = core.split('.');

    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;

    Some((major, minor, patch))
}

#[test]
fn glib_version_is_at_least_0_20_0() {
    let lockfile = fs::read_to_string("Cargo.lock").expect("Cargo.lock should be readable");

    let mut in_glib_package = false;
    let mut max_version: Option<((u32, u32, u32), String)> = None;

    for line in lockfile.lines() {
        let trimmed = line.trim();

        if trimmed == "[[package]]" {
            in_glib_package = false;
            continue;
        }

        if trimmed == "name = \"glib\"" {
            in_glib_package = true;
            continue;
        }

        if in_glib_package && trimmed.starts_with("version =") {
            if let Some(version_value) = trimmed.split('"').nth(1) {
                if let Some(parsed) = parse_version_components(version_value) {
                    match max_version {
                        Some((current, _)) if current >= parsed => {}
                        _ => {
                            max_version = Some((parsed, version_value.to_string()));
                        }
                    }
                }
            }
        }
    }

    let (parsed_version, version_value) = max_version
        .expect("glib entry with a version should exist in Cargo.lock");

    assert!(
        parsed_version >= (0, 20, 0),
        "glib version too old: {}",
        version_value
    );
}
