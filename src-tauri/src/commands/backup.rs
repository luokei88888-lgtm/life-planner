use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::backup;
use crate::commands::settings::{self, SettingsMap};
use crate::db::{self, Db};
use crate::error::{AppError, DB_OPEN_FAILED};

#[derive(Serialize)]
pub struct BackupResult {
    pub file_name: String,
    pub last_backup_at: String,
    pub settings: SettingsMap,
}

fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    app.path()
        .app_data_dir()
        .map_err(|e| AppError::new(DB_OPEN_FAILED, e.to_string()))
}

#[tauri::command]
pub fn backup_now(app: AppHandle, db: State<'_, Db>) -> Result<BackupResult, AppError> {
    let dir = data_dir(&app)?;
    db::with_conn(&db, |conn| {
        let snap = backup::create_snapshot(conn, &dir)?;
        let _ = backup::mirror_sync(conn, &dir);
        Ok(BackupResult {
            file_name: snap.file_name,
            last_backup_at: snap.last_backup_at,
            settings: settings::load(conn)?,
        })
    })
}

#[tauri::command]
pub fn export_json(db: State<'_, Db>) -> Result<String, AppError> {
    db::with_conn(&db, backup::export_json)
}

#[tauri::command]
pub fn import_json(app: AppHandle, db: State<'_, Db>, payload: String) -> Result<BackupResult, AppError> {
    let dir = data_dir(&app)?;
    db::with_conn(&db, |conn| {
        let snap = backup::import_json(conn, &dir, &payload)?;
        Ok(BackupResult {
            file_name: snap.file_name,
            last_backup_at: snap.last_backup_at,
            settings: settings::load(conn)?,
        })
    })
}
