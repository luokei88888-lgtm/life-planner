mod period;

pub use period::{
    add_days, format_date, last_day_of_month, allowed_parent_levels, is_allowed_parent, parent_level, parent_required, parse_date, period_for,
    today, week_start,
};

use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ActiveLimits {
    pub life: i64,
    pub year: i64,
    pub quarter: i64,
    pub month: i64,
    pub week: i64,
}

impl ActiveLimits {
    pub fn for_level(&self, level: &str) -> i64 {
        match level {
            "life" => self.life,
            "year" => self.year,
            "quarter" => self.quarter,
            "month" => self.month,
            "week" => self.week,
            _ => 5,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct Catalog {
    pub themes: Vec<String>,
    pub area_palette: Vec<String>,
    pub area_name_max: usize,
    pub area_count_max: i64,
    pub area_score_min: i64,
    pub area_score_max: i64,
    pub goal_title_max: usize,
    pub goal_why_max: usize,
    pub goal_levels: Vec<String>,
    pub goal_statuses: Vec<String>,
    pub active_limits: ActiveLimits,
    pub task_title_max: usize,
    pub focus_limit_per_day: i64,
    pub habit_title_max: usize,
    pub habit_backfill_days: i64,
    pub habit_kinds: Vec<String>,
    pub review_answer_max: usize,
    pub review_next_task_max: usize,
    pub note_kinds: Vec<String>,
    pub note_body_max: usize,
    pub note_page_size: i64,
    pub keep_backup_counts: Vec<i64>,
    pub export_schema_version: i64,
    pub import_json_max_bytes: usize,
}

#[derive(Deserialize)]
struct CatalogFile {
    themes: Vec<String>,
    #[serde(rename = "areaPalette")]
    area_palette: Vec<String>,
    #[serde(rename = "areaNameMax")]
    area_name_max: usize,
    #[serde(rename = "areaCountMax")]
    area_count_max: i64,
    #[serde(rename = "areaScoreMin")]
    area_score_min: i64,
    #[serde(rename = "areaScoreMax")]
    area_score_max: i64,
    #[serde(rename = "goalTitleMax")]
    goal_title_max: usize,
    #[serde(rename = "goalWhyMax")]
    goal_why_max: usize,
    #[serde(rename = "goalLevels")]
    goal_levels: Vec<String>,
    #[serde(rename = "goalStatuses")]
    goal_statuses: Vec<String>,
    #[serde(rename = "activeLimits")]
    active_limits: ActiveLimits,
    #[serde(rename = "taskTitleMax")]
    task_title_max: usize,
    #[serde(rename = "focusLimitPerDay")]
    focus_limit_per_day: i64,
    #[serde(rename = "habitTitleMax")]
    habit_title_max: usize,
    #[serde(rename = "habitBackfillDays")]
    habit_backfill_days: i64,
    #[serde(rename = "habitKinds")]
    habit_kinds: Vec<String>,
    #[serde(rename = "reviewAnswerMax")]
    review_answer_max: usize,
    #[serde(rename = "reviewNextTaskMax")]
    review_next_task_max: usize,
    #[serde(rename = "noteKinds")]
    note_kinds: Vec<String>,
    #[serde(rename = "noteBodyMax")]
    note_body_max: usize,
    #[serde(rename = "notePageSize")]
    note_page_size: i64,
    #[serde(rename = "keepBackupCounts")]
    keep_backup_counts: Vec<i64>,
    #[serde(rename = "exportSchemaVersion")]
    export_schema_version: i64,
    #[serde(rename = "importJsonMaxBytes")]
    import_json_max_bytes: usize,
}

pub fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let raw: CatalogFile = serde_json::from_str(include_str!("../../../contracts/catalog.json"))
            .expect("contracts/catalog.json 无效");
        Catalog {
            themes: raw.themes,
            area_palette: raw.area_palette,
            area_name_max: raw.area_name_max,
            area_count_max: raw.area_count_max,
            area_score_min: raw.area_score_min,
            area_score_max: raw.area_score_max,
            goal_title_max: raw.goal_title_max,
            goal_why_max: raw.goal_why_max,
            goal_levels: raw.goal_levels,
            goal_statuses: raw.goal_statuses,
            active_limits: raw.active_limits,
            task_title_max: raw.task_title_max,
            focus_limit_per_day: raw.focus_limit_per_day,
            habit_title_max: raw.habit_title_max,
            habit_backfill_days: raw.habit_backfill_days,
            habit_kinds: raw.habit_kinds,
            review_answer_max: raw.review_answer_max,
            review_next_task_max: raw.review_next_task_max,
            note_kinds: raw.note_kinds,
            note_body_max: raw.note_body_max,
            note_page_size: raw.note_page_size,
            keep_backup_counts: raw.keep_backup_counts,
            export_schema_version: raw.export_schema_version,
            import_json_max_bytes: raw.import_json_max_bytes,
        }
    })
}

pub fn area_score_min() -> i64 {
    catalog().area_score_min
}

pub fn area_score_max() -> i64 {
    catalog().area_score_max
}

pub fn default_area_score() -> i64 {
    (area_score_min() + area_score_max() + 1) / 2
}

pub fn is_area_score(value: i64) -> bool {
    (area_score_min()..=area_score_max()).contains(&value)
}

pub fn scale_area_score_from_ten(score: i64) -> i64 {
    ((score + 1) / 2).clamp(area_score_min(), area_score_max())
}

pub fn is_theme(value: &str) -> bool {
    catalog().themes.iter().any(|t| t == value)
}

pub fn is_week_starts_on(value: i64) -> bool {
    value == 0 || value == 1
}

pub fn is_keep_backups(value: i64) -> bool {
    catalog().keep_backup_counts.contains(&value)
}

pub fn is_reminder_time(value: &str) -> bool {
    normalize_reminder_time(value).is_ok()
}

pub fn normalize_reminder_time(value: &str) -> Result<String, String> {
    let parts: Vec<&str> = value.trim().split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return Err("提醒时间须为 HH:MM".into());
    }
    let Ok(hour) = parts[0].parse::<u32>() else {
        return Err("提醒时间须为 HH:MM".into());
    };
    let Ok(minute) = parts[1].parse::<u32>() else {
        return Err("提醒时间须为 HH:MM".into());
    };
    if hour > 23 || minute > 59 {
        return Err("提醒时间须为 HH:MM".into());
    }
    if parts.len() == 3 {
        let Ok(second) = parts[2].parse::<u32>() else {
            return Err("提醒时间须为 HH:MM".into());
        };
        if second > 59 {
            return Err("提醒时间须为 HH:MM".into());
        }
    }
    Ok(format!("{hour:02}:{minute:02}"))
}

pub fn is_record_id(value: &str) -> bool {
    let len = value.chars().count();
    (1..=64).contains(&len)
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub fn is_area_color(value: &str) -> bool {
    catalog().area_palette.iter().any(|c| c == value)
}

pub fn is_goal_level(value: &str) -> bool {
    catalog().goal_levels.iter().any(|l| l == value)
}

pub fn is_goal_status(value: &str) -> bool {
    catalog().goal_statuses.iter().any(|s| s == value)
}

pub fn normalize_area_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("维度名称不能为空".into());
    }
    if trimmed.chars().count() > catalog().area_name_max {
        return Err(format!("维度名称最多 {} 个字", catalog().area_name_max));
    }
    Ok(trimmed.to_string())
}

pub fn normalize_goal_title(title: &str) -> Result<String, String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("标题不能为空".into());
    }
    if trimmed.chars().count() > catalog().goal_title_max {
        return Err(format!("标题最多 {} 个字", catalog().goal_title_max));
    }
    Ok(trimmed.to_string())
}

pub fn percent(n: i64, d: i64) -> i64 {
    if d <= 0 {
        0
    } else {
        ((n as f64 / d as f64) * 100.0).round() as i64
    }
}

pub fn habit_expected(freq: &str, target: i64, days: u32) -> i64 {
    if freq == "daily" {
        i64::from(days)
    } else {
        ((f64::from(days) / 7.0) * target as f64).round().max(1.0) as i64
    }
}

pub fn is_note_kind(value: &str) -> bool {
    catalog().note_kinds.iter().any(|k| k == value)
}

pub fn normalize_note_body(body: &str) -> Result<String, String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err("先写下一段话".into());
    }
    if trimmed.chars().count() > catalog().note_body_max {
        return Err(format!("正文最多 {} 个字", catalog().note_body_max));
    }
    Ok(trimmed.to_string())
}

pub fn normalize_review_answer(text: &str, required: bool) -> Result<String, String> {
    let trimmed = text.trim();
    if required && trimmed.is_empty() {
        return Err("问题都要回答，哪怕只写一句".into());
    }
    if trimmed.chars().count() > catalog().review_answer_max {
        return Err(format!("回答最多 {} 个字", catalog().review_answer_max));
    }
    Ok(trimmed.to_string())
}

pub fn is_habit_kind(value: &str) -> bool {
    catalog().habit_kinds.iter().any(|k| k == value)
}

pub fn normalize_habit_kind(value: Option<&str>) -> Result<String, String> {
    let raw = value.map(str::trim).filter(|v| !v.is_empty()).unwrap_or("form");
    if is_habit_kind(raw) {
        Ok(raw.to_string())
    } else {
        Err("习惯只能是养成或戒除".into())
    }
}

pub fn normalize_habit_title(title: &str) -> Result<String, String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("标题不能为空".into());
    }
    if trimmed.chars().count() > catalog().habit_title_max {
        return Err(format!("标题最多 {} 个字", catalog().habit_title_max));
    }
    Ok(trimmed.to_string())
}

pub fn normalize_frequency(freq: &str, target: i64) -> Result<(String, i64), String> {
    match freq {
        "daily" => Ok(("daily".into(), 7)),
        "weekly" => {
            if !(1..=6).contains(&target) {
                return Err("每周次数须在 1 到 6 之间".into());
            }
            Ok(("weekly".into(), target))
        }
        _ => Err("频率只能是每天或每周".into()),
    }
}

pub fn task_may_attach_goal(
    level: &str,
    status: &str,
    period_start: &str,
    period_end: &str,
    week_start: &str,
) -> Result<(), String> {
    if status != "active" {
        return Err("只能关联进行中的目标".into());
    }
    let week = parse_date(week_start)?;
    let start = parse_date(period_start)?;
    let end = parse_date(period_end)?;
    match level {
        "week" => {
            if start != week {
                return Err("任务只能挂在同一周的周目标下".into());
            }
            Ok(())
        }
        "month" | "quarter" | "year" => {
            if start <= week && week <= end {
                Ok(())
            } else {
                Err("只能挂在时间覆盖本周的月、季或年目标下".into())
            }
        }
        "life" => Err("任务不能直接挂在人生目标下".into()),
        _ => Err("不能挂在这个层级的目标下".into()),
    }
}

pub fn task_goal_level_allowed(level: &str) -> bool {
    matches!(level, "week" | "month" | "quarter" | "year")
}

pub fn normalize_task_title(title: &str) -> Result<String, String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("先写一个任务标题".into());
    }
    if trimmed.chars().count() > catalog().task_title_max {
        return Err(format!("标题最多 {} 个字", catalog().task_title_max));
    }
    Ok(trimmed.to_string())
}

pub fn normalize_review_next_titles(titles: &[String]) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for title in titles {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            continue;
        }
        out.push(normalize_task_title(trimmed)?);
    }
    if out.len() > catalog().review_next_task_max {
        return Err(format!(
            "下周任务最多 {} 条",
            catalog().review_next_task_max
        ));
    }
    Ok(out)
}

pub fn normalize_goal_why(why: &str) -> Result<String, String> {
    let trimmed = why.trim();
    if trimmed.is_empty() {
        return Err("「为什么重要」是必填的".into());
    }
    if trimmed.chars().count() > catalog().goal_why_max {
        return Err(format!("原因最多 {} 个字", catalog().goal_why_max));
    }
    Ok(trimmed.to_string())
}

pub fn normalize_status_reason(reason: &str, required: bool) -> Result<String, String> {
    let trimmed = reason.trim();
    if required && trimmed.is_empty() {
        return Err("请写下原因".into());
    }
    if trimmed.chars().count() > catalog().goal_why_max {
        return Err(format!("原因最多 {} 个字", catalog().goal_why_max));
    }
    Ok(trimmed.to_string())
}

pub fn level_label(level: &str) -> &'static str {
    match level {
        "life" => "人生",
        "year" => "年度",
        "quarter" => "季度",
        "month" => "月度",
        "week" => "周",
        _ => "目标",
    }
}

pub fn allowed_parent_label(level: &str) -> String {
    allowed_parent_levels(level)
        .iter()
        .map(|item| format!("{}目标", level_label(item)))
        .collect::<Vec<_>>()
        .join("、")
}

pub fn can_transition(from: &str, to: &str) -> bool {
    matches!(
        (from, to),
        ("active", "done")
            | ("active", "paused")
            | ("active", "dropped")
            | ("paused", "active")
            | ("paused", "dropped")
            | ("done", "active")
            | ("dropped", "active")
    )
}
