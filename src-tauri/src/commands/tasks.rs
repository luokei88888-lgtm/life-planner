use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::db::{self, Db};
use crate::domain::{self, add_days, catalog, format_date, parse_date, today, week_start};
use crate::error::{AppError, FOCUS_LIMIT, NOT_FOUND, VALIDATION_FAILED, WEEK_LOCKED};

#[derive(Serialize, Clone)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub goal_id: Option<String>,
    pub week_start: String,
    pub planned_date: Option<String>,
    pub is_focus: bool,
    pub status: String,
    pub done_at: Option<String>,
    pub sort_order: i64,
    pub carried_over_count: i64,
}

#[derive(Serialize)]
pub struct WeekPlan {
    pub week_start: String,
    pub locked: bool,
    pub tasks: Vec<Task>,
    pub prev_unfinished: Vec<Task>,
}

fn map_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        goal_id: row.get(2)?,
        week_start: row.get(3)?,
        planned_date: row.get(4)?,
        is_focus: row.get::<_, i64>(5)? == 1,
        status: row.get(6)?,
        done_at: row.get(7)?,
        sort_order: row.get(8)?,
        carried_over_count: row.get(9)?,
    })
}

const TASK_SELECT: &str = "SELECT id, title, goal_id, week_start, planned_date, is_focus, status, done_at, sort_order, carried_over_count FROM tasks";

fn week_starts_on(conn: &Connection) -> Result<i64, AppError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'week_starts_on'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value.and_then(|v| v.parse().ok()).unwrap_or(1))
}

fn canonical_week(conn: &Connection, raw: &str) -> Result<String, AppError> {
    let parsed = parse_date(raw).map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    Ok(format_date(week_start(parsed, week_starts_on(conn)?)))
}

fn is_locked(conn: &Connection, week_start: &str) -> Result<bool, AppError> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(1) FROM weekly_reviews WHERE week_start = ?1 AND status = 'submitted'",
        [week_start],
        |row| row.get(0),
    )?;
    Ok(n > 0)
}

fn require_unlocked(conn: &Connection, week_start: &str) -> Result<(), AppError> {
    if is_locked(conn, week_start)? {
        return Err(AppError::new(WEEK_LOCKED, "该周已复盘，任务只读"));
    }
    Ok(())
}

fn list_by_week(conn: &Connection, week_start: &str) -> Result<Vec<Task>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "{TASK_SELECT} WHERE week_start = ?1 ORDER BY sort_order ASC, id ASC"
    ))?;
    let rows = stmt.query_map([week_start], map_task)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn list_unfinished(conn: &Connection, week_start: &str) -> Result<Vec<Task>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "{TASK_SELECT} WHERE week_start = ?1 AND status = 'todo' ORDER BY sort_order ASC, id ASC"
    ))?;
    let rows = stmt.query_map([week_start], map_task)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn get_task(conn: &Connection, id: &str) -> Result<Task, AppError> {
    conn.query_row(&format!("{TASK_SELECT} WHERE id = ?1"), [id], map_task)
        .optional()?
        .ok_or_else(|| AppError::new(NOT_FOUND, "任务不存在"))
}

fn week_plan(conn: &Connection, week: &str) -> Result<WeekPlan, AppError> {
    let prev = format_date(add_days(
        parse_date(week).map_err(|message| AppError::new(VALIDATION_FAILED, message))?,
        -7,
    ));
    Ok(WeekPlan {
        week_start: week.to_string(),
        locked: is_locked(conn, week)?,
        tasks: list_by_week(conn, week)?,
        prev_unfinished: list_unfinished(conn, &prev)?,
    })
}

fn validate_goal(
    conn: &Connection,
    goal_id: Option<&str>,
    week: &str,
) -> Result<Option<String>, AppError> {
    let Some(id) = goal_id.filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let (level, status, period_start): (String, String, String) = conn
        .query_row(
            "SELECT level, status, period_start FROM goals WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or_else(|| AppError::new(NOT_FOUND, "关联的目标不存在"))?;
    if level != "week" {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "任务只能挂在周目标下；想挂到月度目标，请先拆一个周目标",
        ));
    }
    if status != "active" {
        return Err(AppError::new(VALIDATION_FAILED, "只能关联进行中的周目标"));
    }
    if period_start != week {
        return Err(AppError::new(VALIDATION_FAILED, "任务只能挂在同一周的周目标下"));
    }
    Ok(Some(id.to_string()))
}

fn validate_planned_date(
    week: &str,
    planned_date: Option<&str>,
) -> Result<Option<String>, AppError> {
    let Some(raw) = planned_date.filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let date = parse_date(raw).map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    let start = parse_date(week).map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    let end = add_days(start, 6);
    if date < start || date > end {
        return Err(AppError::new(VALIDATION_FAILED, "计划日期必须落在这一周内"));
    }
    Ok(Some(format_date(date)))
}

fn focus_count(conn: &Connection, date: &str, except_id: Option<&str>) -> Result<i64, AppError> {
    match except_id {
        Some(id) => conn.query_row(
            "SELECT COUNT(1) FROM tasks WHERE is_focus = 1 AND planned_date = ?1 AND id != ?2",
            params![date, id],
            |row| row.get(0),
        ),
        None => conn.query_row(
            "SELECT COUNT(1) FROM tasks WHERE is_focus = 1 AND planned_date = ?1",
            [date],
            |row| row.get(0),
        ),
    }
    .map_err(Into::into)
}

fn next_sort(conn: &Connection, week: &str) -> Result<i64, AppError> {
    conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tasks WHERE week_start = ?1",
        [week],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn carry_one(conn: &Connection, task: &Task) -> Result<(), AppError> {
    require_unlocked(conn, &task.week_start)?;
    let start = parse_date(&task.week_start).map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let next = format_date(add_days(start, 7));
    require_unlocked(conn, &next)?;
    conn.execute(
        "UPDATE tasks SET week_start = ?1, planned_date = NULL, is_focus = 0,
         carried_over_count = carried_over_count + 1 WHERE id = ?2",
        params![next, task.id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_week_plan(db: State<'_, Db>, week_start: String) -> Result<WeekPlan, AppError> {
    db::with_conn(&db, |conn| {
        let week = canonical_week(conn, &week_start)?;
        week_plan(conn, &week)
    })
}

#[tauri::command]
pub fn list_goal_tasks(db: State<'_, Db>, goal_id: String) -> Result<Vec<Task>, AppError> {
    db::with_conn(&db, |conn| {
        let mut stmt = conn.prepare(&format!(
            "{TASK_SELECT} WHERE goal_id = ?1 ORDER BY sort_order ASC, id ASC"
        ))?;
        let rows = stmt.query_map([goal_id], map_task)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    })
}

pub(crate) fn insert_task(
    conn: &Connection,
    title: &str,
    week_start: &str,
    goal_id: Option<&str>,
    planned_date: Option<&str>,
    try_focus: bool,
) -> Result<(), AppError> {
    let week = canonical_week(conn, week_start)?;
    require_unlocked(conn, &week)?;
    let goal_id = validate_goal(conn, goal_id, &week)?;
    let planned_date = validate_planned_date(&week, planned_date)?;
    let is_focus = if try_focus {
        match planned_date.as_deref() {
            Some(date) => focus_count(conn, date, None)? < catalog().focus_limit_per_day,
            None => false,
        }
    } else {
        false
    };
    conn.execute(
        "INSERT INTO tasks (id, title, goal_id, week_start, planned_date, is_focus, status, sort_order, carried_over_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'todo', ?7, 0)",
        params![
            db::new_id("t"),
            title,
            goal_id,
            week,
            planned_date,
            if is_focus { 1 } else { 0 },
            next_sort(conn, &week)?
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn create_task(
    db: State<'_, Db>,
    title: String,
    week_start: String,
    goal_id: Option<String>,
    planned_date: Option<String>,
) -> Result<WeekPlan, AppError> {
    let title = domain::normalize_task_title(&title)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    db::with_conn(&db, |conn| {
        insert_task(
            conn,
            &title,
            &week_start,
            goal_id.as_deref(),
            planned_date.as_deref(),
            false,
        )?;
        let week = canonical_week(conn, &week_start)?;
        week_plan(conn, &week)
    })
}

#[tauri::command]
pub fn update_task(
    db: State<'_, Db>,
    id: String,
    title: String,
    goal_id: Option<String>,
    planned_date: Option<String>,
) -> Result<WeekPlan, AppError> {
    let title = domain::normalize_task_title(&title)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    db::with_conn(&db, |conn| {
        let task = get_task(conn, &id)?;
        require_unlocked(conn, &task.week_start)?;
        let goal_id = validate_goal(conn, goal_id.as_deref(), &task.week_start)?;
        let planned_date = validate_planned_date(&task.week_start, planned_date.as_deref())?;
        let keep_focus = task.is_focus && planned_date.is_some();
        if keep_focus {
            if let Some(date) = planned_date.as_deref() {
                if Some(date) != task.planned_date.as_deref()
                    && focus_count(conn, date, Some(&id))? >= catalog().focus_limit_per_day
                {
                    return Err(AppError::new(
                        FOCUS_LIMIT,
                        format!(
                            "{} 已有 {} 个焦点任务，先取消一个",
                            date,
                            catalog().focus_limit_per_day
                        ),
                    ));
                }
            }
        }
        conn.execute(
            "UPDATE tasks SET title = ?1, goal_id = ?2, planned_date = ?3, is_focus = ?4 WHERE id = ?5",
            params![title, goal_id, planned_date, if keep_focus { 1 } else { 0 }, id],
        )?;
        week_plan(conn, &task.week_start)
    })
}

#[tauri::command]
pub fn toggle_task(db: State<'_, Db>, id: String) -> Result<WeekPlan, AppError> {
    db::with_conn(&db, |conn| {
        let task = get_task(conn, &id)?;
        require_unlocked(conn, &task.week_start)?;
        if task.status == "done" {
            conn.execute(
                "UPDATE tasks SET status = 'todo', done_at = NULL WHERE id = ?1",
                [&id],
            )?;
        } else {
            conn.execute(
                "UPDATE tasks SET status = 'done', done_at = datetime('now') WHERE id = ?1",
                [&id],
            )?;
        }
        week_plan(conn, &task.week_start)
    })
}

#[tauri::command]
pub fn toggle_focus(db: State<'_, Db>, id: String) -> Result<WeekPlan, AppError> {
    db::with_conn(&db, |conn| {
        let task = get_task(conn, &id)?;
        require_unlocked(conn, &task.week_start)?;
        if task.is_focus {
            conn.execute("UPDATE tasks SET is_focus = 0 WHERE id = ?1", [&id])?;
            return week_plan(conn, &task.week_start);
        }
        let week = parse_date(&task.week_start)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        let today = today();
        let date = if let Some(existing) = task.planned_date.as_deref() {
            existing.to_string()
        } else if today >= week && today <= add_days(week, 6) {
            format_date(today)
        } else {
            return Err(AppError::new(VALIDATION_FAILED, "先给任务选一个计划日期"));
        };
        let limit = catalog().focus_limit_per_day;
        if focus_count(conn, &date, Some(&id))? >= limit {
            return Err(AppError::new(
                FOCUS_LIMIT,
                format!("{} 已有 {limit} 个焦点任务，先取消一个", date),
            ));
        }
        conn.execute(
            "UPDATE tasks SET is_focus = 1, planned_date = ?1 WHERE id = ?2",
            params![date, id],
        )?;
        week_plan(conn, &task.week_start)
    })
}

#[tauri::command]
pub fn delete_task(db: State<'_, Db>, id: String) -> Result<WeekPlan, AppError> {
    db::with_conn(&db, |conn| {
        let task = get_task(conn, &id)?;
        require_unlocked(conn, &task.week_start)?;
        conn.execute("DELETE FROM tasks WHERE id = ?1", [&id])?;
        week_plan(conn, &task.week_start)
    })
}

#[tauri::command]
pub fn carry_task(db: State<'_, Db>, id: String) -> Result<WeekPlan, AppError> {
    db::with_conn(&db, |conn| {
        let task = get_task(conn, &id)?;
        let view_week = task.week_start.clone();
        carry_one(conn, &task)?;
        week_plan(conn, &view_week)
    })
}

#[tauri::command]
pub fn carry_unfinished(db: State<'_, Db>, from_week: String) -> Result<WeekPlan, AppError> {
    db::with_conn(&db, |conn| {
        let from = canonical_week(conn, &from_week)?;
        let dest = format_date(add_days(
            parse_date(&from).map_err(|message| AppError::new(VALIDATION_FAILED, message))?,
            7,
        ));
        require_unlocked(conn, &from)?;
        require_unlocked(conn, &dest)?;
        let unfinished = list_unfinished(conn, &from)?;
        for task in unfinished {
            carry_one(conn, &task)?;
        }
        week_plan(conn, &dest)
    })
}
