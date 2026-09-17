use chrono::Datelike;
use rusqlite::params;

use crate::backup;
use crate::commands::calendar::build_ics;
use crate::commands::goals::{delete_goal_record, insert_goal};
use crate::commands::habits::insert_habit;
use crate::commands::reviews::{monthly_view, weekly_view, yearly_view};
use crate::commands::settings;
use crate::commands::tasks::insert_task;
use crate::db;
use crate::domain::{self, format_date, today, week_start};

fn conn() -> rusqlite::Connection {
    db::open_memory().expect("memory db")
}

#[test]
fn seed_and_migration_ready() {
    let conn = conn();
    let areas: i64 = conn
        .query_row("SELECT COUNT(1) FROM areas WHERE is_archived = 0", [], |row| row.get(0))
        .unwrap();
    assert_eq!(areas, 8);
    assert!(domain::catalog().themes.iter().any(|t| t == "moss"));
    assert!(domain::is_theme("snow"));
    let n: i64 = conn
        .query_row("SELECT COUNT(1) FROM yearly_reviews", [], |row| row.get(0))
        .unwrap();
    assert_eq!(n, 0);
}

#[test]
fn reminder_time_accepts_seconds() {
    assert_eq!(domain::normalize_reminder_time("09:00").unwrap(), "09:00");
    assert_eq!(domain::normalize_reminder_time("9:5").unwrap(), "09:05");
    assert_eq!(domain::normalize_reminder_time("21:30:00").unwrap(), "21:30");
    assert!(domain::normalize_reminder_time("24:00").is_err());
}

#[test]
fn life_year_tree_and_orphan_year() {
    let conn = conn();
    let (life_id, _) = insert_goal(&conn, "成为更稳的人", "长期方向必须写清楚为什么重要", "a6", "life", None, 2026)
        .unwrap();
    let (year_id, _) = insert_goal(
        &conn,
        "今年把身体练回来",
        "健康是后面所有目标的底座所以必须先写在这里",
        "a1",
        "year",
        Some(&life_id),
        2026,
    )
    .unwrap();
    let orphan = insert_goal(
        &conn,
        "独立年度目标",
        "兼容旧数据年度可以不挂人生目标",
        "a2",
        "year",
        None,
        2026,
    );
    assert!(orphan.is_ok());
    let bad_life = insert_goal(
        &conn,
        "不能挂上级",
        "人生目标是根节点不能再往上挂",
        "a6",
        "life",
        Some(&year_id),
        2026,
    );
    assert!(bad_life.is_err());
}

#[test]
fn habit_must_match_goal_area() {
    let conn = conn();
    let (goal_id, _) = insert_goal(&conn, "年度阅读", "成长维度需要持续输入", "a6", "year", None, 2026).unwrap();
    assert!(insert_habit(&conn, "每天阅读", "a6", "daily", 7, Some(&goal_id)).is_ok());
    assert!(insert_habit(&conn, "错维习惯", "a1", "daily", 7, Some(&goal_id)).is_err());
}

#[test]
fn delete_goal_unlinks_habit() {
    let conn = conn();
    let (goal_id, _) = insert_goal(&conn, "可删目标", "没有子目标和任务时应该能删", "a1", "year", None, 2026).unwrap();
    insert_habit(&conn, "喝水", "a1", "daily", 7, Some(&goal_id)).unwrap();
    delete_goal_record(&conn, &goal_id).unwrap();
    let left: i64 = conn
        .query_row("SELECT COUNT(1) FROM habits WHERE title = '喝水'", [], |row| row.get(0))
        .unwrap();
    assert_eq!(left, 1);
    let linked: Option<String> = conn
        .query_row("SELECT goal_id FROM habits WHERE title = '喝水'", [], |row| row.get(0))
        .unwrap();
    assert!(linked.is_none());
}

#[test]
fn week_task_and_ics_export() {
    let conn = conn();
    let (year_id, _) = insert_goal(&conn, "年度目标", "拆到本周才能执行", "a2", "year", None, 2026).unwrap();
    let (q_id, _) = insert_goal(&conn, "季度目标", "拆到本周才能执行", "a2", "quarter", Some(&year_id), 2026).unwrap();
    let (m_id, _) = insert_goal(&conn, "月度目标", "拆到本周才能执行", "a2", "month", Some(&q_id), 2026).unwrap();
    let (w_id, _) = insert_goal(&conn, "本周目标", "拆到本周才能执行", "a2", "week", Some(&m_id), 2026).unwrap();
    let day = format_date(today());
    insert_task(&conn, "完成审查", &day, Some(&w_id), Some(&day), true).unwrap();
    insert_habit(&conn, "早起", "a1", "daily", 7, None).unwrap();
    let ics = build_ics(&conn).unwrap();
    assert!(ics.contains("BEGIN:VCALENDAR"));
    assert!(ics.contains("任务：完成审查"));
    assert!(ics.contains("习惯：早起"));
}

#[test]
fn weekly_monthly_yearly_reviews() {
    let conn = conn();
    let today = today();
    let week = format_date(week_start(today, 1));
    let month = format!("{:04}-{:02}", today.year(), today.month());
    let year = format!("{:04}", today.year());

    let weekly = weekly_view(&conn, &week).unwrap();
    assert_eq!(weekly.status, "none");
    let monthly = monthly_view(&conn, &month).unwrap();
    assert_eq!(monthly.status, "none");
    let yearly = yearly_view(&conn, &year).unwrap();
    assert_eq!(yearly.status, "none");

    conn.execute(
        "INSERT INTO weekly_reviews (id, week_start, q_went_well, q_not_well, q_reason, q_next_week, satisfaction, status)
         VALUES ('wr1', ?1, '好', '一般', '原因', '下周', 8, 'submitted')",
        params![week],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO monthly_reviews (id, month, q_progress, q_insight, q_next_month, status)
         VALUES ('mr1', ?1, '推进', '收获', '改变', 'draft')",
        params![month],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO yearly_reviews (id, year, q_progress, q_insight, q_next_year, status)
         VALUES ('yr1', ?1, '还行', '进步了', '继续进步', 'draft')",
        params![year],
    )
    .unwrap();

    assert_eq!(weekly_view(&conn, &week).unwrap().status, "submitted");
    assert_eq!(monthly_view(&conn, &month).unwrap().status, "draft");
    let yearly = yearly_view(&conn, &year).unwrap();
    assert_eq!(yearly.status, "draft");
    assert_eq!(yearly.q_progress, "还行");
}

#[test]
fn settings_themes_and_json_backup_roundtrip() {
    let conn = conn();
    settings::upsert(&conn, "theme", "moss").unwrap();
    let loaded = settings::load(&conn).unwrap();
    assert_eq!(loaded.theme, "moss");
    assert!(loaded.reminder_enabled);
    assert_eq!(loaded.reminder_time, "09:00");

    insert_goal(&conn, "人生方向", "完整版备份必须带上人生目标", "a6", "life", None, 2026).unwrap();
    let json = backup::export_json(&conn).unwrap();
    assert!(json.contains("\"schema_version\": 3"));
    assert!(json.contains("\"life\""));

    let dir = std::env::temp_dir().join(format!("life-planner-test-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    backup::import_json(&conn, &dir, &json).unwrap();
    let n: i64 = conn
        .query_row("SELECT COUNT(1) FROM goals WHERE level = 'life'", [], |row| row.get(0))
        .unwrap();
    assert_eq!(n, 1);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn archive_and_restore_area() {
    let conn = conn();
    conn.execute(
        "INSERT INTO areas (id, name, color, sort_order, is_archived) VALUES ('ax', '临时维', '#4b5563', 99, 1)",
        [],
    )
    .unwrap();
    let archived: i64 = conn
        .query_row("SELECT COUNT(1) FROM areas WHERE is_archived = 1", [], |row| row.get(0))
        .unwrap();
    assert!(archived >= 1);
    conn.execute("UPDATE areas SET is_archived = 0 WHERE id = 'ax'", []).unwrap();
    let active: i64 = conn
        .query_row("SELECT COUNT(1) FROM areas WHERE is_archived = 0", [], |row| row.get(0))
        .unwrap();
    assert!(active >= 9);
}

#[test]
fn onboarding_payload_accepts_camel_case() {
    let raw = r#"{
        "scores": [{"id":"a1","score":8}],
        "title": "年度目标",
        "why": "必须写为什么重要这句话够长了",
        "areaId": "a1",
        "quarterTitle": "季度",
        "monthTitle": "月度",
        "weekTitle": "本周",
        "taskTitle": "任务",
        "habitTitle": "习惯",
        "habitFrequency": "daily",
        "habitAreaId": "a1"
    }"#;
    let parsed: crate::commands::onboarding::OnboardingPayload = serde_json::from_str(raw).unwrap();
    assert_eq!(parsed.area_id.as_deref(), Some("a1"));
    assert_eq!(parsed.habit_frequency.as_deref(), Some("daily"));
}

#[test]
fn notes_timeline_reviews_and_backup_v3() {
    let conn = conn();
    let day = format_date(today());
    let (goal_id, _) = insert_goal(
        &conn,
        "把随记写进完整版",
        "随记要能挂到目标上并且出现在复盘里",
        "a6",
        "year",
        None,
        i64::from(today().year()),
    )
    .unwrap();
    crate::commands::notes::insert_note(
        &conn,
        &day,
        "insight",
        "今天把树洞做成了时间线",
        Some("a6"),
        Some(&goal_id),
    )
    .unwrap();
    let week = format_date(week_start(today(), 1));
    let weekly = weekly_view(&conn, &week).unwrap();
    assert_eq!(weekly.notes.len(), 1);
    assert_eq!(weekly.notes[0].kind, "insight");

    let json = backup::export_json(&conn).unwrap();
    assert!(json.contains("\"schema_version\": 3"));
    assert!(json.contains("今天把树洞做成了时间线"));

    delete_goal_record(&conn, &goal_id).unwrap();
    let left: Option<String> = conn
        .query_row(
            "SELECT goal_id FROM notes LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(left.is_none());
}

#[test]
fn notes_reject_invalid_and_paginate() {
    let conn = conn();
    let day = format_date(today());
    let future = format_date(domain::add_days(today(), 1));
    assert!(crate::commands::notes::insert_note(&conn, &future, "insight", "明天的话", None, None).is_err());
    assert!(crate::commands::notes::insert_note(&conn, &day, "insight", "   ", None, None).is_err());
    assert!(crate::commands::notes::insert_note(&conn, &day, "poem", "不支持的类型", None, None).is_err());
    assert!(
        crate::commands::notes::insert_note(&conn, &day, "diary", "维度和目标对不上", Some("a1"), Some("missing"))
            .is_err()
    );

    let (goal_id, _) = insert_goal(
        &conn,
        "身体先稳住",
        "健康是后面所有目标的底座所以必须先写在这里",
        "a1",
        "year",
        None,
        i64::from(today().year()),
    )
    .unwrap();
    assert!(
        crate::commands::notes::insert_note(&conn, &day, "diary", "维度和目标对不上", Some("a2"), Some(&goal_id))
            .is_err()
    );
    let inherited = crate::commands::notes::insert_note(
        &conn,
        &day,
        "vent",
        "只挂目标时自动带上维度",
        None,
        Some(&goal_id),
    )
    .unwrap();
    assert_eq!(inherited.area_id.as_deref(), Some("a1"));
    assert_eq!(inherited.goal_title.as_deref(), Some("身体先稳住"));

    for i in 0..42i64 {
        let stamp = format!("2020-01-01 00:00:{:02}", i);
        conn.execute(
            "INSERT INTO notes (id, date, kind, body, area_id, goal_id, created_at, updated_at)
             VALUES (?1, ?2, 'insight', ?3, NULL, NULL, ?4, ?4)",
            rusqlite::params![
                format!("np{i:02}"),
                day,
                format!("分页用的随记 {i:02}"),
                stamp
            ],
        )
        .unwrap();
    }
    let (page, has_more) = crate::commands::notes::query_page(
        &conn, None, None, None, None, None, None, None, None,
    )
    .unwrap();
    assert_eq!(page.len(), 40);
    assert!(has_more);
    let last = page.last().unwrap();
    let (page2, _) = crate::commands::notes::query_page(
        &conn,
        None,
        None,
        None,
        None,
        None,
        Some(&last.date),
        Some(&last.created_at),
        Some(&last.id),
    )
    .unwrap();
    assert!(!page2.is_empty());
    assert!(page2.iter().all(|n| n.id != last.id));

    let found = crate::commands::notes::query_page(
        &conn,
        None,
        None,
        None,
        None,
        Some("自动带上维度"),
        None,
        None,
        None,
    )
    .unwrap();
    assert_eq!(found.0.len(), 1);

    let month = &day[..7];
    let monthly = monthly_view(&conn, month).unwrap();
    assert!(monthly.notes.iter().any(|n| n.id == inherited.id));
    let yearly = yearly_view(&conn, &day[..4]).unwrap();
    assert!(yearly.notes.iter().any(|n| n.id == inherited.id));

    let json = backup::export_json(&conn).unwrap();
    let mut doc: serde_json::Value = serde_json::from_str(&json).unwrap();
    doc["schema_version"] = serde_json::json!(1);
    doc["notes"] = serde_json::json!([]);
    let dir = std::env::temp_dir().join(format!("life-planner-notes-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    backup::import_json(&conn, &dir, &doc.to_string()).unwrap();
    let n: i64 = conn
        .query_row("SELECT COUNT(1) FROM notes", [], |row| row.get(0))
        .unwrap();
    assert_eq!(n, 0);
    let _ = std::fs::remove_dir_all(&dir);
}
