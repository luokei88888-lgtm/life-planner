use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::db::{self, Db};
use crate::domain::{
    self, catalog, format_date, last_day_of_month, parse_date, today,
};
use crate::error::{AppError, NOT_FOUND, VALIDATION_FAILED};

#[derive(Serialize, Clone)]
pub struct Note {
    pub id: String,
    pub date: String,
    pub kind: String,
    pub body: String,
    pub area_id: Option<String>,
    pub goal_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub area_name: Option<String>,
    pub area_color: Option<String>,
    pub goal_title: Option<String>,
}

#[derive(Serialize)]
pub struct NotePage {
    pub notes: Vec<Note>,
    pub has_more: bool,
    pub months: Vec<String>,
}

#[derive(Serialize)]
pub struct TimelineItem {
    pub sort_at: String,
    pub date: String,
    pub item_kind: String,
    pub note: Option<Note>,
    pub from_status: Option<String>,
    pub to_status: Option<String>,
    pub reason: Option<String>,
}

const NOTE_SELECT: &str = "SELECT n.id, n.date, n.kind, n.body, n.area_id, n.goal_id,
        n.created_at, n.updated_at, a.name, a.color, g.title
     FROM notes n
     LEFT JOIN areas a ON a.id = n.area_id
     LEFT JOIN goals g ON g.id = n.goal_id";

fn map_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        date: row.get(1)?,
        kind: row.get(2)?,
        body: row.get(3)?,
        area_id: row.get(4)?,
        goal_id: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        area_name: row.get(8)?,
        area_color: row.get(9)?,
        goal_title: row.get(10)?,
    })
}

fn require_note_date(value: &str) -> Result<String, AppError> {
    let d = parse_date(value).map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    if d > today() {
        return Err(AppError::new(VALIDATION_FAILED, "不能记到未来的日期"));
    }
    Ok(format_date(d))
}

fn parse_month_key(raw: &str) -> Result<(i32, u32, String), AppError> {
    let parts: Vec<&str> = raw.split('-').collect();
    if parts.len() != 2 {
        return Err(AppError::new(VALIDATION_FAILED, "月份格式无效"));
    }
    let year: i32 = parts[0]
        .parse()
        .map_err(|_| AppError::new(VALIDATION_FAILED, "月份格式无效"))?;
    let month: u32 = parts[1]
        .parse()
        .map_err(|_| AppError::new(VALIDATION_FAILED, "月份格式无效"))?;
    if !(1..=12).contains(&month) {
        return Err(AppError::new(VALIDATION_FAILED, "月份格式无效"));
    }
    Ok((year, month, format!("{year:04}-{month:02}")))
}

fn opt_id(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|v| !v.is_empty())
}

fn resolve_links(
    conn: &Connection,
    area_id: Option<&str>,
    goal_id: Option<&str>,
) -> Result<(Option<String>, Option<String>), AppError> {
    let area_id = opt_id(area_id);
    let goal_id = opt_id(goal_id);
    let goal_area = if let Some(gid) = goal_id {
        let row: Option<(String, String)> = conn
            .query_row(
                "SELECT id, area_id FROM goals WHERE id = ?1",
                [gid],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        match row {
            Some((_, aid)) => Some(aid),
            None => return Err(AppError::new(NOT_FOUND, "目标不存在")),
        }
    } else {
        None
    };
    if let Some(aid) = area_id {
        let exists: Option<i64> = conn
            .query_row("SELECT 1 FROM areas WHERE id = ?1", [aid], |row| row.get(0))
            .optional()?;
        if exists.is_none() {
            return Err(AppError::new(NOT_FOUND, "维度不存在"));
        }
        if let Some(ga) = goal_area.as_deref() {
            if ga != aid {
                return Err(AppError::new(
                    VALIDATION_FAILED,
                    "随记只能挂到同一维度的目标下",
                ));
            }
        }
        return Ok((Some(aid.to_string()), goal_id.map(str::to_string)));
    }
    Ok((goal_area, goal_id.map(str::to_string)))
}

fn get_by_id(conn: &Connection, id: &str) -> Result<Note, AppError> {
    conn.query_row(
        &format!("{NOTE_SELECT} WHERE n.id = ?1"),
        [id],
        map_note,
    )
    .optional()?
    .ok_or_else(|| AppError::new(NOT_FOUND, "随记不存在"))
}

fn list_months(conn: &Connection) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT substr(date, 1, 7) FROM notes ORDER BY 1 DESC",
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub(crate) fn list_in_range(
    conn: &Connection,
    from: &str,
    to: &str,
) -> Result<Vec<Note>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "{NOTE_SELECT} WHERE n.date >= ?1 AND n.date <= ?2
         ORDER BY n.date DESC, n.created_at DESC, n.id DESC"
    ))?;
    let rows = stmt.query_map(params![from, to], map_note)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub(crate) fn query_page(
    conn: &Connection,
    month: Option<&str>,
    kind: Option<&str>,
    area_id: Option<&str>,
    goal_id: Option<&str>,
    q: Option<&str>,
    before_date: Option<&str>,
    before_created_at: Option<&str>,
    before_id: Option<&str>,
) -> Result<(Vec<Note>, bool), AppError> {
    let mut sql = format!("{NOTE_SELECT} WHERE 1=1");
    let mut binds: Vec<Value> = Vec::new();
    if let Some(raw) = opt_id(month) {
        let (year, mon, key) = parse_month_key(raw)?;
        sql.push_str(" AND n.date >= ? AND n.date <= ?");
        binds.push(Value::Text(format!("{key}-01")));
        binds.push(Value::Text(format_date(last_day_of_month(year, mon))));
    }
    if let Some(k) = opt_id(kind) {
        if !domain::is_note_kind(k) {
            return Err(AppError::new(VALIDATION_FAILED, "随记类型无效"));
        }
        sql.push_str(" AND n.kind = ?");
        binds.push(Value::Text(k.to_string()));
    }
    if let Some(aid) = opt_id(area_id) {
        sql.push_str(" AND n.area_id = ?");
        binds.push(Value::Text(aid.to_string()));
    }
    if let Some(gid) = opt_id(goal_id) {
        sql.push_str(" AND n.goal_id = ?");
        binds.push(Value::Text(gid.to_string()));
    }
    if let Some(raw) = q.map(str::trim).filter(|v| !v.is_empty()) {
        let needle: String = raw.chars().take(80).collect();
        sql.push_str(" AND instr(n.body, ?) > 0");
        binds.push(Value::Text(needle));
    }
    let cursor = match (opt_id(before_date), opt_id(before_created_at), opt_id(before_id)) {
        (Some(date), Some(created), Some(id)) if month.is_none() || opt_id(month).is_none() => {
            Some((date, created, id))
        }
        _ => None,
    };
    if let Some((date, created, id)) = cursor {
        sql.push_str(
            " AND (n.date < ? OR (n.date = ? AND (n.created_at < ? OR (n.created_at = ? AND n.id < ?))))",
        );
        binds.push(Value::Text(date.to_string()));
        binds.push(Value::Text(date.to_string()));
        binds.push(Value::Text(created.to_string()));
        binds.push(Value::Text(created.to_string()));
        binds.push(Value::Text(id.to_string()));
    }
    sql.push_str(" ORDER BY n.date DESC, n.created_at DESC, n.id DESC LIMIT ?");
    let page_size = if opt_id(month).is_some() {
        500
    } else {
        catalog().note_page_size.max(1).min(100)
    };
    binds.push(Value::Integer(page_size + 1));
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(binds.iter()), map_note)?;
    let mut notes = rows.collect::<Result<Vec<_>, _>>()?;
    let has_more = notes.len() as i64 > page_size;
    if has_more {
        notes.pop();
    }
    Ok((notes, has_more))
}

pub(crate) fn insert_note(
    conn: &Connection,
    date: &str,
    kind: &str,
    body: &str,
    area_id: Option<&str>,
    goal_id: Option<&str>,
) -> Result<Note, AppError> {
    let date = require_note_date(date)?;
    if !domain::is_note_kind(kind) {
        return Err(AppError::new(VALIDATION_FAILED, "随记类型无效"));
    }
    let body = domain::normalize_note_body(body)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    let (area_id, goal_id) = resolve_links(conn, area_id, goal_id)?;
    let id = db::new_id("n");
    conn.execute(
        "INSERT INTO notes (id, date, kind, body, area_id, goal_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))",
        params![id, date, kind, body, area_id, goal_id],
    )?;
    get_by_id(conn, &id)
}

#[tauri::command]
pub fn list_notes(
    db: State<'_, Db>,
    month: Option<String>,
    kind: Option<String>,
    area_id: Option<String>,
    goal_id: Option<String>,
    q: Option<String>,
    before_date: Option<String>,
    before_created_at: Option<String>,
    before_id: Option<String>,
) -> Result<NotePage, AppError> {
    db::with_conn(&db, |conn| {
        let (notes, has_more) = query_page(
            conn,
            month.as_deref(),
            kind.as_deref(),
            area_id.as_deref(),
            goal_id.as_deref(),
            q.as_deref(),
            before_date.as_deref(),
            before_created_at.as_deref(),
            before_id.as_deref(),
        )?;
        Ok(NotePage {
            notes,
            has_more,
            months: list_months(conn)?,
        })
    })
}

#[tauri::command]
pub fn list_goal_timeline(
    db: State<'_, Db>,
    goal_id: String,
) -> Result<Vec<TimelineItem>, AppError> {
    db::with_conn(&db, |conn| {
        let exists: Option<i64> = conn
            .query_row("SELECT 1 FROM goals WHERE id = ?1", [&goal_id], |row| row.get(0))
            .optional()?;
        if exists.is_none() {
            return Err(AppError::new(NOT_FOUND, "目标不存在"));
        }
        let mut note_stmt = conn.prepare(&format!(
            "{NOTE_SELECT} WHERE n.goal_id = ?1
             ORDER BY n.date DESC, n.created_at DESC, n.id DESC"
        ))?;
        let notes = note_stmt
            .query_map([&goal_id], map_note)?
            .collect::<Result<Vec<_>, _>>()?;
        let mut stmt = conn.prepare(
            "SELECT from_status, to_status, reason, changed_at
             FROM goal_status_history WHERE goal_id = ?1
             ORDER BY changed_at DESC, id DESC",
        )?;
        let history = stmt.query_map([&goal_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let mut items: Vec<TimelineItem> = Vec::new();
        for note in notes {
            items.push(TimelineItem {
                sort_at: note.created_at.clone(),
                date: note.date.clone(),
                item_kind: "note".into(),
                note: Some(note),
                from_status: None,
                to_status: None,
                reason: None,
            });
        }
        for row in history {
            let (from_status, to_status, reason, changed_at) = row?;
            let date = changed_at.get(..10).unwrap_or(changed_at.as_str()).to_string();
            items.push(TimelineItem {
                sort_at: changed_at,
                date,
                item_kind: "status".into(),
                note: None,
                from_status: Some(from_status),
                to_status: Some(to_status),
                reason,
            });
        }
        items.sort_by(|a, b| b.date.cmp(&a.date).then_with(|| b.sort_at.cmp(&a.sort_at)));
        items.truncate(300);
        Ok(items)
    })
}

#[tauri::command]
pub fn create_note(
    db: State<'_, Db>,
    date: String,
    kind: String,
    body: String,
    area_id: Option<String>,
    goal_id: Option<String>,
) -> Result<Note, AppError> {
    db::with_conn(&db, |conn| {
        insert_note(
            conn,
            &date,
            &kind,
            &body,
            area_id.as_deref(),
            goal_id.as_deref(),
        )
    })
}

#[tauri::command]
pub fn update_note(
    db: State<'_, Db>,
    id: String,
    date: String,
    kind: String,
    body: String,
    area_id: Option<String>,
    goal_id: Option<String>,
) -> Result<Note, AppError> {
    db::with_conn(&db, |conn| {
        get_by_id(conn, &id)?;
        let date = require_note_date(&date)?;
        if !domain::is_note_kind(&kind) {
            return Err(AppError::new(VALIDATION_FAILED, "随记类型无效"));
        }
        let body = domain::normalize_note_body(&body)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        let (area_id, goal_id) = resolve_links(conn, area_id.as_deref(), goal_id.as_deref())?;
        conn.execute(
            "UPDATE notes SET date = ?1, kind = ?2, body = ?3, area_id = ?4, goal_id = ?5,
             updated_at = datetime('now') WHERE id = ?6",
            params![date, kind, body, area_id, goal_id, id],
        )?;
        get_by_id(conn, &id)
    })
}

#[tauri::command]
pub fn delete_note(db: State<'_, Db>, id: String) -> Result<(), AppError> {
    db::with_conn(&db, |conn| {
        get_by_id(conn, &id)?;
        conn.execute("DELETE FROM notes WHERE id = ?1", [&id])?;
        Ok(())
    })
}
