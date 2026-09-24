use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::commands::settings;
use crate::db;
use crate::domain::{self, catalog, format_date, parse_date, today};
use crate::error::{AppError, BACKUP_FAILED, IMPORT_INVALID, SETTINGS_INVALID, VALIDATION_FAILED};

const APP_MARK: &str = "life-planner";
const SETTING_KEYS: &[&str] = &[
    "theme",
    "week_starts_on",
    "auto_backup",
    "keep_backups",
    "onboarded",
    "last_backup_at",
    "reminder_enabled",
    "reminder_time",
    "sync_dir",
    "last_reminder_date",
    "last_sync_at",
    "started_on",
];

#[derive(Serialize, Deserialize, Default)]
pub struct ExportDoc {
    pub app: String,
    pub schema_version: i64,
    pub exported_at: String,
    #[serde(default)]
    pub settings: Vec<SettingRow>,
    #[serde(default)]
    pub areas: Vec<AreaRow>,
    #[serde(default)]
    pub goals: Vec<GoalRow>,
    #[serde(default)]
    pub goal_status_history: Vec<HistoryRow>,
    #[serde(default)]
    pub tasks: Vec<TaskRow>,
    #[serde(default)]
    pub habits: Vec<HabitRow>,
    #[serde(default)]
    pub habit_logs: Vec<LogRow>,
    #[serde(default)]
    pub weekly_reviews: Vec<WeeklyRow>,
    #[serde(default)]
    pub monthly_reviews: Vec<MonthlyRow>,
    #[serde(default)]
    pub yearly_reviews: Vec<YearlyRow>,
    #[serde(default)]
    pub notes: Vec<NoteRow>,
}

#[derive(Serialize, Deserialize)]
pub struct SettingRow {
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Deserialize)]
pub struct AreaRow {
    pub id: String,
    pub name: String,
    pub color: String,
    pub sort_order: i64,
    pub score: Option<i64>,
    pub scored_at: Option<String>,
    pub is_archived: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GoalRow {
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
}

#[derive(Serialize, Deserialize)]
pub struct HistoryRow {
    pub id: String,
    pub goal_id: String,
    pub from_status: String,
    pub to_status: String,
    pub reason: Option<String>,
    pub changed_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct TaskRow {
    pub id: String,
    pub title: String,
    pub goal_id: Option<String>,
    pub week_start: String,
    pub planned_date: Option<String>,
    pub is_focus: i64,
    pub status: String,
    pub done_at: Option<String>,
    pub sort_order: i64,
    pub carried_over_count: i64,
}

#[derive(Serialize, Deserialize)]
pub struct HabitRow {
    pub id: String,
    pub title: String,
    pub area_id: String,
    #[serde(default)]
    pub goal_id: Option<String>,
    pub frequency_type: String,
    pub frequency_target: i64,
    pub is_active: i64,
    pub created_at: String,
    #[serde(default = "default_habit_kind")]
    pub kind: String,
}

fn default_habit_kind() -> String {
    "form".into()
}

#[derive(Serialize, Deserialize)]
pub struct LogRow {
    pub habit_id: String,
    pub date: String,
    pub done: i64,
}

#[derive(Serialize, Deserialize)]
pub struct WeeklyRow {
    pub id: String,
    pub week_start: String,
    pub summary_snapshot: Option<String>,
    pub q_went_well: Option<String>,
    pub q_not_well: Option<String>,
    pub q_reason: Option<String>,
    pub q_next_week: Option<String>,
    pub satisfaction: Option<i64>,
    pub status: String,
    pub submitted_at: Option<String>,
    #[serde(default)]
    pub next_tasks_created: i64,
}

#[derive(Serialize, Deserialize)]
pub struct MonthlyRow {
    pub id: String,
    pub month: String,
    pub summary_snapshot: Option<String>,
    pub q_progress: Option<String>,
    pub q_insight: Option<String>,
    pub q_next_month: Option<String>,
    pub status: String,
    pub submitted_at: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct YearlyRow {
    pub id: String,
    pub year: String,
    pub summary_snapshot: Option<String>,
    pub q_progress: Option<String>,
    pub q_insight: Option<String>,
    pub q_next_year: Option<String>,
    pub status: String,
    pub submitted_at: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct NoteRow {
    pub id: String,
    pub date: String,
    pub kind: String,
    pub body: String,
    pub area_id: Option<String>,
    pub goal_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct Snapshot {
    pub file_name: String,
    pub last_backup_at: String,
}

pub fn backups_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("backups")
}

pub fn run_auto(conn: &Connection, data_dir: &Path) -> Result<Option<Snapshot>, AppError> {
    let settings = settings::load(conn)?;
    if !settings.auto_backup {
        return Ok(None);
    }
    let today = format_date(today());
    let already = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_backup_at'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .map(|v| v.starts_with(&today))
        .unwrap_or(false);
    if already {
        return Ok(None);
    }
    Ok(Some(create_snapshot(conn, data_dir)?))
}

pub fn create_snapshot(conn: &Connection, data_dir: &Path) -> Result<Snapshot, AppError> {
    let dir = backups_dir(data_dir);
    std::fs::create_dir_all(&dir)?;
    let stamp = Local::now().format("%Y-%m-%d-%H%M%S").to_string();
    let file_name = format!("life-planner-{stamp}.bak");
    let dest = dir.join(&file_name);
    vacuum_into(conn, &dest)?;
    let last_backup_at = Local::now().format("%Y-%m-%d %H:%M").to_string();
    settings::upsert(conn, "last_backup_at", &last_backup_at)?;
    let keep = settings::load(conn)?.keep_backups;
    prune(&dir, keep)?;
    Ok(Snapshot {
        file_name,
        last_backup_at,
    })
}

pub fn prune_to_keep(data_dir: &Path, keep: i64) -> Result<(), AppError> {
    prune(&backups_dir(data_dir), keep)
}

pub fn export_json(conn: &Connection) -> Result<String, AppError> {
    serde_json::to_string_pretty(&dump(conn)?).map_err(Into::into)
}

pub fn import_json(conn: &Connection, data_dir: &Path, raw: &str) -> Result<Snapshot, AppError> {
    let max = catalog().import_json_max_bytes;
    if raw.len() > max {
        return Err(AppError::new(
            IMPORT_INVALID,
            format!("备份文件超过 {} 字节上限", max),
        ));
    }
    let mut doc: ExportDoc = serde_json::from_str(raw)?;
    coerce_legacy_area_scores(&mut doc);
    validate(&doc)?;
    let snapshot = create_snapshot(conn, data_dir)?;
    restore(conn, &doc)?;
    settings::upsert(conn, "last_backup_at", &snapshot.last_backup_at)?;
    Ok(snapshot)
}

const WIPE_SQL: &str = "DELETE FROM notes;
         DELETE FROM habit_logs;
         DELETE FROM weekly_reviews;
         DELETE FROM monthly_reviews;
         DELETE FROM yearly_reviews;
         DELETE FROM tasks;
         DELETE FROM habits;
         DELETE FROM goal_status_history;
         DELETE FROM goals WHERE level = 'week';
         DELETE FROM goals WHERE level = 'month';
         DELETE FROM goals WHERE level = 'quarter';
         DELETE FROM goals WHERE level = 'year';
         DELETE FROM goals WHERE level = 'life';
         DELETE FROM areas;
         DELETE FROM settings;";

pub fn factory_reset(conn: &Connection, data_dir: &Path) -> Result<Snapshot, AppError> {
    let snap = create_snapshot(conn, data_dir)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(WIPE_SQL)?;
    tx.commit()?;
    db::seed::run(conn)?;
    settings::upsert(conn, "last_backup_at", &snap.last_backup_at)?;
    Ok(snap)
}

fn vacuum_into(conn: &Connection, dest: &Path) -> Result<(), AppError> {
    if dest.exists() {
        std::fs::remove_file(dest)?;
    }
    let path = dest.to_str().ok_or_else(|| {
        AppError::new(BACKUP_FAILED, "备份路径包含无法识别的字符")
    })?;
    if path.contains('\'') {
        return Err(AppError::new(BACKUP_FAILED, "备份路径无效"));
    }
    let sql = format!("VACUUM INTO '{}'", path.replace('\\', "/"));
    conn.execute_batch(&sql)
        .map_err(|e| AppError::new(BACKUP_FAILED, format!("无法写入备份：{e}")))?;
    Ok(())
}

fn prune(dir: &Path, keep: i64) -> Result<(), AppError> {
    if !dir.exists() {
        return Ok(());
    }
    let keep = keep.max(1) as usize;
    let mut files: Vec<_> = std::fs::read_dir(dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("life-planner-") && n.ends_with(".bak"))
                    .unwrap_or(false)
        })
        .collect();
    files.sort();
    files.reverse();
    for path in files.into_iter().skip(keep) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

fn dump(conn: &Connection) -> Result<ExportDoc, AppError> {
    Ok(ExportDoc {
        app: APP_MARK.into(),
        schema_version: catalog().export_schema_version,
        exported_at: Local::now().to_rfc3339(),
        settings: query_settings(conn)?,
        areas: query_areas(conn)?,
        goals: query_goals(conn)?,
        goal_status_history: query_history(conn)?,
        tasks: query_tasks(conn)?,
        habits: query_habits(conn)?,
        habit_logs: query_logs(conn)?,
        weekly_reviews: query_weekly(conn)?,
        monthly_reviews: query_monthly(conn)?,
        yearly_reviews: query_yearly(conn)?,
        notes: query_notes(conn)?,
    })
}

fn query_settings(conn: &Connection) -> Result<Vec<SettingRow>, AppError> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key")?;
    let rows = stmt.query_map([], |row| {
        Ok(SettingRow {
            key: row.get(0)?,
            value: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_areas(conn: &Connection) -> Result<Vec<AreaRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, color, sort_order, score, scored_at, is_archived FROM areas ORDER BY sort_order, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AreaRow {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            sort_order: row.get(3)?,
            score: row.get(4)?,
            scored_at: row.get(5)?,
            is_archived: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_goals(conn: &Connection) -> Result<Vec<GoalRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, level, parent_id, area_id, why, period_start, period_end,
                status, progress, status_reason, done_at, created_at, updated_at
         FROM goals ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(GoalRow {
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
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_history(conn: &Connection) -> Result<Vec<HistoryRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, goal_id, from_status, to_status, reason, changed_at
         FROM goal_status_history ORDER BY changed_at, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(HistoryRow {
            id: row.get(0)?,
            goal_id: row.get(1)?,
            from_status: row.get(2)?,
            to_status: row.get(3)?,
            reason: row.get(4)?,
            changed_at: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_tasks(conn: &Connection) -> Result<Vec<TaskRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, goal_id, week_start, planned_date, is_focus, status, done_at, sort_order, carried_over_count
         FROM tasks ORDER BY week_start, sort_order, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(TaskRow {
            id: row.get(0)?,
            title: row.get(1)?,
            goal_id: row.get(2)?,
            week_start: row.get(3)?,
            planned_date: row.get(4)?,
            is_focus: row.get(5)?,
            status: row.get(6)?,
            done_at: row.get(7)?,
            sort_order: row.get(8)?,
            carried_over_count: row.get(9)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_habits(conn: &Connection) -> Result<Vec<HabitRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, title, area_id, goal_id, frequency_type, frequency_target, is_active, created_at, kind
         FROM habits ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(HabitRow {
            id: row.get(0)?,
            title: row.get(1)?,
            area_id: row.get(2)?,
            goal_id: row.get(3)?,
            frequency_type: row.get(4)?,
            frequency_target: row.get(5)?,
            is_active: row.get(6)?,
            created_at: row.get(7)?,
            kind: row.get(8)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_logs(conn: &Connection) -> Result<Vec<LogRow>, AppError> {
    let mut stmt = conn.prepare("SELECT habit_id, date, done FROM habit_logs ORDER BY date, habit_id")?;
    let rows = stmt.query_map([], |row| {
        Ok(LogRow {
            habit_id: row.get(0)?,
            date: row.get(1)?,
            done: row.get(2)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_weekly(conn: &Connection) -> Result<Vec<WeeklyRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, week_start, summary_snapshot, q_went_well, q_not_well, q_reason, q_next_week,
                satisfaction, status, submitted_at, COALESCE(next_tasks_created, 0)
         FROM weekly_reviews ORDER BY week_start",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(WeeklyRow {
            id: row.get(0)?,
            week_start: row.get(1)?,
            summary_snapshot: row.get(2)?,
            q_went_well: row.get(3)?,
            q_not_well: row.get(4)?,
            q_reason: row.get(5)?,
            q_next_week: row.get(6)?,
            satisfaction: row.get(7)?,
            status: row.get(8)?,
            submitted_at: row.get(9)?,
            next_tasks_created: row.get(10)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_monthly(conn: &Connection) -> Result<Vec<MonthlyRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, month, summary_snapshot, q_progress, q_insight, q_next_month, status, submitted_at
         FROM monthly_reviews ORDER BY month",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(MonthlyRow {
            id: row.get(0)?,
            month: row.get(1)?,
            summary_snapshot: row.get(2)?,
            q_progress: row.get(3)?,
            q_insight: row.get(4)?,
            q_next_month: row.get(5)?,
            status: row.get(6)?,
            submitted_at: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_yearly(conn: &Connection) -> Result<Vec<YearlyRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, year, summary_snapshot, q_progress, q_insight, q_next_year, status, submitted_at
         FROM yearly_reviews ORDER BY year",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(YearlyRow {
            id: row.get(0)?,
            year: row.get(1)?,
            summary_snapshot: row.get(2)?,
            q_progress: row.get(3)?,
            q_insight: row.get(4)?,
            q_next_year: row.get(5)?,
            status: row.get(6)?,
            submitted_at: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_notes(conn: &Connection) -> Result<Vec<NoteRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, date, kind, body, area_id, goal_id, created_at, updated_at
         FROM notes ORDER BY date, created_at, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(NoteRow {
            id: row.get(0)?,
            date: row.get(1)?,
            kind: row.get(2)?,
            body: row.get(3)?,
            area_id: row.get(4)?,
            goal_id: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn coerce_legacy_area_scores(doc: &mut ExportDoc) {
    let max = domain::area_score_max();
    if doc
        .areas
        .iter()
        .any(|area| area.score.map(|score| score > max).unwrap_or(false))
    {
        for area in &mut doc.areas {
            if let Some(score) = area.score {
                area.score = Some(domain::scale_area_score_from_ten(score));
            }
        }
    }
    for row in doc.monthly_reviews.iter_mut() {
        if let Some(raw) = row.summary_snapshot.as_mut() {
            if let Some(next) = scale_snapshot_if_legacy(raw) {
                *raw = next;
            }
        }
    }
    for row in doc.yearly_reviews.iter_mut() {
        if let Some(raw) = row.summary_snapshot.as_mut() {
            if let Some(next) = scale_snapshot_if_legacy(raw) {
                *raw = next;
            }
        }
    }
}

fn scale_snapshot_if_legacy(raw: &str) -> Option<String> {
    let mut value: Value = serde_json::from_str(raw).ok()?;
    let scores = value.get_mut("area_scores")?.as_array_mut()?;
    let max = domain::area_score_max();
    if !scores.iter().any(|item| {
        item.get("score")
            .and_then(Value::as_i64)
            .map(|score| score > max)
            .unwrap_or(false)
    }) {
        return None;
    }
    for item in scores {
        if let Some(score) = item.get("score").and_then(Value::as_i64) {
            item["score"] = json!(domain::scale_area_score_from_ten(score));
        }
    }
    Some(value.to_string())
}

fn fail(message: impl Into<String>) -> AppError {
    AppError::new(IMPORT_INVALID, message)
}

fn require_id(value: &str, label: &str) -> Result<(), AppError> {
    if domain::is_record_id(value) {
        Ok(())
    } else {
        Err(fail(format!("{label}编号无效")))
    }
}

fn require_date(value: &str, label: &str) -> Result<(), AppError> {
    parse_date(value).map(|_| ()).map_err(|_| fail(format!("{label}日期无效")))
}

fn require_month(value: &str) -> Result<(), AppError> {
    if value.len() != 7 || value.as_bytes().get(4) != Some(&b'-') {
        return Err(fail("月份格式无效"));
    }
    parse_date(&format!("{value}-01"))
        .map(|_| ())
        .map_err(|_| fail("月份格式无效"))
}

fn require_json(value: &Option<String>) -> Result<(), AppError> {
    if let Some(raw) = value.as_deref().filter(|v| !v.is_empty()) {
        serde_json::from_str::<serde_json::Value>(raw)
            .map_err(|_| fail("快照字段不是合法 JSON"))?;
    }
    Ok(())
}

fn require_flag(value: i64, label: &str) -> Result<(), AppError> {
    if value == 0 || value == 1 {
        Ok(())
    } else {
        Err(fail(format!("{label}只能是 0 或 1")))
    }
}

fn validate_setting(row: &SettingRow) -> Result<(), AppError> {
    if !SETTING_KEYS.contains(&row.key.as_str()) {
        return Err(fail(format!("不支持的设置项 {}", row.key)));
    }
    match row.key.as_str() {
        "theme" if !domain::is_theme(&row.value) => Err(AppError::new(
            SETTINGS_INVALID,
            "主题不在支持列表中",
        )),
        "week_starts_on" => {
            let n: i64 = row.value.parse().map_err(|_| fail("每周起始日无效"))?;
            if domain::is_week_starts_on(n) {
                Ok(())
            } else {
                Err(fail("每周起始日只支持周一或周日"))
            }
        }
        "auto_backup" | "onboarded" | "reminder_enabled" if row.value != "0" && row.value != "1" => {
            Err(fail("开关设置无效"))
        }
        "keep_backups" => {
            let n: i64 = row.value.parse().map_err(|_| fail("保留备份份数无效"))?;
            if domain::is_keep_backups(n) {
                Ok(())
            } else {
                Err(fail("保留备份份数不在允许范围内"))
            }
        }
        "last_backup_at" | "last_sync_at" if row.value.chars().count() > 32 => {
            Err(fail("时间字段过长"))
        }
        "reminder_time" => domain::normalize_reminder_time(&row.value)
            .map(|_| ())
            .map_err(|_| fail("提醒时间须为 HH:MM")),
        "sync_dir" if row.value.chars().count() > 500 || row.value.contains('\0') => {
            Err(fail("同步目录无效"))
        }
        "last_reminder_date" | "started_on"
            if !row.value.is_empty() && parse_date(&row.value).is_err() =>
        {
            Err(fail("日期无效"))
        }
        _ => Ok(()),
    }
}

fn validate(doc: &ExportDoc) -> Result<(), AppError> {
    if doc.app != APP_MARK {
        return Err(fail("不是人生规划的备份文件"));
    }
    if doc.schema_version < 1 || doc.schema_version > catalog().export_schema_version {
        return Err(fail("备份版本不受支持"));
    }
    if doc.areas.is_empty() {
        return Err(fail("备份里没有维度"));
    }
    if doc.areas.len() as i64 > catalog().area_count_max {
        return Err(fail("维度数量超过上限"));
    }
    for row in &doc.settings {
        validate_setting(row)?;
    }
    let mut area_ids = HashSet::new();
    let mut area_names = HashSet::new();
    for area in &doc.areas {
        require_id(&area.id, "维度")?;
        if !area_ids.insert(area.id.clone()) {
            return Err(fail("维度编号重复"));
        }
        let name = domain::normalize_area_name(&area.name)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        if !area_names.insert(name) {
            return Err(fail("维度名称重复"));
        }
        if !domain::is_area_color(&area.color) {
            return Err(fail("维度颜色不在允许的色板内"));
        }
        if let Some(score) = area.score {
            if !domain::is_area_score(score) {
                return Err(fail(format!(
                    "维度分数必须在 {} 到 {} 之间",
                    domain::area_score_min(),
                    domain::area_score_max()
                )));
            }
        }
        require_flag(area.is_archived, "维度归档标记")?;
    }

    let mut goal_ids = HashSet::new();
    for goal in &doc.goals {
        require_id(&goal.id, "目标")?;
        if !goal_ids.insert(goal.id.clone()) {
            return Err(fail("目标编号重复"));
        }
        domain::normalize_goal_title(&goal.title)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        domain::normalize_goal_why(
            &goal.why,
            goal.parent_id.as_deref().filter(|v| !v.is_empty()).is_some(),
        )
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        if !domain::is_goal_level(&goal.level) {
            return Err(fail("目标层级无效"));
        }
        if !domain::is_goal_status(&goal.status) {
            return Err(fail("目标状态无效"));
        }
        if !(0..=100).contains(&goal.progress) {
            return Err(fail("目标进度必须在 0 到 100 之间"));
        }
        if !area_ids.contains(&goal.area_id) {
            return Err(fail("目标引用了不存在的维度"));
        }
        require_date(&goal.period_start, "目标周期开始")?;
        require_date(&goal.period_end, "目标周期结束")?;
        if let Some(parent) = goal.parent_id.as_deref().filter(|v| !v.is_empty()) {
            if parent == goal.id {
                return Err(fail("目标不能把自己当上级"));
            }
        }
    }
    for goal in &doc.goals {
        if let Some(parent) = goal.parent_id.as_deref().filter(|v| !v.is_empty()) {
            let parent_goal = doc.goals.iter().find(|g| g.id == parent).ok_or_else(|| {
                fail("目标引用了不存在的上级")
            })?;
            if !domain::is_allowed_parent(&goal.level, &parent_goal.level) {
                return Err(fail("目标上下级层级不匹配"));
            }
            if parent_goal.level != "life" && parent_goal.area_id != goal.area_id {
                return Err(fail("下级必须和上级在同一维度"));
            }
        }
    }

    for row in &doc.goal_status_history {
        require_id(&row.id, "状态历史")?;
        if !goal_ids.contains(&row.goal_id) {
            return Err(fail("状态历史引用了不存在的目标"));
        }
        if !domain::is_goal_status(&row.from_status) || !domain::is_goal_status(&row.to_status) {
            return Err(fail("状态历史的状态无效"));
        }
    }

    let mut task_ids = HashSet::new();
    for task in &doc.tasks {
        require_id(&task.id, "任务")?;
        if !task_ids.insert(task.id.clone()) {
            return Err(fail("任务编号重复"));
        }
        domain::normalize_task_title(&task.title)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        require_date(&task.week_start, "任务所属周")?;
        if let Some(date) = task.planned_date.as_deref().filter(|v| !v.is_empty()) {
            require_date(date, "任务计划")?;
        }
        if let Some(goal_id) = task.goal_id.as_deref().filter(|v| !v.is_empty()) {
            let goal = doc.goals.iter().find(|g| g.id == goal_id).ok_or_else(|| {
                fail("任务引用了不存在的目标")
            })?;
            if !domain::task_goal_level_allowed(&goal.level) {
                return Err(fail("任务不能挂在人生目标下"));
            }
        }
        require_flag(task.is_focus, "焦点标记")?;
        if task.status != "todo" && task.status != "done" {
            return Err(fail("任务状态无效"));
        }
        if task.carried_over_count < 0 {
            return Err(fail("顺延次数无效"));
        }
    }

    let mut habit_ids = HashSet::new();
    for habit in &doc.habits {
        require_id(&habit.id, "习惯")?;
        if !habit_ids.insert(habit.id.clone()) {
            return Err(fail("习惯编号重复"));
        }
        domain::normalize_habit_title(&habit.title)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        domain::normalize_frequency(&habit.frequency_type, habit.frequency_target)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        domain::normalize_habit_kind(Some(habit.kind.as_str()))
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        if !area_ids.contains(&habit.area_id) {
            return Err(fail("习惯引用了不存在的维度"));
        }
        if let Some(goal_id) = habit.goal_id.as_deref().filter(|v| !v.is_empty()) {
            let goal = doc.goals.iter().find(|g| g.id == goal_id).ok_or_else(|| {
                fail("习惯引用了不存在的目标")
            })?;
            if goal.area_id != habit.area_id {
                return Err(fail("习惯只能挂到同一维度的目标下"));
            }
        }
        require_flag(habit.is_active, "习惯启用标记")?;
    }
    for log in &doc.habit_logs {
        if !habit_ids.contains(&log.habit_id) {
            return Err(fail("打卡记录引用了不存在的习惯"));
        }
        require_date(&log.date, "打卡")?;
        require_flag(log.done, "打卡标记")?;
    }

    let mut weeks = HashSet::new();
    for row in &doc.weekly_reviews {
        require_id(&row.id, "周复盘")?;
        require_date(&row.week_start, "周复盘")?;
        if !weeks.insert(row.week_start.clone()) {
            return Err(fail("周复盘日期重复"));
        }
        if !matches!(row.status.as_str(), "draft" | "submitted" | "skipped") {
            return Err(fail("周复盘状态无效"));
        }
        if let Some(sat) = row.satisfaction {
            if !(1..=10).contains(&sat) {
                return Err(fail("周复盘满意度须在 1 到 10 之间"));
            }
        }
        require_json(&row.summary_snapshot)?;
    }
    let mut months = HashSet::new();
    for row in &doc.monthly_reviews {
        require_id(&row.id, "月复盘")?;
        require_month(&row.month)?;
        if !months.insert(row.month.clone()) {
            return Err(fail("月复盘月份重复"));
        }
        if row.status != "draft" && row.status != "submitted" {
            return Err(fail("月复盘状态无效"));
        }
        require_json(&row.summary_snapshot)?;
    }
    let mut years = HashSet::new();
    for row in &doc.yearly_reviews {
        require_id(&row.id, "年复盘")?;
        if row.year.len() != 4 || row.year.parse::<i32>().ok().filter(|y| (2000..=2100).contains(y)).is_none() {
            return Err(fail("年复盘年份无效"));
        }
        if !years.insert(row.year.clone()) {
            return Err(fail("年复盘年份重复"));
        }
        if row.status != "draft" && row.status != "submitted" {
            return Err(fail("年复盘状态无效"));
        }
        require_json(&row.summary_snapshot)?;
    }
    let mut note_ids = HashSet::new();
    for row in &doc.notes {
        require_id(&row.id, "随记")?;
        if !note_ids.insert(row.id.clone()) {
            return Err(fail("随记编号重复"));
        }
        require_date(&row.date, "随记")?;
        if !domain::is_note_kind(&row.kind) {
            return Err(fail("随记类型无效"));
        }
        domain::normalize_note_body(&row.body)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
        if let Some(area_id) = row.area_id.as_deref().filter(|v| !v.is_empty()) {
            if !area_ids.contains(area_id) {
                return Err(fail("随记引用了不存在的维度"));
            }
        }
        if let Some(goal_id) = row.goal_id.as_deref().filter(|v| !v.is_empty()) {
            let goal = doc.goals.iter().find(|g| g.id == goal_id).ok_or_else(|| {
                fail("随记引用了不存在的目标")
            })?;
            if let Some(area_id) = row.area_id.as_deref().filter(|v| !v.is_empty()) {
                if goal.area_id != area_id {
                    return Err(fail("随记只能挂到同一维度的目标下"));
                }
            }
        }
        if row.created_at.chars().count() > 40 || row.updated_at.chars().count() > 40 {
            return Err(fail("随记时间字段过长"));
        }
    }
    Ok(())
}

fn restore(conn: &Connection, doc: &ExportDoc) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction()?;
    tx.execute_batch(WIPE_SQL)?;

    let mut stmt = tx.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2)")?;
    for row in &doc.settings {
        stmt.execute(params![row.key, row.value])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare(
        "INSERT INTO areas (id, name, color, sort_order, score, scored_at, is_archived)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;
    for row in &doc.areas {
        stmt.execute(params![
            row.id,
            row.name.trim(),
            row.color,
            row.sort_order,
            row.score,
            row.scored_at,
            row.is_archived
        ])?;
    }
    drop(stmt);

    let mut goals = doc.goals.clone();
    goals.sort_by_key(|g| match g.level.as_str() {
        "life" => 0,
        "year" => 1,
        "quarter" => 2,
        "month" => 3,
        _ => 4,
    });
    let mut stmt = tx.prepare(
        "INSERT INTO goals (
            id, title, level, parent_id, area_id, why, period_start, period_end,
            status, progress, status_reason, done_at, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
    )?;
    for row in &goals {
        let parent = row.parent_id.as_deref().filter(|v| !v.is_empty());
        stmt.execute(params![
            row.id,
            row.title.trim(),
            row.level,
            parent,
            row.area_id,
            row.why.trim(),
            row.period_start,
            row.period_end,
            row.status,
            row.progress,
            row.status_reason,
            row.done_at,
            row.created_at,
            row.updated_at
        ])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare(
        "INSERT INTO goal_status_history (id, goal_id, from_status, to_status, reason, changed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;
    for row in &doc.goal_status_history {
        stmt.execute(params![
            row.id,
            row.goal_id,
            row.from_status,
            row.to_status,
            row.reason,
            row.changed_at
        ])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare(
        "INSERT INTO tasks (id, title, goal_id, week_start, planned_date, is_focus, status, done_at, sort_order, carried_over_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    )?;
    for row in &doc.tasks {
        let goal_id = row.goal_id.as_deref().filter(|v| !v.is_empty());
        let planned = row.planned_date.as_deref().filter(|v| !v.is_empty());
        stmt.execute(params![
            row.id,
            row.title.trim(),
            goal_id,
            row.week_start,
            planned,
            row.is_focus,
            row.status,
            row.done_at,
            row.sort_order,
            row.carried_over_count
        ])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare(
        "INSERT INTO habits (id, title, area_id, goal_id, frequency_type, frequency_target, is_active, created_at, kind)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )?;
    for row in &doc.habits {
        let goal_id = row.goal_id.as_deref().filter(|v| !v.is_empty());
        stmt.execute(params![
            row.id,
            row.title.trim(),
            row.area_id,
            goal_id,
            row.frequency_type,
            row.frequency_target,
            row.is_active,
            row.created_at,
            row.kind
        ])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare("INSERT INTO habit_logs (habit_id, date, done) VALUES (?1, ?2, ?3)")?;
    for row in &doc.habit_logs {
        stmt.execute(params![row.habit_id, row.date, row.done])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare(
        "INSERT INTO weekly_reviews (
            id, week_start, summary_snapshot, q_went_well, q_not_well, q_reason, q_next_week,
            satisfaction, status, submitted_at, next_tasks_created
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )?;
    for row in &doc.weekly_reviews {
        stmt.execute(params![
            row.id,
            row.week_start,
            row.summary_snapshot,
            row.q_went_well,
            row.q_not_well,
            row.q_reason,
            row.q_next_week,
            row.satisfaction,
            row.status,
            row.submitted_at,
            row.next_tasks_created
        ])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare(
        "INSERT INTO monthly_reviews (
            id, month, summary_snapshot, q_progress, q_insight, q_next_month, status, submitted_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )?;
    for row in &doc.monthly_reviews {
        stmt.execute(params![
            row.id,
            row.month,
            row.summary_snapshot,
            row.q_progress,
            row.q_insight,
            row.q_next_month,
            row.status,
            row.submitted_at
        ])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare(
        "INSERT INTO yearly_reviews (
            id, year, summary_snapshot, q_progress, q_insight, q_next_year, status, submitted_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )?;
    for row in &doc.yearly_reviews {
        stmt.execute(params![
            row.id,
            row.year,
            row.summary_snapshot,
            row.q_progress,
            row.q_insight,
            row.q_next_year,
            row.status,
            row.submitted_at
        ])?;
    }
    drop(stmt);

    let mut stmt = tx.prepare(
        "INSERT INTO notes (id, date, kind, body, area_id, goal_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )?;
    for row in &doc.notes {
        let area_id = row.area_id.as_deref().filter(|v| !v.is_empty());
        let goal_id = row.goal_id.as_deref().filter(|v| !v.is_empty());
        stmt.execute(params![
            row.id,
            row.date,
            row.kind,
            row.body.trim(),
            area_id,
            goal_id,
            row.created_at,
            row.updated_at
        ])?;
    }
    drop(stmt);

    tx.commit()?;
    db::seed::run(conn)?;
    Ok(())
}

pub fn mirror_sync(conn: &Connection, data_dir: &Path) -> Result<Option<String>, AppError> {
    let settings = settings::load(conn)?;
    if settings.sync_dir.trim().is_empty() {
        return Ok(None);
    }
    let dest = std::path::Path::new(settings.sync_dir.trim());
    if !dest.is_dir() {
        return Err(AppError::new(BACKUP_FAILED, "同步目录不存在"));
    }
    let json = export_json(conn)?;
    std::fs::write(dest.join("life-planner-export.json"), json.as_bytes())?;
    let bak = dest.join("life-planner-latest.bak");
    vacuum_into(conn, &bak)?;
    let last_sync_at = Local::now().format("%Y-%m-%d %H:%M").to_string();
    settings::upsert(conn, "last_sync_at", &last_sync_at)?;
    let _ = data_dir;
    Ok(Some(last_sync_at))
}
