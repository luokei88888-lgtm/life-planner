use rusqlite::{params, Connection, OptionalExtension};
use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::areas::{apply_scores, AreaScoreInput};
use crate::commands::notes::{self, Note};
use crate::commands::tasks::{carry_unfinished_from, insert_task, list_unfinished};
use crate::db::{self, Db};
use crate::domain::{
    self, add_days, format_date, habit_expected, last_day_of_month, parse_date, percent, today,
    week_start,
};
use crate::error::{
    AppError, NOT_FOUND, REVIEW_LOCKED, REVIEW_NEXT_TASKS_DONE, REVIEW_NOT_DUE, VALIDATION_FAILED,
};

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct CarriedTask {
    pub title: String,
    pub carried: i64,
}

fn default_habit_kind() -> String {
    "form".into()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SnapHabit {
    pub title: String,
    pub rate: i64,
    #[serde(default = "default_habit_kind")]
    pub kind: String,
    #[serde(default)]
    pub goal_title: Option<String>,
}

struct HabitSnapSrc {
    id: String,
    title: String,
    freq: String,
    target: i64,
    kind: String,
    goal_title: Option<String>,
}

fn list_active_habits_for_snap(conn: &Connection) -> Result<Vec<HabitSnapSrc>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT h.id, h.title, h.frequency_type, h.frequency_target, h.kind, g.title
         FROM habits h
         LEFT JOIN goals g ON g.id = h.goal_id
         WHERE h.is_active = 1
         ORDER BY h.created_at ASC, h.id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(HabitSnapSrc {
            id: row.get(0)?,
            title: row.get(1)?,
            freq: row.get(2)?,
            target: row.get(3)?,
            kind: row.get(4)?,
            goal_title: row
                .get::<_, Option<String>>(5)?
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty()),
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SnapGoal {
    pub title: String,
    pub status: String,
    pub progress: i64,
    pub color: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct WeekSnapshot {
    pub task_total: i64,
    pub task_done: i64,
    pub unlinked: i64,
    pub most_carried: Option<CarriedTask>,
    pub habits: Vec<SnapHabit>,
    pub goals: Vec<SnapGoal>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WeekSat {
    pub week_start: String,
    pub satisfaction: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SnapArea {
    pub id: String,
    pub name: String,
    pub color: String,
    pub score: i64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct SnapGoalTasks {
    pub id: String,
    pub title: String,
    pub level: String,
    pub color: String,
    pub done: i64,
    pub total: i64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct MonthSnapshot {
    pub satisfaction_avg: f64,
    pub habit_rate: i64,
    pub skipped: i64,
    pub submitted_weeks: i64,
    pub weeks: Vec<WeekSat>,
    pub habit_rates: Vec<SnapHabit>,
    pub goals_done: i64,
    pub goals_total: i64,
    #[serde(default)]
    pub area_scores: Vec<SnapArea>,
    #[serde(default)]
    pub goal_tasks: Vec<SnapGoalTasks>,
}

#[derive(Serialize)]
pub struct PendingItem {
    pub kind: String,
    pub key: String,
    pub draft: bool,
}

#[derive(Serialize)]
pub struct HistoryItem {
    pub kind: String,
    pub key: String,
    pub status: String,
    pub submitted_at: Option<String>,
    pub satisfaction: Option<f64>,
}

#[derive(Serialize)]
pub struct ReviewList {
    pub pending: Vec<PendingItem>,
    pub history: Vec<HistoryItem>,
    pub this_week: String,
    pub this_month: String,
    pub this_year: String,
    pub weekday: i64,
    pub this_week_status: String,
    pub this_month_status: String,
    pub this_year_status: String,
}

#[derive(Serialize, Clone)]
pub struct ReviewTodo {
    pub id: String,
    pub title: String,
}

#[derive(Serialize)]
pub struct WeeklyReviewView {
    pub week_start: String,
    pub status: String,
    pub q_went_well: String,
    pub q_not_well: String,
    pub q_reason: String,
    pub q_next_week: String,
    pub satisfaction: i64,
    pub submitted_at: Option<String>,
    pub snapshot: WeekSnapshot,
    pub notes: Vec<Note>,
    pub next_tasks_created: bool,
    pub unfinished: Vec<ReviewTodo>,
}

#[derive(Serialize)]
pub struct MonthGoal {
    pub id: String,
    pub title: String,
    pub status: String,
    pub progress: i64,
    pub area_id: String,
    pub color: String,
}

#[derive(Serialize)]
pub struct MonthlyReviewView {
    pub month: String,
    pub status: String,
    pub q_progress: String,
    pub q_insight: String,
    pub q_next_month: String,
    pub submitted_at: Option<String>,
    pub snapshot: MonthSnapshot,
    pub goals: Vec<MonthGoal>,
    pub notes: Vec<Note>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MonthSat {
    pub month: String,
    pub satisfaction: f64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct YearSnapshot {
    pub satisfaction_avg: f64,
    pub habit_rate: i64,
    pub skipped: i64,
    pub submitted_months: i64,
    pub months: Vec<MonthSat>,
    pub habit_rates: Vec<SnapHabit>,
    pub goals_done: i64,
    pub goals_total: i64,
    pub life_goals: Vec<SnapGoal>,
    #[serde(default)]
    pub area_scores: Vec<SnapArea>,
    #[serde(default)]
    pub goal_tasks: Vec<SnapGoalTasks>,
}

#[derive(Serialize)]
pub struct YearlyReviewView {
    pub year: String,
    pub status: String,
    pub q_progress: String,
    pub q_insight: String,
    pub q_next_year: String,
    pub submitted_at: Option<String>,
    pub snapshot: YearSnapshot,
    pub goals: Vec<MonthGoal>,
    pub notes: Vec<Note>,
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

fn canonical_week(conn: &Connection, raw: &str) -> Result<String, AppError> {
    let parsed = parse_date(raw).map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    Ok(format_date(week_start(parsed, week_starts_on(conn)?)))
}

fn parse_month(raw: &str) -> Result<(i32, u32, String), AppError> {
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

fn locked(status: &str) -> bool {
    status == "submitted" || status == "skipped"
}

fn notes_for_week(conn: &Connection, week: &str) -> Result<Vec<Note>, AppError> {
    let start = parse_date(week).map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    notes::list_in_range(conn, week, &format_date(add_days(start, 6)))
}

fn notes_for_month(conn: &Connection, month: &str) -> Result<Vec<Note>, AppError> {
    let (year, mon, key) = parse_month(month)?;
    notes::list_in_range(
        conn,
        &format!("{key}-01"),
        &format_date(last_day_of_month(year, mon)),
    )
}

fn notes_for_year(conn: &Connection, year: &str) -> Result<Vec<Note>, AppError> {
    if year.len() != 4 || year.parse::<i32>().is_err() {
        return Err(AppError::new(VALIDATION_FAILED, "年份无效"));
    }
    notes::list_in_range(conn, &format!("{year}-01-01"), &format!("{year}-12-31"))
}

fn week_snapshot(conn: &Connection, week: &str) -> Result<WeekSnapshot, AppError> {
    let start = parse_date(week).map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let end = format_date(add_days(start, 6));
    let (task_total, task_done, unlinked): (i64, i64, i64) = conn.query_row(
        "SELECT COUNT(1),
                COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN goal_id IS NULL THEN 1 ELSE 0 END), 0)
         FROM tasks WHERE week_start = ?1",
        [week],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    let most_carried = conn
        .query_row(
            "SELECT title, carried_over_count FROM tasks
             WHERE week_start = ?1 AND status = 'todo' AND carried_over_count > 0
             ORDER BY carried_over_count DESC, id ASC LIMIT 1",
            [week],
            |row| {
                Ok(CarriedTask {
                    title: row.get(0)?,
                    carried: row.get(1)?,
                })
            },
        )
        .optional()?;

    let mut habits = Vec::new();
    for src in list_active_habits_for_snap(conn)? {
        let n: i64 = conn.query_row(
            "SELECT COUNT(1) FROM habit_logs
             WHERE habit_id = ?1 AND done = 1 AND date >= ?2 AND date <= ?3",
            params![src.id, week, end],
            |row| row.get(0),
        )?;
        habits.push(SnapHabit {
            title: src.title,
            rate: percent(n, src.target),
            kind: src.kind,
            goal_title: src.goal_title,
        });
    }

    let mut gstmt = conn.prepare(
        "SELECT g.title, g.status, g.progress, a.color
         FROM goals g JOIN areas a ON a.id = g.area_id
         WHERE g.level = 'week' AND g.period_start = ?1
         ORDER BY g.created_at ASC, g.id ASC",
    )?;
    let goals = gstmt
        .query_map([week], |row| {
            Ok(SnapGoal {
                title: row.get(0)?,
                status: row.get(1)?,
                progress: row.get(2)?,
                color: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(WeekSnapshot {
        task_total,
        task_done,
        unlinked,
        most_carried,
        habits,
        goals,
    })
}

fn weeks_overlapping_month(month: &str, week_on: i64) -> Result<Vec<String>, AppError> {
    let start = parse_date(&format!("{month}-01")).map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let mut ws = week_start(start, week_on);
    let mut out = Vec::new();
    for _ in 0..10 {
        let end = add_days(ws, 6);
        let ws_m = format_date(ws)[..7].to_string();
        let end_m = format_date(end)[..7].to_string();
        if ws_m.as_str() > month {
            break;
        }
        if end_m.as_str() >= month {
            out.push(format_date(ws));
        }
        ws = add_days(ws, 7);
    }
    Ok(out)
}

fn month_snapshot(conn: &Connection, month: &str) -> Result<MonthSnapshot, AppError> {
    let (year, mon, _) = parse_month(month)?;
    let week_on = week_starts_on(conn)?;
    let weeks = weeks_overlapping_month(month, week_on)?;
    let mut sats = Vec::new();
    let mut skipped = 0i64;
    for ws in &weeks {
        let row: Option<(String, Option<i64>)> = conn
            .query_row(
                "SELECT status, satisfaction FROM weekly_reviews WHERE week_start = ?1",
                [ws],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        match row {
            Some((status, sat)) if status == "submitted" => {
                sats.push(WeekSat {
                    week_start: ws.clone(),
                    satisfaction: sat.unwrap_or(0),
                });
            }
            Some((status, _)) if status == "skipped" => skipped += 1,
            _ => {}
        }
    }
    let satisfaction_avg = if sats.is_empty() {
        0.0
    } else {
        let sum: i64 = sats.iter().map(|w| w.satisfaction).sum();
        ((sum as f64 / sats.len() as f64) * 10.0).round() / 10.0
    };

    let last = last_day_of_month(year, mon).day();
    let mut habit_rates = Vec::new();
    for src in list_active_habits_for_snap(conn)? {
        let from = format!("{year:04}-{mon:02}-01");
        let to = format!("{year:04}-{mon:02}-{last:02}");
        let done: i64 = conn.query_row(
            "SELECT COUNT(1) FROM habit_logs
             WHERE habit_id = ?1 AND done = 1 AND date >= ?2 AND date <= ?3",
            params![src.id, from, to],
            |row| row.get(0),
        )?;
        habit_rates.push(SnapHabit {
            title: src.title,
            rate: percent(done, habit_expected(&src.freq, src.target, last)),
            kind: src.kind,
            goal_title: src.goal_title,
        });
    }
    let habit_rate = if habit_rates.is_empty() {
        0
    } else {
        let sum: i64 = habit_rates.iter().map(|h| h.rate).sum();
        ((sum as f64) / (habit_rates.len() as f64)).round() as i64
    };

    let (goals_total, goals_done): (i64, i64) = conn.query_row(
        "SELECT COUNT(1),
                COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0)
         FROM goals WHERE level = 'month' AND period_start LIKE ?1",
        [format!("{month}-%")],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let month_start = NaiveDate::from_ymd_opt(year, mon, 1).expect("month start");
    let month_end = last_day_of_month(year, mon);
    let (task_from, task_to) = covering_week_range(conn, month_start, month_end)?;

    Ok(MonthSnapshot {
        satisfaction_avg,
        habit_rate,
        skipped,
        submitted_weeks: sats.len() as i64,
        weeks: sats,
        habit_rates,
        goals_done,
        goals_total,
        area_scores: snap_area_scores(conn)?,
        goal_tasks: snap_goal_tasks(conn, &task_from, &task_to)?,
    })
}

fn covering_week_range(
    conn: &Connection,
    start: NaiveDate,
    end: NaiveDate,
) -> Result<(String, String), AppError> {
    let on = week_starts_on(conn)?;
    Ok((
        format_date(week_start(start, on)),
        format_date(week_start(end, on)),
    ))
}

fn snap_goal_tasks(
    conn: &Connection,
    week_from: &str,
    week_to: &str,
) -> Result<Vec<SnapGoalTasks>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT g.id, g.title, g.level, a.color,
                COUNT(t.id),
                COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0)
         FROM tasks t
         JOIN goals g ON g.id = t.goal_id
         JOIN areas a ON a.id = g.area_id
         WHERE g.level IN ('month', 'quarter', 'year')
           AND t.week_start >= ?1 AND t.week_start <= ?2
         GROUP BY g.id
         HAVING COUNT(t.id) > 0
         ORDER BY CASE g.level WHEN 'year' THEN 1 WHEN 'quarter' THEN 2 ELSE 3 END,
                  g.created_at ASC, g.id ASC",
    )?;
    let rows = stmt.query_map(params![week_from, week_to], |row| {
        Ok(SnapGoalTasks {
            id: row.get(0)?,
            title: row.get(1)?,
            level: row.get(2)?,
            color: row.get(3)?,
            total: row.get(4)?,
            done: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn snap_area_scores(conn: &Connection) -> Result<Vec<SnapArea>, AppError> {
    let mut astmt = conn.prepare(
        "SELECT id, name, color, score FROM areas WHERE is_archived = 0 ORDER BY sort_order ASC, id ASC",
    )?;
    let rows = astmt.query_map([], |row| {
        Ok(SnapArea {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            score: row.get::<_, Option<i64>>(3)?.unwrap_or(5),
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn month_goals(conn: &Connection, month: &str) -> Result<Vec<MonthGoal>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT g.id, g.title, g.status, g.progress, g.area_id, a.color
         FROM goals g JOIN areas a ON a.id = g.area_id
         WHERE g.level = 'month' AND g.period_start LIKE ?1
         ORDER BY g.created_at ASC, g.id ASC",
    )?;
    let rows = stmt.query_map([format!("{month}-%")], |row| {
        Ok(MonthGoal {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            area_id: row.get(4)?,
            color: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn parse_week_snap(raw: &Option<String>) -> WeekSnapshot {
    raw.as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default()
}

fn parse_month_snap(raw: &Option<String>) -> MonthSnapshot {
    raw.as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default()
}

fn parse_year(raw: &str) -> Result<String, AppError> {
    if raw.len() != 4 {
        return Err(AppError::new(VALIDATION_FAILED, "年份格式无效"));
    }
    let year: i32 = raw
        .parse()
        .map_err(|_| AppError::new(VALIDATION_FAILED, "年份格式无效"))?;
    if !(2000..=2100).contains(&year) {
        return Err(AppError::new(VALIDATION_FAILED, "年份格式无效"));
    }
    Ok(format!("{year:04}"))
}

fn parse_year_snap(raw: &Option<String>) -> YearSnapshot {
    raw.as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default()
}

fn year_goals(conn: &Connection, year: &str) -> Result<Vec<MonthGoal>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT g.id, g.title, g.status, g.progress, g.area_id, a.color
         FROM goals g JOIN areas a ON a.id = g.area_id
         WHERE g.level = 'year' AND g.period_start LIKE ?1
         ORDER BY g.created_at ASC, g.id ASC",
    )?;
    let rows = stmt.query_map([format!("{year}-%")], |row| {
        Ok(MonthGoal {
            id: row.get(0)?,
            title: row.get(1)?,
            status: row.get(2)?,
            progress: row.get(3)?,
            area_id: row.get(4)?,
            color: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn year_snapshot(conn: &Connection, year: &str) -> Result<YearSnapshot, AppError> {
    let year_n: i32 = year.parse().unwrap_or(1970);
    let mut months = Vec::new();
    let mut skipped = 0i64;
    for month in 1..=12 {
        let key = format!("{year}-{month:02}");
        let row: Option<(String, Option<String>)> = conn
            .query_row(
                "SELECT status, summary_snapshot FROM monthly_reviews WHERE month = ?1",
                [&key],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        match row {
            Some((status, snap)) if status == "submitted" => {
                let parsed = parse_month_snap(&snap);
                months.push(MonthSat {
                    month: key,
                    satisfaction: parsed.satisfaction_avg,
                });
            }
            Some((status, _)) if status == "skipped" => skipped += 1,
            _ => {}
        }
    }
    let satisfaction_avg = if months.is_empty() {
        0.0
    } else {
        let sum: f64 = months.iter().map(|m| m.satisfaction).sum();
        ((sum / months.len() as f64) * 10.0).round() / 10.0
    };

    let from = format!("{year}-01-01");
    let to = format!("{year}-12-31");
    let days = if NaiveDate::from_ymd_opt(year_n, 12, 31).is_some() {
        NaiveDate::from_ymd_opt(year_n, 12, 31)
            .unwrap()
            .ordinal()
    } else {
        365
    };
    let mut habit_rates = Vec::new();
    for src in list_active_habits_for_snap(conn)? {
        let done: i64 = conn.query_row(
            "SELECT COUNT(1) FROM habit_logs
             WHERE habit_id = ?1 AND done = 1 AND date >= ?2 AND date <= ?3",
            params![src.id, from, to],
            |row| row.get(0),
        )?;
        habit_rates.push(SnapHabit {
            title: src.title,
            rate: percent(done, habit_expected(&src.freq, src.target, days)),
            kind: src.kind,
            goal_title: src.goal_title,
        });
    }
    let habit_rate = if habit_rates.is_empty() {
        0
    } else {
        let sum: i64 = habit_rates.iter().map(|h| h.rate).sum();
        ((sum as f64) / (habit_rates.len() as f64)).round() as i64
    };

    let (goals_total, goals_done): (i64, i64) = conn.query_row(
        "SELECT COUNT(1),
                COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0)
         FROM goals WHERE level = 'year' AND period_start LIKE ?1",
        [format!("{year}-%")],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let mut lstmt = conn.prepare(
        "SELECT g.title, g.status, g.progress, a.color
         FROM goals g JOIN areas a ON a.id = g.area_id
         WHERE g.level = 'life'
         ORDER BY g.created_at ASC, g.id ASC",
    )?;
    let life_goals = lstmt
        .query_map([], |row| {
            Ok(SnapGoal {
                title: row.get(0)?,
                status: row.get(1)?,
                progress: row.get(2)?,
                color: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(YearSnapshot {
        satisfaction_avg,
        habit_rate,
        skipped,
        submitted_months: months.len() as i64,
        months,
        habit_rates,
        goals_done,
        goals_total,
        life_goals,
        area_scores: snap_area_scores(conn)?,
        goal_tasks: {
            let start = NaiveDate::from_ymd_opt(year_n, 1, 1).expect("year start");
            let end = NaiveDate::from_ymd_opt(year_n, 12, 31).expect("year end");
            let (task_from, task_to) = covering_week_range(conn, start, end)?;
            snap_goal_tasks(conn, &task_from, &task_to)?
        },
    })
}

pub(crate) fn yearly_view(conn: &Connection, year: &str) -> Result<YearlyReviewView, AppError> {
    let row: Option<(
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
    )> = conn
        .query_row(
            "SELECT q_progress, q_insight, q_next_year, status, submitted_at, summary_snapshot
             FROM yearly_reviews WHERE year = ?1",
            [year],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            },
        )
        .optional()?;
    let goals = year_goals(conn, year)?;
    match row {
        Some((progress, insight, next, status, submitted_at, snap)) => {
            let snapshot = if status == "submitted" && snap.as_deref().map(|s| !s.is_empty()).unwrap_or(false)
            {
                parse_year_snap(&snap)
            } else {
                year_snapshot(conn, year)?
            };
            Ok(YearlyReviewView {
                year: year.to_string(),
                status,
                q_progress: progress.unwrap_or_default(),
                q_insight: insight.unwrap_or_default(),
                q_next_year: next.unwrap_or_default(),
                submitted_at,
                snapshot,
                goals,
                notes: notes_for_year(conn, year)?,
            })
        }
        None => Ok(YearlyReviewView {
            year: year.to_string(),
            status: "none".into(),
            q_progress: String::new(),
            q_insight: String::new(),
            q_next_year: String::new(),
            submitted_at: None,
            snapshot: year_snapshot(conn, year)?,
            goals,
            notes: notes_for_year(conn, year)?,
        }),
    }
}

fn weekly_status(conn: &Connection, week: &str) -> Result<Option<String>, AppError> {
    conn.query_row(
        "SELECT status FROM weekly_reviews WHERE week_start = ?1",
        [week],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn monthly_status(conn: &Connection, month: &str) -> Result<Option<String>, AppError> {
    conn.query_row(
        "SELECT status FROM monthly_reviews WHERE month = ?1",
        [month],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn yearly_status(conn: &Connection, year: &str) -> Result<Option<String>, AppError> {
    conn.query_row(
        "SELECT status FROM yearly_reviews WHERE year = ?1",
        [year],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn status_or_none(value: Option<String>) -> String {
    value.filter(|s| !s.is_empty()).unwrap_or_else(|| "none".into())
}

fn require_week_due(week: &str) -> Result<(), AppError> {
    let start = parse_date(week).map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
    if today() < add_days(start, 6) {
        return Err(AppError::new(
            REVIEW_NOT_DUE,
            "本周还没结束，等最后一天再写复盘",
        ));
    }
    Ok(())
}

fn require_month_due(year: i32, month: u32) -> Result<(), AppError> {
    if today() < last_day_of_month(year, month) {
        return Err(AppError::new(
            REVIEW_NOT_DUE,
            "这个月还没结束，结束后再写月复盘",
        ));
    }
    Ok(())
}

fn require_year_due(year: &str) -> Result<(), AppError> {
    let year_n: i32 = year
        .parse()
        .map_err(|_| AppError::new(VALIDATION_FAILED, "年份格式无效"))?;
    let end = NaiveDate::from_ymd_opt(year_n, 12, 31)
        .ok_or_else(|| AppError::new(VALIDATION_FAILED, "年份格式无效"))?;
    if today() < end {
        return Err(AppError::new(
            REVIEW_NOT_DUE,
            "这一年还没结束，结束后再写年复盘",
        ));
    }
    Ok(())
}

fn require_editable(conn: &Connection, week: &str) -> Result<(), AppError> {
    require_week_due(week)?;
    if let Some(status) = weekly_status(conn, week)? {
        if locked(&status) {
            return Err(AppError::new(REVIEW_LOCKED, "该周复盘已结束，不能再改"));
        }
    }
    Ok(())
}

fn review_todos(conn: &Connection, week: &str) -> Result<Vec<ReviewTodo>, AppError> {
    Ok(list_unfinished(conn, week)?
        .into_iter()
        .map(|task| ReviewTodo {
            id: task.id,
            title: task.title,
        })
        .collect())
}

pub(crate) fn weekly_view(conn: &Connection, week: &str) -> Result<WeeklyReviewView, AppError> {
    let row: Option<(
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
        String,
        Option<String>,
        Option<String>,
        i64,
    )> = conn
        .query_row(
            "SELECT q_went_well, q_not_well, q_reason, q_next_week, satisfaction, status, submitted_at, summary_snapshot,
                    COALESCE(next_tasks_created, 0)
             FROM weekly_reviews WHERE week_start = ?1",
            [week],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                ))
            },
        )
        .optional()?;
    match row {
        Some((went, not, reason, next, sat, status, submitted_at, snap, next_tasks_created)) => {
            Ok(WeeklyReviewView {
                week_start: week.to_string(),
                status,
                q_went_well: went.unwrap_or_default(),
                q_not_well: not.unwrap_or_default(),
                q_reason: reason.unwrap_or_default(),
                q_next_week: next.unwrap_or_default(),
                satisfaction: sat.unwrap_or(7),
                submitted_at,
                snapshot: if snap.as_deref().map(|s| !s.is_empty()).unwrap_or(false) {
                    parse_week_snap(&snap)
                } else {
                    week_snapshot(conn, week)?
                },
                notes: notes_for_week(conn, week)?,
                next_tasks_created: next_tasks_created == 1,
                unfinished: review_todos(conn, week)?,
            })
        }
        None => Ok(WeeklyReviewView {
            week_start: week.to_string(),
            status: "none".into(),
            q_went_well: String::new(),
            q_not_well: String::new(),
            q_reason: String::new(),
            q_next_week: String::new(),
            satisfaction: 7,
            submitted_at: None,
            snapshot: week_snapshot(conn, week)?,
            notes: notes_for_week(conn, week)?,
            next_tasks_created: false,
            unfinished: review_todos(conn, week)?,
        }),
    }
}

pub(crate) fn monthly_view(conn: &Connection, month: &str) -> Result<MonthlyReviewView, AppError> {
    let row: Option<(
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
    )> = conn
        .query_row(
            "SELECT q_progress, q_insight, q_next_month, status, submitted_at, summary_snapshot
             FROM monthly_reviews WHERE month = ?1",
            [month],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            },
        )
        .optional()?;
    let goals = month_goals(conn, month)?;
    match row {
        Some((progress, insight, next, status, submitted_at, snap)) => {
            let snapshot = if status == "submitted" && snap.as_deref().map(|s| !s.is_empty()).unwrap_or(false)
            {
                parse_month_snap(&snap)
            } else {
                month_snapshot(conn, month)?
            };
            Ok(MonthlyReviewView {
                month: month.to_string(),
                status,
                q_progress: progress.unwrap_or_default(),
                q_insight: insight.unwrap_or_default(),
                q_next_month: next.unwrap_or_default(),
                submitted_at,
                snapshot,
                goals,
                notes: notes_for_month(conn, month)?,
            })
        }
        None => Ok(MonthlyReviewView {
            month: month.to_string(),
            status: "none".into(),
            q_progress: String::new(),
            q_insight: String::new(),
            q_next_month: String::new(),
            submitted_at: None,
            snapshot: month_snapshot(conn, month)?,
            goals,
            notes: notes_for_month(conn, month)?,
        }),
    }
}

fn clamp_sat(v: i64) -> Result<i64, AppError> {
    if (1..=10).contains(&v) {
        Ok(v)
    } else {
        Err(AppError::new(VALIDATION_FAILED, "满意度须在 1 到 10 之间"))
    }
}

pub(crate) fn review_list(conn: &Connection) -> Result<ReviewList, AppError> {
        let today = today();
        let week_on = week_starts_on(conn)?;
        let this_week = format_date(week_start(today, week_on));
        let this_month = format!("{:04}-{:02}", today.year(), today.month());
        let this_year = format!("{:04}", today.year());
        let started_on = crate::commands::settings::ensure_started_on(conn)?;
        let mut pending = Vec::new();
        let prev_week = format_date(add_days(
            parse_date(&this_week).map_err(|m| AppError::new(VALIDATION_FAILED, m))?,
            -7,
        ));
        let prev_week_end = add_days(
            parse_date(&prev_week).map_err(|m| AppError::new(VALIDATION_FAILED, m))?,
            6,
        );
        if prev_week_end >= started_on {
            let status = weekly_status(conn, &prev_week)?;
            if status.as_deref().map(locked) != Some(true) {
                pending.push(PendingItem {
                    kind: "weekly".into(),
                    key: prev_week,
                    draft: status.as_deref() == Some("draft"),
                });
            }
        }
        let (y, m) = (today.year(), today.month());
        let prev_month = if m == 1 {
            format!("{:04}-12", y - 1)
        } else {
            format!("{y:04}-{:02}", m - 1)
        };
        let mstatus: Option<String> = conn
            .query_row(
                "SELECT status FROM monthly_reviews WHERE month = ?1",
                [&prev_month],
                |row| row.get(0),
            )
            .optional()?;
        let (py, pm) = if m == 1 { (y - 1, 12) } else { (y, m - 1) };
        if mstatus.as_deref() != Some("submitted") {
            let month_end = last_day_of_month(py, pm);
            if month_end >= started_on {
                pending.push(PendingItem {
                    kind: "monthly".into(),
                    key: prev_month,
                    draft: mstatus.as_deref() == Some("draft"),
                });
            }
        }
        let prev_year = format!("{:04}", y - 1);
        let ystatus: Option<String> = conn
            .query_row(
                "SELECT status FROM yearly_reviews WHERE year = ?1",
                [&prev_year],
                |row| row.get(0),
            )
            .optional()?;
        if ystatus.as_deref() != Some("submitted") {
            let year_end = chrono::NaiveDate::from_ymd_opt(y - 1, 12, 31)
                .unwrap_or(started_on);
            if year_end >= started_on {
                pending.push(PendingItem {
                    kind: "yearly".into(),
                    key: prev_year,
                    draft: ystatus.as_deref() == Some("draft"),
                });
            }
        }

        let mut history = Vec::new();
        let mut wstmt = conn.prepare(
            "SELECT week_start, status, submitted_at, satisfaction FROM weekly_reviews
             WHERE status IN ('submitted', 'skipped') ORDER BY week_start DESC",
        )?;
        let wrows = wstmt.query_map([], |row| {
            Ok(HistoryItem {
                kind: "weekly".into(),
                key: row.get(0)?,
                status: row.get(1)?,
                submitted_at: row.get(2)?,
                satisfaction: row.get::<_, Option<i64>>(3)?.map(|v| v as f64),
            })
        })?;
        for row in wrows {
            history.push(row?);
        }
        let mut mstmt = conn.prepare(
            "SELECT month, status, submitted_at, summary_snapshot FROM monthly_reviews
             WHERE status = 'submitted' ORDER BY month DESC",
        )?;
        let mrows = mstmt.query_map([], |row| {
            let snap: Option<String> = row.get(3)?;
            let parsed = parse_month_snap(&snap);
            Ok(HistoryItem {
                kind: "monthly".into(),
                key: row.get(0)?,
                status: row.get(1)?,
                submitted_at: row.get(2)?,
                satisfaction: Some(parsed.satisfaction_avg),
            })
        })?;
        for row in mrows {
            history.push(row?);
        }
        let mut ystmt = conn.prepare(
            "SELECT year, status, submitted_at, summary_snapshot FROM yearly_reviews
             WHERE status = 'submitted' ORDER BY year DESC",
        )?;
        let yrows = ystmt.query_map([], |row| {
            let snap: Option<String> = row.get(3)?;
            let parsed = parse_year_snap(&snap);
            Ok(HistoryItem {
                kind: "yearly".into(),
                key: row.get(0)?,
                status: row.get(1)?,
                submitted_at: row.get(2)?,
                satisfaction: Some(parsed.satisfaction_avg),
            })
        })?;
        for row in yrows {
            history.push(row?);
        }
        history.sort_by(|a, b| b.key.cmp(&a.key));

        Ok(ReviewList {
            pending,
            history,
            this_week: this_week.clone(),
            this_month: this_month.clone(),
            this_year: this_year.clone(),
            weekday: i64::from(today.weekday().num_days_from_sunday()),
            this_week_status: status_or_none(weekly_status(conn, &this_week)?),
            this_month_status: status_or_none(monthly_status(conn, &this_month)?),
            this_year_status: status_or_none(yearly_status(conn, &this_year)?),
        })
}

#[tauri::command]
pub fn list_reviews(db: State<'_, Db>) -> Result<ReviewList, AppError> {
    db::with_conn(&db, review_list)
}

#[tauri::command]
pub fn get_weekly_review(db: State<'_, Db>, week_start: String) -> Result<WeeklyReviewView, AppError> {
    db::with_conn(&db, |conn| {
        let week = canonical_week(conn, &week_start)?;
        weekly_view(conn, &week)
    })
}

#[tauri::command]
pub fn save_weekly_draft(
    db: State<'_, Db>,
    week_start: String,
    q_went_well: String,
    q_not_well: String,
    q_reason: String,
    q_next_week: String,
    satisfaction: i64,
) -> Result<WeeklyReviewView, AppError> {
    let went = domain::normalize_review_answer(&q_went_well, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let not = domain::normalize_review_answer(&q_not_well, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let reason = domain::normalize_review_answer(&q_reason, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let next = domain::normalize_review_answer(&q_next_week, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let satisfaction = clamp_sat(satisfaction)?;
    db::with_conn(&db, |conn| {
        let week = canonical_week(conn, &week_start)?;
        require_editable(conn, &week)?;
        conn.execute(
            "INSERT INTO weekly_reviews (id, week_start, q_went_well, q_not_well, q_reason, q_next_week, satisfaction, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'draft')
             ON CONFLICT(week_start) DO UPDATE SET
               q_went_well = excluded.q_went_well,
               q_not_well = excluded.q_not_well,
               q_reason = excluded.q_reason,
               q_next_week = excluded.q_next_week,
               satisfaction = excluded.satisfaction,
               status = 'draft'",
            params![db::new_id("wr"), week, went, not, reason, next, satisfaction],
        )?;
        weekly_view(conn, &week)
    })
}

#[tauri::command]
pub fn submit_weekly_review(
    db: State<'_, Db>,
    week_start: String,
    q_went_well: String,
    q_not_well: String,
    q_reason: String,
    q_next_week: String,
    satisfaction: i64,
) -> Result<WeeklyReviewView, AppError> {
    let went = domain::normalize_review_answer(&q_went_well, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "四个问题都要回答，哪怕只写一句"))?;
    let not = domain::normalize_review_answer(&q_not_well, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "四个问题都要回答，哪怕只写一句"))?;
    let reason = domain::normalize_review_answer(&q_reason, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "四个问题都要回答，哪怕只写一句"))?;
    let next = domain::normalize_review_answer(&q_next_week, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "四个问题都要回答，哪怕只写一句"))?;
    let satisfaction = clamp_sat(satisfaction)?;
    db::with_conn(&db, |conn| {
        let week = canonical_week(conn, &week_start)?;
        require_editable(conn, &week)?;
        let snap = serde_json::to_string(&week_snapshot(conn, &week)?)
            .map_err(|e| AppError::new(VALIDATION_FAILED, e.to_string()))?;
        conn.execute(
            "INSERT INTO weekly_reviews
               (id, week_start, summary_snapshot, q_went_well, q_not_well, q_reason, q_next_week, satisfaction, status, submitted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'submitted', datetime('now'))
             ON CONFLICT(week_start) DO UPDATE SET
               summary_snapshot = excluded.summary_snapshot,
               q_went_well = excluded.q_went_well,
               q_not_well = excluded.q_not_well,
               q_reason = excluded.q_reason,
               q_next_week = excluded.q_next_week,
               satisfaction = excluded.satisfaction,
               status = 'submitted',
               submitted_at = excluded.submitted_at",
            params![db::new_id("wr"), week, snap, went, not, reason, next, satisfaction],
        )?;
        weekly_view(conn, &week)
    })
}

pub(crate) fn apply_weekly_next_tasks(
    conn: &Connection,
    week_start: &str,
    titles: &[String],
    carry_unfinished: bool,
) -> Result<WeeklyReviewView, AppError> {
    let week = canonical_week(conn, week_start)?;
    let (status, created): (String, i64) = conn
        .query_row(
            "SELECT status, COALESCE(next_tasks_created, 0) FROM weekly_reviews WHERE week_start = ?1",
            [&week],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| AppError::new(NOT_FOUND, "该周还没有复盘"))?;
    if status != "submitted" {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "只有提交后的周复盘才能带出下周任务",
        ));
    }
    if created != 0 {
        return Err(AppError::new(
            REVIEW_NEXT_TASKS_DONE,
            "这周已经确认过下周安排",
        ));
    }
    let titles = domain::normalize_review_next_titles(titles)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    if carry_unfinished {
        carry_unfinished_from(conn, &week)?;
    }
    let next_week = format_date(add_days(
        parse_date(&week).map_err(|m| AppError::new(VALIDATION_FAILED, m))?,
        7,
    ));
    for title in &titles {
        insert_task(conn, title, &next_week, None, None, false)?;
    }
    conn.execute(
        "UPDATE weekly_reviews SET next_tasks_created = 1 WHERE week_start = ?1",
        [&week],
    )?;
    weekly_view(conn, &week)
}

#[tauri::command]
pub fn apply_weekly_next_week_tasks(
    db: State<'_, Db>,
    week_start: String,
    titles: Vec<String>,
    carry_unfinished: Option<bool>,
) -> Result<WeeklyReviewView, AppError> {
    db::with_conn(&db, |conn| {
        let tx = conn.unchecked_transaction()?;
        let view = apply_weekly_next_tasks(
            &tx,
            &week_start,
            &titles,
            carry_unfinished.unwrap_or(false),
        )?;
        tx.commit()?;
        Ok(view)
    })
}

pub(crate) fn skip_weekly_review_record(
    conn: &Connection,
    week_start: &str,
) -> Result<WeeklyReviewView, AppError> {
    let week = canonical_week(conn, week_start)?;
    require_editable(conn, &week)?;
    conn.execute(
        "INSERT INTO weekly_reviews (id, week_start, status, submitted_at)
         VALUES (?1, ?2, 'skipped', datetime('now'))
         ON CONFLICT(week_start) DO UPDATE SET
           status = 'skipped',
           submitted_at = excluded.submitted_at",
        params![db::new_id("wr"), week],
    )?;
    weekly_view(conn, &week)
}

#[tauri::command]
pub fn skip_weekly_review(db: State<'_, Db>, week_start: String) -> Result<WeeklyReviewView, AppError> {
    db::with_conn(&db, |conn| skip_weekly_review_record(conn, &week_start))
}

#[tauri::command]
pub fn get_monthly_review(db: State<'_, Db>, month: String) -> Result<MonthlyReviewView, AppError> {
    db::with_conn(&db, |conn| {
        let (_, _, month) = parse_month(&month)?;
        monthly_view(conn, &month)
    })
}

#[tauri::command]
pub fn save_monthly_draft(
    db: State<'_, Db>,
    month: String,
    q_progress: String,
    q_insight: String,
    q_next_month: String,
) -> Result<MonthlyReviewView, AppError> {
    let progress = domain::normalize_review_answer(&q_progress, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let insight = domain::normalize_review_answer(&q_insight, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let next = domain::normalize_review_answer(&q_next_month, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    db::with_conn(&db, |conn| {
        let (year, month_n, month) = parse_month(&month)?;
        require_month_due(year, month_n)?;
        let status: Option<String> = conn
            .query_row(
                "SELECT status FROM monthly_reviews WHERE month = ?1",
                [&month],
                |row| row.get(0),
            )
            .optional()?;
        if status.as_deref() == Some("submitted") {
            return Err(AppError::new(REVIEW_LOCKED, "该月复盘已提交，不能再改"));
        }
        conn.execute(
            "INSERT INTO monthly_reviews (id, month, q_progress, q_insight, q_next_month, status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'draft')
             ON CONFLICT(month) DO UPDATE SET
               q_progress = excluded.q_progress,
               q_insight = excluded.q_insight,
               q_next_month = excluded.q_next_month,
               status = 'draft'",
            params![db::new_id("mr"), month, progress, insight, next],
        )?;
        monthly_view(conn, &month)
    })
}

pub(crate) fn submit_monthly_review_record(
    conn: &Connection,
    month: &str,
    progress: &str,
    insight: &str,
    next: &str,
    scores: Option<&[AreaScoreInput]>,
) -> Result<MonthlyReviewView, AppError> {
    let (year, month_n, month) = parse_month(month)?;
    require_month_due(year, month_n)?;
    let status: Option<String> = conn
        .query_row(
            "SELECT status FROM monthly_reviews WHERE month = ?1",
            [&month],
            |row| row.get(0),
        )
        .optional()?;
    if status.as_deref() == Some("submitted") {
        return Err(AppError::new(REVIEW_LOCKED, "该月复盘已提交，不能再改"));
    }
    if let Some(scores) = scores.filter(|rows| !rows.is_empty()) {
        apply_scores(conn, scores)?;
    }
    let snap = serde_json::to_string(&month_snapshot(conn, &month)?)
        .map_err(|e| AppError::new(VALIDATION_FAILED, e.to_string()))?;
    conn.execute(
        "INSERT INTO monthly_reviews
           (id, month, summary_snapshot, q_progress, q_insight, q_next_month, status, submitted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'submitted', datetime('now'))
         ON CONFLICT(month) DO UPDATE SET
           summary_snapshot = excluded.summary_snapshot,
           q_progress = excluded.q_progress,
           q_insight = excluded.q_insight,
           q_next_month = excluded.q_next_month,
           status = 'submitted',
           submitted_at = excluded.submitted_at",
        params![db::new_id("mr"), month, snap, progress, insight, next],
    )?;
    monthly_view(conn, &month)
}

#[tauri::command]
pub fn submit_monthly_review(
    db: State<'_, Db>,
    month: String,
    q_progress: String,
    q_insight: String,
    q_next_month: String,
    scores: Option<Vec<AreaScoreInput>>,
) -> Result<MonthlyReviewView, AppError> {
    let progress = domain::normalize_review_answer(&q_progress, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "三个问题都要回答"))?;
    let insight = domain::normalize_review_answer(&q_insight, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "三个问题都要回答"))?;
    let next = domain::normalize_review_answer(&q_next_month, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "三个问题都要回答"))?;
    db::with_conn(&db, |conn| {
        submit_monthly_review_record(
            conn,
            &month,
            &progress,
            &insight,
            &next,
            scores.as_deref(),
        )
    })
}

#[tauri::command]
pub fn get_yearly_review(db: State<'_, Db>, year: String) -> Result<YearlyReviewView, AppError> {
    db::with_conn(&db, |conn| {
        let year = parse_year(&year)?;
        yearly_view(conn, &year)
    })
}

#[tauri::command]
pub fn save_yearly_draft(
    db: State<'_, Db>,
    year: String,
    q_progress: String,
    q_insight: String,
    q_next_year: String,
) -> Result<YearlyReviewView, AppError> {
    let progress = domain::normalize_review_answer(&q_progress, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let insight = domain::normalize_review_answer(&q_insight, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    let next = domain::normalize_review_answer(&q_next_year, false)
        .map_err(|m| AppError::new(VALIDATION_FAILED, m))?;
    db::with_conn(&db, |conn| {
        let year = parse_year(&year)?;
        require_year_due(&year)?;
        let status: Option<String> = conn
            .query_row(
                "SELECT status FROM yearly_reviews WHERE year = ?1",
                [&year],
                |row| row.get(0),
            )
            .optional()?;
        if status.as_deref() == Some("submitted") {
            return Err(AppError::new(REVIEW_LOCKED, "该年复盘已提交，不能再改"));
        }
        conn.execute(
            "INSERT INTO yearly_reviews (id, year, q_progress, q_insight, q_next_year, status)
             VALUES (?1, ?2, ?3, ?4, ?5, 'draft')
             ON CONFLICT(year) DO UPDATE SET
               q_progress = excluded.q_progress,
               q_insight = excluded.q_insight,
               q_next_year = excluded.q_next_year,
               status = 'draft'",
            params![db::new_id("yr"), year, progress, insight, next],
        )?;
        yearly_view(conn, &year)
    })
}

pub(crate) fn submit_yearly_review_record(
    conn: &Connection,
    year: &str,
    progress: &str,
    insight: &str,
    next: &str,
    scores: Option<&[AreaScoreInput]>,
) -> Result<YearlyReviewView, AppError> {
    let year = parse_year(year)?;
    require_year_due(&year)?;
    let status: Option<String> = conn
        .query_row(
            "SELECT status FROM yearly_reviews WHERE year = ?1",
            [&year],
            |row| row.get(0),
        )
        .optional()?;
    if status.as_deref() == Some("submitted") {
        return Err(AppError::new(REVIEW_LOCKED, "该年复盘已提交，不能再改"));
    }
    if let Some(scores) = scores.filter(|rows| !rows.is_empty()) {
        apply_scores(conn, scores)?;
    }
    let snap = serde_json::to_string(&year_snapshot(conn, &year)?)
        .map_err(|e| AppError::new(VALIDATION_FAILED, e.to_string()))?;
    conn.execute(
        "INSERT INTO yearly_reviews
           (id, year, summary_snapshot, q_progress, q_insight, q_next_year, status, submitted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'submitted', datetime('now'))
         ON CONFLICT(year) DO UPDATE SET
           summary_snapshot = excluded.summary_snapshot,
           q_progress = excluded.q_progress,
           q_insight = excluded.q_insight,
           q_next_year = excluded.q_next_year,
           status = 'submitted',
           submitted_at = excluded.submitted_at",
        params![db::new_id("yr"), year, snap, progress, insight, next],
    )?;
    yearly_view(conn, &year)
}

#[tauri::command]
pub fn submit_yearly_review(
    db: State<'_, Db>,
    year: String,
    q_progress: String,
    q_insight: String,
    q_next_year: String,
    scores: Option<Vec<AreaScoreInput>>,
) -> Result<YearlyReviewView, AppError> {
    let progress = domain::normalize_review_answer(&q_progress, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "三个问题都要回答"))?;
    let insight = domain::normalize_review_answer(&q_insight, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "三个问题都要回答"))?;
    let next = domain::normalize_review_answer(&q_next_year, true)
        .map_err(|_| AppError::new(VALIDATION_FAILED, "三个问题都要回答"))?;
    db::with_conn(&db, |conn| {
        submit_yearly_review_record(
            conn,
            &year,
            &progress,
            &insight,
            &next,
            scores.as_deref(),
        )
    })
}
