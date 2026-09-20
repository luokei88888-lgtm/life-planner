use rusqlite::{params, Connection};
use serde_json::{json, Value};

use crate::domain;
use crate::error::{AppError, DB_MIGRATE_FAILED};

const MIGRATIONS: &[(&str, &str)] = &[
    ("0001_init", include_str!("../../migrations/0001_init.sql")),
    ("0002_complete", include_str!("../../migrations/0002_complete.sql")),
    ("0003_notes", include_str!("../../migrations/0003_notes.sql")),
    ("0004_habit_kind", include_str!("../../migrations/0004_habit_kind.sql")),
    ("0005_weekly_next_tasks", include_str!("../../migrations/0005_weekly_next_tasks.sql")),
    ("0006_area_score_max_5", include_str!("../../migrations/0006_area_score_max_5.sql")),
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
        if *version == "0006_area_score_max_5" {
            rescale_frozen_area_scores(conn)
                .map_err(|e| AppError::new(DB_MIGRATE_FAILED, format!("{version}: {e}")))?;
        }
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, datetime('now'))",
            [version],
        )?;
    }
    Ok(())
}

fn rescale_frozen_area_scores(conn: &Connection) -> Result<(), rusqlite::Error> {
    for table in ["monthly_reviews", "yearly_reviews"] {
        let sql = format!("SELECT id, summary_snapshot FROM {table}");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;
        let collected = rows.collect::<Result<Vec<_>, _>>()?;
        for (id, snap) in collected {
            let Some(raw) = snap.filter(|s| !s.is_empty()) else {
                continue;
            };
            let Some(next) = scale_all_snapshot_area_scores(&raw) else {
                continue;
            };
            conn.execute(
                &format!("UPDATE {table} SET summary_snapshot = ?1 WHERE id = ?2"),
                params![next, id],
            )?;
        }
    }
    Ok(())
}

fn scale_all_snapshot_area_scores(raw: &str) -> Option<String> {
    let mut value: Value = serde_json::from_str(raw).ok()?;
    let scores = value.get_mut("area_scores")?.as_array_mut()?;
    let mut changed = false;
    for item in scores {
        let Some(score) = item.get("score").and_then(Value::as_i64) else {
            continue;
        };
        item["score"] = json!(domain::scale_area_score_from_ten(score));
        changed = true;
    }
    changed.then(|| value.to_string())
}
