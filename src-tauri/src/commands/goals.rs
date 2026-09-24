use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::db::{self, Db};
use crate::domain::{self, catalog, format_date, is_allowed_parent, parent_level, parse_date, period_for, today, week_start};
use crate::error::{
    AppError, GOAL_IN_USE, GOAL_PARENT_INVALID, NOT_FOUND, STATUS_INVALID, VALIDATION_FAILED,
};

#[derive(Serialize, Clone)]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub level: String,
    pub parent_id: Option<String>,
    pub area_id: String,
    pub why: String,
    pub period_start: String,
    pub period_end: String,
    pub status: String,
    pub progress: i64,
    pub status_reason: Option<String>,
    pub done_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub child_count: i64,
    pub task_count: i64,
    pub week_task_total: i64,
    pub week_task_done: i64,
}

#[derive(Serialize)]
pub struct GoalHistory {
    pub id: String,
    pub goal_id: String,
    pub from_status: String,
    pub to_status: String,
    pub reason: Option<String>,
    pub changed_at: String,
}

#[derive(Serialize)]
pub struct GoalMutation {
    pub goals: Vec<Goal>,
    pub warning: Option<String>,
    pub selected_id: Option<String>,
}

fn map_goal(row: &rusqlite::Row<'_>) -> rusqlite::Result<Goal> {
    Ok(Goal {
        id: row.get(0)?,
        title: row.get(1)?,
        level: row.get(2)?,
        parent_id: row.get(3)?,
        area_id: row.get(4)?,
        why: row.get(5)?,
        period_start: row.get(6)?,
        period_end: row.get(7)?,
        status: row.get(8)?,
        progress: row.get(9)?,
        status_reason: row.get(10)?,
        done_at: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        child_count: row.get(14)?,
        task_count: row.get(15)?,
        week_task_total: row.get(16)?,
        week_task_done: row.get(17)?,
    })
}

const GOAL_SELECT: &str = "SELECT id, title, level, parent_id, area_id, why, period_start, period_end,
        status, progress, status_reason, done_at, created_at, updated_at,
        (SELECT COUNT(1) FROM goals c WHERE c.parent_id = goals.id),
        (SELECT COUNT(1) FROM tasks t WHERE t.goal_id = goals.id),
        (SELECT COUNT(1) FROM tasks t WHERE t.goal_id = goals.id AND t.week_start = ?1),
        (SELECT COUNT(1) FROM tasks t WHERE t.goal_id = goals.id AND t.week_start = ?1 AND t.status = 'done')
     FROM goals";

fn current_week(conn: &Connection) -> Result<String, AppError> {
    Ok(format_date(week_start(today(), week_starts_on(conn)?)))
}

pub(crate) fn list_all(conn: &Connection) -> Result<Vec<Goal>, AppError> {
    let week = current_week(conn)?;
    let mut stmt = conn.prepare(&format!("{GOAL_SELECT} ORDER BY period_start ASC, created_at ASC"))?;
    let rows = stmt.query_map([&week], map_goal)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn get_by_id(conn: &Connection, id: &str) -> Result<Goal, AppError> {
    let week = current_week(conn)?;
    conn.query_row(
        &format!("{GOAL_SELECT} WHERE id = ?2"),
        params![week, id],
        map_goal,
    )
    .optional()?
    .ok_or_else(|| AppError::new(NOT_FOUND, "目标不存在"))
}

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

fn area_exists(conn: &Connection, area_id: &str) -> Result<(), AppError> {
    let ok: i64 = conn.query_row(
        "SELECT COUNT(1) FROM areas WHERE id = ?1 AND is_archived = 0",
        [area_id],
        |row| row.get(0),
    )?;
    if ok == 0 {
        return Err(AppError::new(NOT_FOUND, "维度不存在或已归档"));
    }
    Ok(())
}

fn active_count(conn: &Connection, level: &str, today: chrono::NaiveDate, week_starts_on: i64) -> Result<i64, AppError> {
    let sql = match level {
        "week" => {
            let start = domain::week_start(today, week_starts_on);
            return conn.query_row(
                "SELECT COUNT(1) FROM goals WHERE level = 'week' AND status = 'active' AND period_start = ?1",
                [format_date(start)],
                |row| row.get(0),
            )
            .map_err(Into::into);
        }
        "month" => {
            let prefix = today.format("%Y-%m").to_string();
            return conn.query_row(
                "SELECT COUNT(1) FROM goals WHERE level = 'month' AND status = 'active' AND period_start LIKE ?1",
                [format!("{prefix}%")],
                |row| row.get(0),
            )
            .map_err(Into::into);
        }
        _ => "SELECT COUNT(1) FROM goals WHERE level = ?1 AND status = 'active'",
    };
    conn.query_row(sql, [level], |row| row.get(0))
        .map_err(Into::into)
}

fn over_limit_warning(
    conn: &Connection,
    level: &str,
    today: chrono::NaiveDate,
    week_starts_on: i64,
) -> Result<Option<String>, AppError> {
    let n = active_count(conn, level, today, week_starts_on)?;
    let limit = catalog().active_limits.for_level(level);
    if n > limit {
        Ok(Some(format!(
            "{}目标进行中已有 {} 个，超过建议的 {} 个。少即是多。",
            domain::level_label(level),
            n,
            limit
        )))
    } else {
        Ok(None)
    }
}

fn insert_history(
    conn: &Connection,
    goal_id: &str,
    from: &str,
    to: &str,
    reason: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO goal_status_history (id, goal_id, from_status, to_status, reason, changed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        params![
            db::new_id("gh"),
            goal_id,
            from,
            to,
            if reason.is_empty() { None } else { Some(reason) }
        ],
    )?;
    Ok(())
}

fn apply_status(conn: &Connection, goal: &Goal, to: &str, reason: &str) -> Result<(), AppError> {
    let today = format_date(today());
    let (progress, done_at): (i64, Option<String>) = if to == "done" {
        (100, Some(today))
    } else {
        (goal.progress, None)
    };
    let status_reason = if reason.is_empty() { None } else { Some(reason) };
    conn.execute(
        "UPDATE goals SET status = ?1, progress = ?2, status_reason = ?3, done_at = ?4, updated_at = datetime('now')
         WHERE id = ?5",
        params![to, progress, status_reason, done_at, goal.id],
    )?;
    insert_history(conn, &goal.id, &goal.status, to, reason)?;
    Ok(())
}

fn descendants(conn: &Connection, id: &str) -> Result<Vec<Goal>, AppError> {
    let all = list_all(conn)?;
    fn walk(id: &str, all: &[Goal], out: &mut Vec<Goal>) {
        for child in all.iter().filter(|g| g.parent_id.as_deref() == Some(id)) {
            out.push(child.clone());
            walk(&child.id, all, out);
        }
    }
    let mut out = Vec::new();
    walk(id, &all, &mut out);
    Ok(out)
}

fn mutation(conn: &Connection, warning: Option<String>, selected_id: Option<String>) -> Result<GoalMutation, AppError> {
    Ok(GoalMutation {
        goals: list_all(conn)?,
        warning,
        selected_id,
    })
}

#[tauri::command]
pub fn list_goals(db: State<'_, Db>) -> Result<Vec<Goal>, AppError> {
    db::with_conn(&db, list_all)
}

#[tauri::command]
pub fn list_goal_history(db: State<'_, Db>, id: String) -> Result<Vec<GoalHistory>, AppError> {
    db::with_conn(&db, |conn| {
        get_by_id(conn, &id)?;
        let mut stmt = conn.prepare(
            "SELECT id, goal_id, from_status, to_status, reason, changed_at
             FROM goal_status_history WHERE goal_id = ?1 ORDER BY changed_at ASC",
        )?;
        let rows = stmt.query_map([&id], |row| {
            Ok(GoalHistory {
                id: row.get(0)?,
                goal_id: row.get(1)?,
                from_status: row.get(2)?,
                to_status: row.get(3)?,
                reason: row.get(4)?,
                changed_at: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    })
}

pub(crate) fn insert_goal(
    conn: &Connection,
    title: &str,
    why: &str,
    area_id: &str,
    level: &str,
    parent_id: Option<&str>,
    year: i64,
) -> Result<(String, Option<String>), AppError> {
    if !domain::is_goal_level(level) {
        return Err(AppError::new(VALIDATION_FAILED, "不支持的目标层级"));
    }
    if !(2000..=2100).contains(&year) {
        return Err(AppError::new(VALIDATION_FAILED, "年份无效"));
    }
    area_exists(conn, area_id)?;
    let parent = match parent_id {
        Some(_) if parent_level(level).is_none() => {
            return Err(AppError::new(
                GOAL_PARENT_INVALID,
                format!("{}目标不能挂上级", domain::level_label(level)),
            ));
        }
        None => None,
        Some(id) => {
            let parent = get_by_id(conn, id)?;
            if !is_allowed_parent(level, &parent.level) {
                return Err(AppError::new(
                    GOAL_PARENT_INVALID,
                    format!(
                        "{}目标的上级只能是{}",
                        domain::level_label(level),
                        domain::allowed_parent_label(level)
                    ),
                ));
            }
            if parent.status != "active" {
                return Err(AppError::new(
                    GOAL_PARENT_INVALID,
                    "上级目标不是进行中状态，先恢复它",
                ));
            }
            if parent.level != "life" && parent.area_id != area_id {
                return Err(AppError::new(GOAL_PARENT_INVALID, "下级必须和上级在同一维度"));
            }
            Some(parent)
        }
    };
    let why = domain::normalize_goal_why(why, parent.is_some())
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;

    let today = today();
    let week_start_on = week_starts_on(conn)?;
    let parent_period = parent.as_ref().map(|p| {
        (
            parse_date(&p.period_start).unwrap_or(today),
            parse_date(&p.period_end).unwrap_or(today),
        )
    });
    let (start, end) = period_for(level, year as i32, today, week_start_on, parent_period);
    let id = db::new_id("g");
    conn.execute(
        "INSERT INTO goals (
            id, title, level, parent_id, area_id, why, period_start, period_end,
            status, progress, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'active', 0, datetime('now'), datetime('now'))",
        params![
            id,
            title,
            level,
            parent.as_ref().map(|p| p.id.clone()),
            area_id,
            why,
            format_date(start),
            format_date(end)
        ],
    )?;
    let warning = over_limit_warning(conn, level, today, week_start_on)?;
    Ok((id, warning))
}

#[tauri::command]
pub fn create_goal(
    db: State<'_, Db>,
    title: String,
    why: String,
    area_id: String,
    level: String,
    parent_id: Option<String>,
    year: i64,
) -> Result<GoalMutation, AppError> {
    let title = domain::normalize_goal_title(&title)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    let parent_id = parent_id.filter(|v| !v.is_empty());

    db::with_conn(&db, |conn| {
        let (id, warning) = insert_goal(
            conn,
            &title,
            &why,
            &area_id,
            &level,
            parent_id.as_deref(),
            year,
        )?;
        mutation(conn, warning, Some(id))
    })
}

#[tauri::command]
pub fn update_goal(
    db: State<'_, Db>,
    id: String,
    title: String,
    why: String,
    area_id: String,
) -> Result<GoalMutation, AppError> {
    let title = domain::normalize_goal_title(&title)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;

    db::with_conn(&db, |conn| {
        let current = get_by_id(conn, &id)?;
        let why = domain::normalize_goal_why(&why, current.parent_id.is_some())
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        area_exists(conn, &area_id)?;
        conn.execute(
            "UPDATE goals SET title = ?1, why = ?2, area_id = ?3, updated_at = datetime('now') WHERE id = ?4",
            params![title, why, area_id, id],
        )?;
        mutation(conn, None, Some(id))
    })
}

#[tauri::command]
pub fn set_goal_progress(
    db: State<'_, Db>,
    id: String,
    progress: i64,
) -> Result<GoalMutation, AppError> {
    if !(0..=100).contains(&progress) {
        return Err(AppError::new(VALIDATION_FAILED, "进度必须在 0 到 100 之间"));
    }
    db::with_conn(&db, |conn| {
        let goal = get_by_id(conn, &id)?;
        if goal.status == "done" || goal.status == "dropped" {
            return Err(AppError::new(STATUS_INVALID, "已完成或已放弃的目标不能改进度"));
        }
        conn.execute(
            "UPDATE goals SET progress = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![progress, id],
        )?;
        mutation(conn, None, Some(id))
    })
}

#[tauri::command]
pub fn set_goal_status(
    db: State<'_, Db>,
    id: String,
    to: String,
    reason: Option<String>,
    cascade: bool,
) -> Result<GoalMutation, AppError> {
    if !domain::is_goal_status(&to) {
        return Err(AppError::new(VALIDATION_FAILED, "不支持的目标状态"));
    }
    let reason_required = to == "paused" || to == "dropped";
    let reason = domain::normalize_status_reason(reason.as_deref().unwrap_or(""), reason_required)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;

    db::with_conn(&db, |conn| {
        let goal = get_by_id(conn, &id)?;
        if goal.status == to {
            return mutation(conn, None, Some(id));
        }
        if !domain::can_transition(&goal.status, &to) {
            return Err(AppError::new(STATUS_INVALID, "不能这样变更状态"));
        }
        let tx = conn.unchecked_transaction()?;
        if to == "dropped" && cascade {
            for child in descendants(&*tx, &id)? {
                if child.status == "active" {
                    apply_status(&*tx, &child, "dropped", "随上级目标一并放弃")?;
                }
            }
        }
        apply_status(&*tx, &goal, &to, &reason)?;
        tx.commit()?;
        mutation(conn, None, Some(id))
    })
}

#[tauri::command]
pub fn delete_goal(db: State<'_, Db>, id: String) -> Result<GoalMutation, AppError> {
    db::with_conn(&db, |conn| delete_goal_record(conn, &id))
}

pub(crate) fn delete_goal_record(conn: &Connection, id: &str) -> Result<GoalMutation, AppError> {
    let goal = get_by_id(conn, id)?;
    if goal.child_count > 0 || goal.task_count > 0 {
        return Err(AppError::new(
            GOAL_IN_USE,
            "有子目标或任务的目标不能删除",
        ));
    }
    conn.execute("UPDATE habits SET goal_id = NULL WHERE goal_id = ?1", [id])?;
    conn.execute("UPDATE notes SET goal_id = NULL WHERE goal_id = ?1", [id])?;
    conn.execute("DELETE FROM goal_status_history WHERE goal_id = ?1", [id])?;
    conn.execute("DELETE FROM goals WHERE id = ?1", [id])?;
    mutation(conn, None, None)
}
