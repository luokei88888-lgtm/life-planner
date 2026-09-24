use serde::Serialize;

pub const DB_OPEN_FAILED: &str = "DB_OPEN_FAILED";
pub const DB_MIGRATE_FAILED: &str = "DB_MIGRATE_FAILED";
pub const DB_QUERY_FAILED: &str = "DB_QUERY_FAILED";
pub const SETTINGS_INVALID: &str = "SETTINGS_INVALID";
pub const VALIDATION_FAILED: &str = "VALIDATION_FAILED";
pub const NOT_FOUND: &str = "NOT_FOUND";
pub const AREA_NAME_TAKEN: &str = "AREA_NAME_TAKEN";
#[allow(dead_code)]
pub const AREA_IN_USE: &str = "AREA_IN_USE";
pub const AREA_FIXED: &str = "AREA_FIXED";
pub const GOAL_IN_USE: &str = "GOAL_IN_USE";
pub const GOAL_PARENT_INVALID: &str = "GOAL_PARENT_INVALID";
pub const STATUS_INVALID: &str = "STATUS_INVALID";
pub const WEEK_LOCKED: &str = "WEEK_LOCKED";
pub const FOCUS_LIMIT: &str = "FOCUS_LIMIT";
pub const HABIT_INACTIVE: &str = "HABIT_INACTIVE";
pub const BACKFILL_WINDOW: &str = "BACKFILL_WINDOW";
pub const REVIEW_LOCKED: &str = "REVIEW_LOCKED";
pub const REVIEW_NOT_DUE: &str = "REVIEW_NOT_DUE";
pub const REVIEW_NEXT_TASKS_DONE: &str = "REVIEW_NEXT_TASKS_DONE";
pub const BACKUP_FAILED: &str = "BACKUP_FAILED";
pub const IMPORT_INVALID: &str = "IMPORT_INVALID";

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
}

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::new(DB_QUERY_FAILED, value.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::new(DB_OPEN_FAILED, value.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::new(IMPORT_INVALID, format!("备份文件无法解析：{value}"))
    }
}
