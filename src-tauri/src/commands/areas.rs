use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{self, Db};
use crate::domain::{self, catalog};
use crate::error::{AppError, AREA_NAME_TAKEN, NOT_FOUND, VALIDATION_FAILED};

#[derive(Serialize)]
pub struct Area {
    pub id: String,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
    pub score: Option<i64>,
    pub scored_at: Option<String>,
    pub is_archived: bool,
}

#[derive(Deserialize, Clone)]
pub struct AreaScoreInput {
    pub id: String,
    pub score: i64,
}

fn map_area(row: &rusqlite::Row<'_>) -> rusqlite::Result<Area> {
    Ok(Area {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        sort_order: row.get(3)?,
        score: row.get(4)?,
        scored_at: row.get(5)?,
        is_archived: row.get::<_, i64>(6)? == 1,
    })
}

fn list_all_by_archive(conn: &rusqlite::Connection, archived: bool) -> Result<Vec<Area>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, sort_order, score, scored_at, is_archived
         FROM areas WHERE is_archived = ?1 ORDER BY sort_order ASC",
    )?;
    let flag = if archived { 1 } else { 0 };
    let rows = stmt.query_map([flag], map_area)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn list_active(conn: &rusqlite::Connection) -> Result<Vec<Area>, AppError> {
    list_all_by_archive(conn, false)
}

fn name_taken(conn: &rusqlite::Connection, name: &str, except_id: Option<&str>) -> Result<bool, AppError> {
    let count: i64 = match except_id {
        Some(id) => conn.query_row(
            "SELECT COUNT(1) FROM areas WHERE name = ?1 AND id != ?2",
            rusqlite::params![name, id],
            |row| row.get(0),
        )?,
        None => conn.query_row(
            "SELECT COUNT(1) FROM areas WHERE name = ?1",
            [name],
            |row| row.get(0),
        )?,
    };
    Ok(count > 0)
}

fn require_active(conn: &rusqlite::Connection, id: &str) -> Result<Area, AppError> {
    let area = conn
        .query_row(
            "SELECT id, name, color, sort_order, score, scored_at, is_archived
             FROM areas WHERE id = ?1",
            [id],
            map_area,
        )
        .optional()?;
    match area {
        Some(a) if !a.is_archived => Ok(a),
        _ => Err(AppError::new(NOT_FOUND, "维度不存在")),
    }
}

#[tauri::command]
pub fn list_areas(db: State<'_, Db>) -> Result<Vec<Area>, AppError> {
    db::with_conn(&db, list_active)
}

#[tauri::command]
pub fn list_archived_areas(db: State<'_, Db>) -> Result<Vec<Area>, AppError> {
    db::with_conn(&db, |conn| list_all_by_archive(conn, true))
}

#[tauri::command]
pub fn create_area(db: State<'_, Db>, name: String, color: String) -> Result<Vec<Area>, AppError> {
    let name = domain::normalize_area_name(&name)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    if !domain::is_area_color(&color) {
        return Err(AppError::new(VALIDATION_FAILED, "颜色不在允许的色板内"));
    }

    db::with_conn(&db, |conn| {
        let count: i64 =
            conn.query_row("SELECT COUNT(1) FROM areas WHERE is_archived = 0", [], |row| {
                row.get(0)
            })?;
        if count >= catalog().area_count_max {
            return Err(AppError::new(
                VALIDATION_FAILED,
                format!("维度最多 {} 个", catalog().area_count_max),
            ));
        }
        if name_taken(conn, &name, None)? {
            return Err(AppError::new(AREA_NAME_TAKEN, "已有同名维度"));
        }
        let next_sort: i64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM areas",
            [],
            |row| row.get(0),
        )?;
        let id = format!(
            "a{:x}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );
        conn.execute(
            "INSERT INTO areas (id, name, color, sort_order) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, name, color, next_sort],
        )?;
        list_active(conn)
    })
}

#[tauri::command]
pub fn update_area(
    db: State<'_, Db>,
    id: String,
    name: String,
    color: String,
) -> Result<Vec<Area>, AppError> {
    let name = domain::normalize_area_name(&name)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    if !domain::is_area_color(&color) {
        return Err(AppError::new(VALIDATION_FAILED, "颜色不在允许的色板内"));
    }

    db::with_conn(&db, |conn| {
        require_active(conn, &id)?;
        if name_taken(conn, &name, Some(&id))? {
            return Err(AppError::new(AREA_NAME_TAKEN, "已有同名维度"));
        }
        conn.execute(
            "UPDATE areas SET name = ?1, color = ?2 WHERE id = ?3 AND is_archived = 0",
            rusqlite::params![name, color, id],
        )?;
        list_active(conn)
    })
}

#[tauri::command]
pub fn archive_area(db: State<'_, Db>, id: String) -> Result<Vec<Area>, AppError> {
    db::with_conn(&db, |conn| {
        require_active(conn, &id)?;
        let goals: i64 = conn.query_row(
            "SELECT COUNT(1) FROM goals WHERE area_id = ?1",
            [&id],
            |row| row.get(0),
        )?;
        let habits: i64 = conn.query_row(
            "SELECT COUNT(1) FROM habits WHERE area_id = ?1",
            [&id],
            |row| row.get(0),
        )?;
        if goals + habits > 0 {
            conn.execute(
                "UPDATE areas SET is_archived = 1 WHERE id = ?1",
                [&id],
            )?;
        } else {
            conn.execute("UPDATE notes SET area_id = NULL WHERE area_id = ?1", [&id])?;
            conn.execute("DELETE FROM areas WHERE id = ?1", [&id])?;
        }
        list_active(conn)
    })
}

#[tauri::command]
pub fn restore_area(db: State<'_, Db>, id: String) -> Result<Vec<Area>, AppError> {
    db::with_conn(&db, |conn| {
        let area = conn
            .query_row(
                "SELECT id, name, color, sort_order, score, scored_at, is_archived
                 FROM areas WHERE id = ?1",
                [&id],
                map_area,
            )
            .optional()?
            .ok_or_else(|| AppError::new(NOT_FOUND, "维度不存在"))?;
        if !area.is_archived {
            return list_all_by_archive(conn, true);
        }
        let active: i64 =
            conn.query_row("SELECT COUNT(1) FROM areas WHERE is_archived = 0", [], |row| {
                row.get(0)
            })?;
        if active >= catalog().area_count_max {
            return Err(AppError::new(
                VALIDATION_FAILED,
                format!("进行中的维度最多 {} 个，先归档一个再恢复", catalog().area_count_max),
            ));
        }
        conn.execute("UPDATE areas SET is_archived = 0 WHERE id = ?1", [&id])?;
        list_all_by_archive(conn, true)
    })
}

pub(crate) fn apply_scores(
    conn: &rusqlite::Connection,
    scores: &[AreaScoreInput],
) -> Result<(), AppError> {
    for item in scores {
        if !(1..=10).contains(&item.score) {
            return Err(AppError::new(VALIDATION_FAILED, "分数必须在 1 到 10 之间"));
        }
    }
    for item in scores {
        let changed = conn.execute(
            "UPDATE areas SET score = ?1, scored_at = datetime('now')
             WHERE id = ?2 AND is_archived = 0",
            rusqlite::params![item.score, item.id],
        )?;
        if changed == 0 {
            return Err(AppError::new(NOT_FOUND, "存在未知或已归档的维度"));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn score_areas(db: State<'_, Db>, scores: Vec<AreaScoreInput>) -> Result<Vec<Area>, AppError> {
    if scores.is_empty() {
        return Err(AppError::new(VALIDATION_FAILED, "请至少提交一个分数"));
    }
    db::with_conn(&db, |conn| {
        let tx = conn.unchecked_transaction()?;
        apply_scores(&tx, &scores)?;
        tx.commit()?;
        list_active(conn)
    })
}
