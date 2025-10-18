use std::fs;

fn parse_version_components(version: &str) -> Option<(u32, u32, u32)> {
    let core = version
        .split(['+', '-'])
        .next()
        .map(str::trim)?;
    let mut parts = core.split('.');

    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;

    Some((major, minor, patch))
}

#[test]
fn glib_version_is_at_least_0_20_0() {
    let lockfile = fs::read_to_string("Cargo.lock").expect("Cargo.lock should be readable");

    let mut version_line: Option<String> = None;
    let mut in_glib_package = false;

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
            version_line = Some(trimmed.to_string());
            break;
        }
    }

    let version_line = version_line.expect("glib entry with a version should exist in Cargo.lock");
    let version_value = version_line
        .split('"')
        .nth(1)
        .expect("version line should contain quoted value");

    let parsed_version = parse_version_components(version_value)
        .expect("version components should parse to integers");

    assert!(parsed_version >= (0, 20, 0), "glib version too old: {}", version_value);
}
