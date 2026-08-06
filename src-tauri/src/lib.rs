//! Atomic Explorer — backend nativo Tauri
//!
//! Este proceso se reserva para operaciones que no necesitan ser instantáneas:
//! persistencia (SQLite), exportación de imagen/vídeo, y precómputo pesado opcional.
//! El hot path de visualización (matemáticas → render) vive en WASM dentro del webview.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
