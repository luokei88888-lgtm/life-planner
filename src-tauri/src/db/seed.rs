use rusqlite::Connection;

use crate::error::AppError;

const DEFAULT_AREAS: &[(&str, &str, &str, i64)] = &[
    ("a1", "健康", "#2f9e77", 1),
    ("a2", "事业", "#3b6fd6", 2),
    ("a3", "财务", "#c9a227", 3),
    ("a4", "家庭", "#d9654b", 4),
    ("a5", "关系", "#b45fbf", 5),
    ("a6", "成长", "#2a9db5", 6),
    ("a7", "兴趣", "#e08a2e", 7),
    ("a8", "贡献", "#7a8699", 8),
];

const DEFAULT_SETTINGS: &[(&str, &str)] = &[
    ("theme", "dark"),
    ("week_starts_on", "1"),
    ("auto_backup", "1"),
    ("keep_backups", "7"),
    ("onboarded", "0"),
    ("last_backup_at", ""),
    ("reminder_enabled", "1"),
    ("reminder_time", "09:00"),
    ("sync_dir", ""),
    ("last_reminder_date", ""),
    ("last_sync_at", ""),
    ("started_on", ""),
    ("close_behavior", "ask"),
];

pub fn run(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn.prepare(
        "INSERT INTO areas (id, name, color, sort_order, is_archived)
         VALUES (?1, ?2, ?3, ?4, 0)
         ON CONFLICT(id) DO UPDATE SET is_archived = 0",
    )?;
    for (id, name, color, sort) in DEFAULT_AREAS {
        stmt.execute(rusqlite::params![id, name, color, sort])?;
    }

    let mut stmt = conn.prepare(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO NOTHING",
    )?;
    for (key, value) in DEFAULT_SETTINGS {
        stmt.execute([key, value])?;
    }
    Ok(())
}
