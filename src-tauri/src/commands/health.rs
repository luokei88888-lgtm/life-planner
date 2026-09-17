use serde::Serialize;

#[derive(Serialize)]
pub struct Health {
    pub ok: bool,
    pub version: &'static str,
}

#[tauri::command]
pub fn health() -> Health {
    Health {
        ok: true,
        version: env!("CARGO_PKG_VERSION"),
    }
}
