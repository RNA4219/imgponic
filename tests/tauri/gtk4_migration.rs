use std::fs;

struct Gtk4ApiRename {
    old: &'static str,
    new: &'static str,
    note: &'static str,
}

const GTK4_API_RENAMES: &[Gtk4ApiRename] = &[
    Gtk4ApiRename {
        old: "gtk::ApplicationWindow",
        new: "gtk4::ApplicationWindow",
        note: "GtkApplicationWindow type moved to the gtk4 crate",
    },
    Gtk4ApiRename {
        old: "ApplicationWindow::set_child",
        new: "ApplicationWindow::set_content",
        note: "gtk4 replaces set_child with set_content",
    },
    Gtk4ApiRename {
        old: "gtk::HeaderBar",
        new: "gtk4::HeaderBar",
        note: "HeaderBar moved under gtk4 namespace",
    },
    Gtk4ApiRename {
        old: "HeaderBar::pack_start",
        new: "HeaderBar::set_title_widget",
        note: "pack_start/pack_end were replaced by explicit title widget",
    },
];

fn extract_known_failures(log: &str) -> Vec<String> {
    GTK4_API_RENAMES
        .iter()
        .filter(|rename| log.contains(rename.old))
        .map(|rename| format!("{} -> {} ({})", rename.old, rename.new, rename.note))
        .collect()
}

#[test]
#[should_panic(expected = "GTK4 migration required")]
fn gtk4_widget_initialization_still_fails() {
    let log = fs::read_to_string("target/tauri-api-diff.log")
        .expect("tauri API diff log should be readable");

    let failures = extract_known_failures(&log);

    if failures.is_empty() {
        panic!("GTK4 migration required: known failures not detected in tauri-api-diff.log");
    } else {
        panic!(
            "GTK4 migration required: {}",
            failures.join(", ")
        );
    }
}
