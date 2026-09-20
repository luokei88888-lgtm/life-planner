use std::collections::{HashMap, HashSet};

use chrono::Datelike;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::db::{self, Db};
use crate::domain::{
    self, add_days, catalog, format_date, habit_expected, last_day_of_month, parse_date, percent,
    today, week_start,
};
use crate::error::{AppError, BACKFILL_WINDOW, HABIT_INACTIVE, NOT_FOUND, VALIDATION_FAILED};

#[derive(Serialize, Clone)]
pub struct HabitRow {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub area_id: String,
    pub goal_id: Option<String>,
    pub frequency_type: String,
    pub frequency_target: i64,
    pub is_active: bool,
    pub created_at: String,
    pub done_today: bool,
    pub week_dates: Vec<String>,
    pub week_count: i64,
    pub streak_n: i64,
    pub streak_unit: String,
}

#[derive(Serialize)]
pub struct HabitDay {
    pub date: String,
    pub done: bool,
}

#[derive(Serialize)]
pub struct HabitDetail {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub area_id: String,
    pub goal_id: Option<String>,
    pub frequency_type: String,
    pub frequency_target: i64,
    pub is_active: bool,
    pub created_at: String,
    pub streak_n: i64,
    pub streak_unit: String,
    pub week_count: i64,
    pub month: String,
    pub month_rate: i64,
    pub prev_month: String,
    pub prev_month_rate: i64,
    pub month_logs: Vec<String>,
    pub recent: Vec<HabitDay>,
    pub backfill_from: String,
}

struct HabitRecord {
    id: String,
    title: String,
    kind: String,
    area_id: String,
    goal_id: Option<String>,
    frequency_type: String,
    frequency_target: i64,
    is_active: bool,
    created_at: String,
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

fn map_habit(row: &rusqlite::Row<'_>) -> rusqlite::Result<HabitRecord> {
    Ok(HabitRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        kind: row.get(2)?,
        area_id: row.get(3)?,
        goal_id: row.get(4)?,
        frequency_type: row.get(5)?,
        frequency_target: row.get(6)?,
        is_active: row.get::<_, i64>(7)? == 1,
        created_at: row.get(8)?,
    })
}

fn list_records(conn: &Connection) -> Result<Vec<HabitRecord>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, kind, area_id, goal_id, frequency_type, frequency_target, is_active, created_at
         FROM habits ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map([], map_habit)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn get_record(conn: &Connection, id: &str) -> Result<HabitRecord, AppError> {
    conn.query_row(
        "SELECT id, title, kind, area_id, goal_id, frequency_type, frequency_target, is_active, created_at
         FROM habits WHERE id = ?1",
        [id],
        map_habit,
    )
    .optional()?
    .ok_or_else(|| AppError::new(NOT_FOUND, "习惯不存在"))
}

fn require_area(conn: &Connection, area_id: &str) -> Result<(), AppError> {
    let archived: Option<i64> = conn
        .query_row(
            "SELECT is_archived FROM areas WHERE id = ?1",
            [area_id],
            |row| row.get(0),
        )
        .optional()?;
    match archived {
        Some(0) => Ok(()),
        _ => Err(AppError::new(NOT_FOUND, "维度不存在")),
    }
}

fn resolve_goal(conn: &Connection, area_id: &str, goal_id: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(id) = goal_id.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT id, area_id FROM goals WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    match row {
        Some((_, goal_area)) if goal_area == area_id => Ok(Some(id.to_string())),
        Some(_) => Err(AppError::new(VALIDATION_FAILED, "习惯只能挂到同一维度的目标下")),
        None => Err(AppError::new(NOT_FOUND, "目标不存在")),
    }
}

fn all_logs(conn: &Connection) -> Result<HashMap<String, HashSet<String>>, AppError> {
    let mut stmt = conn.prepare("SELECT habit_id, date FROM habit_logs WHERE done = 1")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    let mut map: HashMap<String, HashSet<String>> = HashMap::new();
    for row in rows {
        let (id, date) = row?;
        map.entry(id).or_default().insert(date);
    }
    Ok(map)
}

fn logs_of(conn: &Connection, habit_id: &str) -> Result<HashSet<String>, AppError> {
    let mut stmt = conn.prepare("SELECT date FROM habit_logs WHERE habit_id = ?1 AND done = 1")?;
    let rows = stmt.query_map([habit_id], |row| row.get::<_, String>(0))?;
    rows.collect::<Result<HashSet<_>, _>>().map_err(Into::into)
}

fn week_count(logs: &HashSet<String>, start: chrono::NaiveDate) -> i64 {
    (0..7)
        .filter(|i| logs.contains(&format_date(add_days(start, *i))))
        .count() as i64
}

fn week_dates(logs: &HashSet<String>, start: chrono::NaiveDate) -> Vec<String> {
    (0..7)
        .map(|i| format_date(add_days(start, i)))
        .filter(|d| logs.contains(d))
        .collect()
}

fn streak(habit: &HabitRecord, logs: &HashSet<String>, today: chrono::NaiveDate, week_on: i64) -> (i64, &'static str) {
    if habit.frequency_type == "weekly" {
        let this_week = week_start(today, week_on);
        let mut ws = if week_count(logs, this_week) >= habit.frequency_target {
            this_week
        } else {
            add_days(this_week, -7)
        };
        let mut n = 0;
        for _ in 0..200 {
            if week_count(logs, ws) < habit.frequency_target {
                break;
            }
            n += 1;
            ws = add_days(ws, -7);
        }
        (n, "周")
    } else {
        let mut d = if logs.contains(&format_date(today)) {
            today
        } else {
            add_days(today, -1)
        };
        let mut n = 0;
        for _ in 0..4000 {
            if !logs.contains(&format_date(d)) {
                break;
            }
            n += 1;
            d = add_days(d, -1);
        }
        (n, "天")
    }
}

fn month_rate(
    habit: &HabitRecord,
    logs: &HashSet<String>,
    year: i32,
    month: u32,
    through: Option<u32>,
) -> i64 {
    let last = last_day_of_month(year, month).day();
    let end = through.unwrap_or(last).min(last);
    let mut done = 0;
    for day in 1..=end {
        let date = format!("{year:04}-{month:02}-{day:02}");
        if logs.contains(&date) {
            done += 1;
        }
    }
    percent(done, habit_expected(&habit.frequency_type, habit.frequency_target, end))
}

fn to_row(
    habit: &HabitRecord,
    logs: &HashSet<String>,
    today: chrono::NaiveDate,
    week_on: i64,
) -> HabitRow {
    let ws = week_start(today, week_on);
    let (streak_n, streak_unit) = streak(habit, logs, today, week_on);
    HabitRow {
        id: habit.id.clone(),
        title: habit.title.clone(),
        kind: habit.kind.clone(),
        area_id: habit.area_id.clone(),
        goal_id: habit.goal_id.clone(),
        frequency_type: habit.frequency_type.clone(),
        frequency_target: habit.frequency_target,
        is_active: habit.is_active,
        created_at: habit.created_at.clone(),
        done_today: logs.contains(&format_date(today)),
        week_dates: week_dates(logs, ws),
        week_count: week_count(logs, ws),
        streak_n,
        streak_unit: streak_unit.into(),
    }
}

fn list_rows(conn: &Connection) -> Result<Vec<HabitRow>, AppError> {
    let today = today();
    let week_on = week_starts_on(conn)?;
    let logs = all_logs(conn)?;
    Ok(list_records(conn)?
        .into_iter()
        .map(|h| {
            let empty = HashSet::new();
            let set = logs.get(&h.id).unwrap_or(&empty);
            to_row(&h, set, today, week_on)
        })
        .collect())
}

fn detail_of(conn: &Connection, id: &str) -> Result<HabitDetail, AppError> {
    let habit = get_record(conn, id)?;
    let logs = logs_of(conn, id)?;
    let today = today();
    let week_on = week_starts_on(conn)?;
    let (streak_n, streak_unit) = streak(&habit, &logs, today, week_on);
    let backfill = catalog().habit_backfill_days.max(1);
    let backfill_from = add_days(today, 1 - backfill);
    let month = format!("{:04}-{:02}", today.year(), today.month());
    let (prev_y, prev_m) = if today.month() == 1 {
        (today.year() - 1, 12)
    } else {
        (today.year(), today.month() - 1)
    };
    let prev_month = format!("{prev_y:04}-{prev_m:02}");
    let month_logs = logs
        .iter()
        .filter(|d| d.starts_with(&month))
        .cloned()
        .collect();
    let recent = (0..backfill)
        .map(|i| {
            let date = format_date(add_days(backfill_from, i));
            HabitDay {
                done: logs.contains(&date),
                date,
            }
        })
        .collect();
    Ok(HabitDetail {
        id: habit.id.clone(),
        title: habit.title.clone(),
        kind: habit.kind.clone(),
        area_id: habit.area_id.clone(),
        goal_id: habit.goal_id.clone(),
        frequency_type: habit.frequency_type.clone(),
        frequency_target: habit.frequency_target,
        is_active: habit.is_active,
        created_at: habit.created_at.clone(),
        streak_n,
        streak_unit: streak_unit.into(),
        week_count: week_count(&logs, week_start(today, week_on)),
        month,
        month_rate: month_rate(&habit, &logs, today.year(), today.month(), Some(today.day())),
        prev_month,
        prev_month_rate: month_rate(&habit, &logs, prev_y, prev_m, None),
        month_logs,
        recent,
        backfill_from: format_date(backfill_from),
    })
}

#[tauri::command]
pub fn list_habits(db: State<'_, Db>) -> Result<Vec<HabitRow>, AppError> {
    db::with_conn(&db, list_rows)
}

#[tauri::command]
pub fn get_habit(db: State<'_, Db>, id: String) -> Result<HabitDetail, AppError> {
    db::with_conn(&db, |conn| detail_of(conn, &id))
}

pub(crate) fn insert_habit(
    conn: &Connection,
    title: &str,
    area_id: &str,
    frequency_type: &str,
    frequency_target: i64,
    goal_id: Option<&str>,
    kind: &str,
) -> Result<(), AppError> {
    require_area(conn, area_id)?;
    let goal_id = resolve_goal(conn, area_id, goal_id)?;
    conn.execute(
        "INSERT INTO habits (id, title, kind, area_id, goal_id, frequency_type, frequency_target, is_active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, datetime('now'))",
        params![
            db::new_id("h"),
            title,
            kind,
            area_id,
            goal_id,
            frequency_type,
            frequency_target
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn create_habit(
    db: State<'_, Db>,
    title: String,
    area_id: String,
    frequency_type: String,
    frequency_target: i64,
    goal_id: Option<String>,
    kind: Option<String>,
) -> Result<Vec<HabitRow>, AppError> {
    let title = domain::normalize_habit_title(&title)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    let (frequency_type, frequency_target) = domain::normalize_frequency(&frequency_type, frequency_target)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    let kind = domain::normalize_habit_kind(kind.as_deref())
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    db::with_conn(&db, |conn| {
        insert_habit(
            conn,
            &title,
            &area_id,
            &frequency_type,
            frequency_target,
            goal_id.as_deref(),
            &kind,
        )?;
        list_rows(conn)
    })
}

#[tauri::command]
pub fn update_habit(
    db: State<'_, Db>,
    id: String,
    title: String,
    area_id: String,
    frequency_type: String,
    frequency_target: i64,
    goal_id: Option<String>,
    kind: Option<String>,
) -> Result<HabitDetail, AppError> {
    let title = domain::normalize_habit_title(&title)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    let (frequency_type, frequency_target) = domain::normalize_frequency(&frequency_type, frequency_target)
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    let kind = domain::normalize_habit_kind(kind.as_deref())
        .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    db::with_conn(&db, |conn| {
        get_record(conn, &id)?;
        require_area(conn, &area_id)?;
        let goal_id = resolve_goal(conn, &area_id, goal_id.as_deref())?;
        conn.execute(
            "UPDATE habits SET title = ?1, kind = ?2, area_id = ?3, goal_id = ?4, frequency_type = ?5, frequency_target = ?6
             WHERE id = ?7",
            params![title, kind, area_id, goal_id, frequency_type, frequency_target, id],
        )?;
        detail_of(conn, &id)
    })
}

#[tauri::command]
pub fn set_habit_active(
    db: State<'_, Db>,
    id: String,
    active: bool,
) -> Result<HabitDetail, AppError> {
    db::with_conn(&db, |conn| {
        get_record(conn, &id)?;
        conn.execute(
            "UPDATE habits SET is_active = ?1 WHERE id = ?2",
            params![if active { 1 } else { 0 }, id],
        )?;
        detail_of(conn, &id)
    })
}

#[tauri::command]
pub fn toggle_habit_log(
    db: State<'_, Db>,
    id: String,
    date: String,
) -> Result<HabitDetail, AppError> {
    let parsed = parse_date(&date).map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    db::with_conn(&db, |conn| {
        let habit = get_record(conn, &id)?;
        if !habit.is_active {
            return Err(AppError::new(HABIT_INACTIVE, "已停用的习惯不能打卡"));
        }
        let today = today();
        let backfill = catalog().habit_backfill_days.max(1);
        let from = add_days(today, 1 - backfill);
        if parsed > today || parsed < from {
            return Err(AppError::new(BACKFILL_WINDOW, "只能补最近 7 天的卡"));
        }
        let iso = format_date(parsed);
        let exists: i64 = conn.query_row(
            "SELECT COUNT(1) FROM habit_logs WHERE habit_id = ?1 AND date = ?2",
            params![id, iso],
            |row| row.get(0),
        )?;
        if exists > 0 {
            conn.execute(
                "DELETE FROM habit_logs WHERE habit_id = ?1 AND date = ?2",
                params![id, iso],
            )?;
        } else {
            conn.execute(
                "INSERT INTO habit_logs (habit_id, date, done) VALUES (?1, ?2, 1)",
                params![id, iso],
            )?;
        }
        detail_of(conn, &id)
    })
}
