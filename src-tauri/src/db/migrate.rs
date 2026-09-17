use rusqlite::Connection;

use crate::error::{AppError, DB_MIGRATE_FAILED};

const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_init", include_str!("../../migrations/0001_init.sql")),
    ("0002_complete", include_str!("../../migrations/0002_complete.sql")),
    ("0003_notes", include_str!("../../migrations/0003_notes.sql")),
];

pub fn run(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );",
    )
    .map_err(|e| AppError::new(DB_MIGRATE_FAILED, e.to_string()))?;

    for (version, sql) in MIGRATIONS {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(1) FROM schema_migrations WHERE version = ?1",
            [version],
            |row| row.get(0),
        )?;
        if exists > 0 {
            continue;
        }
        conn.execute_batch(sql)
            .map_err(|e| AppError::new(DB_MIGRATE_FAILED, format!("{version}: {e}")))?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, datetime('now'))",
            [version],
        )?;
    }
    Ok(())
}
