use chrono::{Local, Timelike};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::backup;
use crate::commands::settings::{self, SettingsMap};
use crate::db::{self, Db};
use crate::domain::{self, format_date, today, week_start};
use crate::error::{AppError, BACKUP_FAILED, SETTINGS_INVALID, VALIDATION_FAILED};

#[derive(Serialize)]
pub struct ReminderEvent {
    pub due: bool,
    pub title: String,
    pub body: String,
}

#[derive(Serialize)]
pub struct PathResult {
    pub path: Option<String>,
    pub settings: SettingsMap,
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

fn ics_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
}

fn ics_stamp() -> String {
    Local::now().format("%Y%m%dT%H%M%S").to_string()
}

fn ics_date(date: chrono::NaiveDate) -> String {
    date.format("%Y%m%d").to_string()
}

pub(crate) fn build_ics(conn: &Connection) -> Result<String, AppError> {
    let today = today();
    let week_on = week_starts_on(conn)?;
    let week = format_date(week_start(today, week_on));
    let stamp = ics_stamp();
    let mut body = String::from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//life-planner//CN\r\nCALSCALE:GREGORIAN\r\n",
    );

    let mut tstmt = conn.prepare(
        "SELECT id, title, planned_date, week_start FROM tasks WHERE week_start = ?1 ORDER BY sort_order, id",
    )?;
    let tasks = tstmt
        .query_map([&week], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, title, planned, week_start) in tasks {
        let start = planned
            .as_deref()
            .and_then(|v| domain::parse_date(v).ok())
            .or_else(|| domain::parse_date(&week_start).ok())
            .unwrap_or(today);
        body.push_str(&format!(
            "BEGIN:VEVENT\r\nUID:task-{id}@lifeplanner.local\r\nDTSTAMP:{stamp}\r\nDTSTART;VALUE=DATE:{}\r\nSUMMARY:{}\r\nEND:VEVENT\r\n",
            ics_date(start),
            ics_escape(&format!("任务：{title}")),
        ));
    }

    let mut hstmt = conn.prepare(
        "SELECT id, title, frequency_type FROM habits WHERE is_active = 1 ORDER BY created_at, id",
    )?;
    let habits = hstmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, title, freq) in habits {
        let rrule = if freq == "weekly" {
            "RRULE:FREQ=WEEKLY;COUNT=12"
        } else {
            "RRULE:FREQ=DAILY;COUNT=30"
        };
        body.push_str(&format!(
            "BEGIN:VEVENT\r\nUID:habit-{id}@lifeplanner.local\r\nDTSTAMP:{stamp}\r\nDTSTART;VALUE=DATE:{}\r\n{}\r\nSUMMARY:{}\r\nEND:VEVENT\r\n",
            ics_date(today),
            rrule,
            ics_escape(&format!("习惯：{title}")),
        ));
    }

    body.push_str("END:VCALENDAR\r\n");
    Ok(body)
}

#[tauri::command]
pub fn pick_sync_dir(db: State<'_, Db>) -> Result<PathResult, AppError> {
    let folder = rfd::FileDialog::new()
        .set_title("选择同步目录（OneDrive / NAS / 本机文件夹）")
        .pick_folder();
    db::with_conn(&db, |conn| {
        if let Some(path) = folder {
            let value = settings::normalize_sync_dir(&path.to_string_lossy())?;
            settings::upsert(conn, "sync_dir", &value)?;
            let _ = backup::mirror_sync(conn, std::path::Path::new("."));
        }
        let settings = settings::load(conn)?;
        let path = if settings.sync_dir.is_empty() {
            None
        } else {
            Some(settings.sync_dir.clone())
        };
        Ok(PathResult { path, settings })
    })
}

#[tauri::command]
pub fn sync_now(app: AppHandle, db: State<'_, Db>) -> Result<SettingsMap, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::new(crate::error::DB_OPEN_FAILED, e.to_string()))?;
    db::with_conn(&db, |conn| {
        let settings = settings::load(conn)?;
        if settings.sync_dir.trim().is_empty() {
            return Err(AppError::new(SETTINGS_INVALID, "请先选择同步目录"));
        }
        backup::mirror_sync(conn, &dir)?
            .ok_or_else(|| AppError::new(BACKUP_FAILED, "同步目录无效"))?;
        settings::load(conn)
    })
}

#[tauri::command]
pub fn export_ics(db: State<'_, Db>) -> Result<PathResult, AppError> {
    let ics = db::with_conn(&db, build_ics)?;
    let path = rfd::FileDialog::new()
        .set_title("导出日历")
        .set_file_name("life-planner.ics")
        .add_filter("iCalendar", &["ics"])
        .save_file();
    let Some(path) = path else {
        return db::with_conn(&db, |conn| {
            Ok(PathResult {
                path: None,
                settings: settings::load(conn)?,
            })
        });
    };
    std::fs::write(&path, ics.as_bytes())
        .map_err(|e| AppError::new(BACKUP_FAILED, format!("无法写入日历文件：{e}")))?;
    db::with_conn(&db, |conn| {
        Ok(PathResult {
            path: Some(path.to_string_lossy().into_owned()),
            settings: settings::load(conn)?,
        })
    })
}

#[tauri::command]
pub fn fire_due_reminders(db: State<'_, Db>) -> Result<ReminderEvent, AppError> {
    db::with_conn(&db, |conn| {
        let settings = settings::load(conn)?;
        if !settings.reminder_enabled {
            return Ok(ReminderEvent {
                due: false,
                title: String::new(),
                body: String::new(),
            });
        }
        if !domain::is_reminder_time(&settings.reminder_time) {
            return Err(AppError::new(VALIDATION_FAILED, "提醒时间无效"));
        }
        let now = Local::now();
        let parts: Vec<&str> = settings.reminder_time.split(':').collect();
        let hour: u32 = parts[0].parse().unwrap_or(9);
        let minute: u32 = parts[1].parse().unwrap_or(0);
        if now.hour() < hour || (now.hour() == hour && now.minute() < minute) {
            return Ok(ReminderEvent {
                due: false,
                title: String::new(),
                body: String::new(),
            });
        }
        let today = format_date(today());
        let last: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'last_reminder_date'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        if last.as_deref() == Some(today.as_str()) {
            return Ok(ReminderEvent {
                due: false,
                title: String::new(),
                body: String::new(),
            });
        }

        let undone_habits: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT h.title FROM habits h
                 WHERE h.is_active = 1
                   AND NOT EXISTS (
                     SELECT 1 FROM habit_logs l
                     WHERE l.habit_id = h.id AND l.date = ?1 AND l.done = 1
                   )
                 ORDER BY h.created_at ASC",
            )?;
            let rows = stmt.query_map(params![today], |row| row.get::<_, String>(0))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let week_on = week_starts_on(conn)?;
        let week = format_date(week_start(domain::today(), week_on));
        let today_tasks: i64 = conn.query_row(
            "SELECT COUNT(1) FROM tasks
             WHERE week_start = ?1 AND status = 'todo'
               AND (planned_date = ?2 OR (planned_date IS NULL AND is_focus = 1))",
            params![week, today],
            |row| row.get(0),
        )?;

        settings::upsert(conn, "last_reminder_date", &today)?;
        let mut bits = Vec::new();
        if !undone_habits.is_empty() {
            bits.push(format!(
                "未打卡习惯：{}",
                undone_habits.into_iter().take(4).collect::<Vec<_>>().join("、")
            ));
        }
        if today_tasks > 0 {
            bits.push(format!("今日还有 {today_tasks} 项待办"));
        }
        let body = if bits.is_empty() {
            "今天的习惯和焦点都已安排妥当。".into()
        } else {
            bits.join("。")
        };
        Ok(ReminderEvent {
            due: true,
            title: "今日提醒".into(),
            body,
        })
    })
}
