mod migrate;
pub(crate) mod seed;

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, DB_OPEN_FAILED};

pub struct Db(pub Mutex<Connection>);

pub fn init(app: &AppHandle) -> Result<(), AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new(DB_OPEN_FAILED, e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("life-planner.db");
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
    migrate::run(&conn)?;
    seed::run(&conn)?;
    if let Err(err) = crate::backup::run_auto(&conn, &dir) {
        eprintln!("自动备份未完成：{err}");
    }
    app.manage(Db(Mutex::new(conn)));
    Ok(())
}

#[cfg(test)]
pub(crate) fn open_memory() -> Result<Connection, AppError> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    migrate::run(&conn)?;
    seed::run(&conn)?;
    Ok(conn)
}

pub fn with_conn<T>(
    db: &Db,
    f: impl FnOnce(&Connection) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let conn = db
        .0
        .lock()
        .map_err(|_| AppError::new(DB_OPEN_FAILED, "数据库锁被占用"))?;
    f(&conn)
}

pub fn new_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{prefix}{nanos:x}")
}
