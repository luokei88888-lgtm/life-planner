use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::db::{self, Db};
use crate::domain::{self, format_date, today};
use crate::error::{AppError, SETTINGS_INVALID};

#[derive(Serialize)]
pub struct SettingsMap {
    pub theme: String,
    pub week_starts_on: i64,
    pub auto_backup: bool,
    pub keep_backups: i64,
    pub last_backup_at: Option<String>,
    pub onboarded: bool,
    pub reminder_enabled: bool,
    pub reminder_time: String,
    pub sync_dir: String,
    pub last_sync_at: Option<String>,
    pub started_on: Option<String>,
}

pub(crate) fn load(conn: &Connection) -> Result<SettingsMap, AppError> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(SettingsMap {
        theme: map.get("theme").cloned().unwrap_or_else(|| "dark".into()),
        week_starts_on: map
            .get("week_starts_on")
            .and_then(|v| v.parse().ok())
            .unwrap_or(1),
        auto_backup: map.get("auto_backup").map(|v| v == "1").unwrap_or(true),
        keep_backups: map
            .get("keep_backups")
            .and_then(|v| v.parse().ok())
            .unwrap_or(7),
        last_backup_at: map
            .get("last_backup_at")
            .cloned()
            .filter(|v| !v.is_empty()),
        onboarded: map.get("onboarded").map(|v| v == "1").unwrap_or(false),
        reminder_enabled: map
            .get("reminder_enabled")
            .map(|v| v == "1")
            .unwrap_or(true),
        reminder_time: map
            .get("reminder_time")
            .cloned()
            .filter(|v| domain::is_reminder_time(v))
            .unwrap_or_else(|| "09:00".into()),
        sync_dir: map.get("sync_dir").cloned().unwrap_or_default(),
        last_sync_at: map
            .get("last_sync_at")
            .cloned()
            .filter(|v| !v.is_empty()),
        started_on: map
            .get("started_on")
            .cloned()
            .filter(|v| domain::parse_date(v).is_ok()),
    })
}

pub(crate) fn upsert(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

fn read_started_on(conn: &Connection) -> Result<Option<chrono::NaiveDate>, AppError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'started_on'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .and_then(|v| domain::parse_date(v).ok()))
}

fn infer_started_on(conn: &Connection) -> Result<chrono::NaiveDate, AppError> {
    let inferred: Option<String> = conn.query_row(
        "SELECT MIN(day) FROM (
            SELECT substr(created_at, 1, 10) AS day FROM goals
            UNION ALL SELECT substr(created_at, 1, 10) FROM habits
            UNION ALL SELECT substr(created_at, 1, 10) FROM notes
            UNION ALL SELECT week_start FROM tasks
         ) WHERE day IS NOT NULL AND length(day) = 10",
        [],
        |row| row.get(0),
    )?;
    if let Some(raw) = inferred {
        if let Ok(date) = domain::parse_date(&raw) {
            return Ok(date);
        }
    }
    Ok(today())
}

pub(crate) fn ensure_started_on(conn: &Connection) -> Result<chrono::NaiveDate, AppError> {
    if let Some(date) = read_started_on(conn)? {
        return Ok(date);
    }
    let date = infer_started_on(conn)?;
    upsert(conn, "started_on", &format_date(date))?;
    Ok(date)
}

#[tauri::command]
pub fn mark_started(db: State<'_, Db>) -> Result<SettingsMap, AppError> {
    db::with_conn(&db, |conn| {
        ensure_started_on(conn)?;
        load(conn)
    })
}

#[tauri::command]
pub fn get_settings(db: State<'_, Db>) -> Result<SettingsMap, AppError> {
    db::with_conn(&db, load)
}

#[tauri::command]
pub fn set_theme(db: State<'_, Db>, theme: String) -> Result<SettingsMap, AppError> {
    if !domain::is_theme(&theme) {
        return Err(AppError::new(
            SETTINGS_INVALID,
            "主题不在支持列表中",
        ));
    }
    db::with_conn(&db, |conn| {
        upsert(conn, "theme", &theme)?;
        load(conn)
    })
}

#[tauri::command]
pub fn set_week_starts_on(db: State<'_, Db>, week_starts_on: i64) -> Result<SettingsMap, AppError> {
    if !domain::is_week_starts_on(week_starts_on) {
        return Err(AppError::new(SETTINGS_INVALID, "每周起始日只支持周一或周日"));
    }
    db::with_conn(&db, |conn| {
        upsert(conn, "week_starts_on", &week_starts_on.to_string())?;
        load(conn)
    })
}

#[tauri::command]
pub fn set_auto_backup(db: State<'_, Db>, enabled: bool) -> Result<SettingsMap, AppError> {
    db::with_conn(&db, |conn| {
        upsert(conn, "auto_backup", if enabled { "1" } else { "0" })?;
        load(conn)
    })
}

#[tauri::command]
pub fn set_keep_backups(
    app: AppHandle,
    db: State<'_, Db>,
    keep_backups: i64,
) -> Result<SettingsMap, AppError> {
    if !domain::is_keep_backups(keep_backups) {
        return Err(AppError::new(SETTINGS_INVALID, "保留备份份数不在允许范围内"));
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new(crate::error::DB_OPEN_FAILED, e.to_string()))?;
    db::with_conn(&db, |conn| {
        upsert(conn, "keep_backups", &keep_backups.to_string())?;
        crate::backup::prune_to_keep(&dir, keep_backups)?;
        load(conn)
    })
}

#[tauri::command]
pub fn set_reminder_enabled(db: State<'_, Db>, enabled: bool) -> Result<SettingsMap, AppError> {
    db::with_conn(&db, |conn| {
        upsert(conn, "reminder_enabled", if enabled { "1" } else { "0" })?;
        load(conn)
    })
}

#[tauri::command]
pub fn set_reminder_time(db: State<'_, Db>, reminder_time: String) -> Result<SettingsMap, AppError> {
    let reminder_time = domain::normalize_reminder_time(&reminder_time)
        .map_err(|message| AppError::new(SETTINGS_INVALID, message))?;
    db::with_conn(&db, |conn| {
        upsert(conn, "reminder_time", &reminder_time)?;
        load(conn)
    })
}

pub fn normalize_sync_dir(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if trimmed.chars().count() > 500 || trimmed.contains('\0') {
        return Err(AppError::new(SETTINGS_INVALID, "同步目录无效"));
    }
    let path = std::path::Path::new(trimmed);
    if !path.is_dir() {
        return Err(AppError::new(SETTINGS_INVALID, "同步目录不存在"));
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub fn set_sync_dir(db: State<'_, Db>, sync_dir: String) -> Result<SettingsMap, AppError> {
    let value = normalize_sync_dir(&sync_dir)?;
    db::with_conn(&db, |conn| {
        upsert(conn, "sync_dir", &value)?;
        load(conn)
    })
}
