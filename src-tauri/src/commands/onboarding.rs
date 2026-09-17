use chrono::Datelike;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::areas::{apply_scores, AreaScoreInput};
use crate::commands::goals::insert_goal;
use crate::commands::habits::insert_habit;
use crate::commands::settings::{self, SettingsMap};
use crate::commands::tasks::insert_task;
use crate::db::{self, Db};
use crate::domain::{self, format_date, today};
use crate::error::{AppError, VALIDATION_FAILED};

#[derive(Deserialize)]
pub struct OnboardingPayload {
    pub scores: Vec<AreaScoreInput>,
    pub title: Option<String>,
    pub why: Option<String>,
    #[serde(alias = "areaId")]
    pub area_id: Option<String>,
    #[serde(alias = "quarterTitle")]
    pub quarter_title: Option<String>,
    #[serde(alias = "monthTitle")]
    pub month_title: Option<String>,
    #[serde(alias = "weekTitle")]
    pub week_title: Option<String>,
    #[serde(alias = "taskTitle")]
    pub task_title: Option<String>,
    #[serde(alias = "habitTitle")]
    pub habit_title: Option<String>,
    #[serde(alias = "habitFrequency")]
    pub habit_frequency: Option<String>,
    #[serde(alias = "habitAreaId")]
    pub habit_area_id: Option<String>,
}

#[derive(Serialize)]
pub struct OnboardingResult {
    pub settings: SettingsMap,
    pub warning: Option<String>,
}

fn optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
}

fn optional_goal_title(value: Option<&str>) -> Result<Option<String>, AppError> {
    match optional_text(value) {
        Some(raw) => domain::normalize_goal_title(&raw)
            .map(Some)
            .map_err(|message| AppError::new(VALIDATION_FAILED, message)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn complete_onboarding(
    db: State<'_, Db>,
    payload: OnboardingPayload,
) -> Result<OnboardingResult, AppError> {
    db::with_conn(&db, |conn| {
        let tx = conn.unchecked_transaction()?;
        if !payload.scores.is_empty() {
            apply_scores(&tx, &payload.scores)?;
        }

        let year_title = optional_goal_title(payload.title.as_deref())?;
        let why_raw = optional_text(payload.why.as_deref());
        let mut warning: Option<String> = None;
        let mut week_goal_id: Option<String> = None;

        if let (Some(title), Some(why_raw)) = (year_title, why_raw) {
            let why = domain::normalize_goal_why(&why_raw)
                .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
            let area_id = payload
                .area_id
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .ok_or_else(|| AppError::new(VALIDATION_FAILED, "请选择年度目标所属维度"))?;
            let year = i64::from(today().year());

            let (year_id, w) = insert_goal(&tx, &title, &why, area_id, "year", None, year)?;
            warning = w;

            let mut parent_id = year_id;
            let chain = [
                ("quarter", payload.quarter_title.as_deref()),
                ("month", payload.month_title.as_deref()),
                ("week", payload.week_title.as_deref()),
            ];
            for (level, raw) in chain {
                let Some(child_title) = optional_goal_title(raw)? else {
                    break;
                };
                let (id, w) =
                    insert_goal(&tx, &child_title, &why, area_id, level, Some(&parent_id), year)?;
                if warning.is_none() {
                    warning = w;
                }
                if level == "week" {
                    week_goal_id = Some(id.clone());
                }
                parent_id = id;
            }

            if let Some(task_title) = optional_text(payload.task_title.as_deref()) {
                let title = domain::normalize_task_title(&task_title)
                    .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
                let day = format_date(today());
                insert_task(
                    &tx,
                    &title,
                    &day,
                    week_goal_id.as_deref(),
                    Some(&day),
                    true,
                )?;
            }
        }

        if let Some(habit_title) = optional_text(payload.habit_title.as_deref()) {
            let title = domain::normalize_habit_title(&habit_title)
                .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
            let area_id = optional_text(payload.habit_area_id.as_deref())
                .or_else(|| optional_text(payload.area_id.as_deref()))
                .ok_or_else(|| AppError::new(VALIDATION_FAILED, "请选择习惯所属维度"))?;
            let freq = payload
                .habit_frequency
                .as_deref()
                .unwrap_or("daily");
            let target = if freq == "weekly" { 3 } else { 7 };
            let (frequency_type, frequency_target) = domain::normalize_frequency(freq, target)
                .map_err(|message| AppError::new(VALIDATION_FAILED, message))?;
            insert_habit(&tx, &title, &area_id, &frequency_type, frequency_target, None)?;
        }

        settings::upsert(&tx, "onboarded", "1")?;
        tx.commit()?;
        Ok(OnboardingResult {
            settings: settings::load(conn)?,
            warning,
        })
    })
}
