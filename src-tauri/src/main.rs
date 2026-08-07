// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(err) = atomic_explorer_lib::run() {
        eprintln!("Failed to start Tauri application: {err}");
        std::process::exit(1);
    }
}

