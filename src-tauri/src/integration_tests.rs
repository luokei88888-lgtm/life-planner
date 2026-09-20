use chrono::Datelike;
use rusqlite::params;

use crate::backup;
use crate::commands::calendar::build_ics;
use crate::commands::goals::{delete_goal_record, insert_goal, list_all};
use crate::commands::habits::insert_habit;
use crate::commands::areas::{apply_scores, AreaScoreInput};
use crate::commands::onboarding::{complete_onboarding_record, OnboardingPayload};
use crate::commands::reviews::{
    apply_weekly_next_tasks, monthly_view, review_list, skip_weekly_review_record,
    submit_monthly_review_record, submit_yearly_review_record, weekly_view, yearly_view,
};
use crate::commands::settings;
use crate::commands::tasks::{carry_unfinished_from, insert_task};
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
fn review_pending_does_not_backfill_before_start() {
    let conn = conn();
    settings::upsert(&conn, "started_on", &format_date(today())).unwrap();
    let list = review_list(&conn).unwrap();
    assert!(
        list.pending.is_empty(),
        "new start should not owe past reviews: {:?}",
        list.pending.iter().map(|p| format!("{}:{}", p.kind, p.key)).collect::<Vec<_>>()
    );
}

#[test]
fn review_pending_includes_closed_week_after_start() {
    let conn = conn();
    let week_on = 1;
    let this_week = week_start(today(), week_on);
    let prev_week = this_week - chrono::Duration::days(7);
    settings::upsert(&conn, "started_on", &format_date(prev_week)).unwrap();
    let list = review_list(&conn).unwrap();
    assert!(
        list.pending.iter().any(|p| p.kind == "weekly" && p.key == format_date(prev_week)),
        "expected previous week in pending: {:?}",
        list.pending.iter().map(|p| format!("{}:{}", p.kind, p.key)).collect::<Vec<_>>()
    );
    assert_eq!(
        list.pending.iter().filter(|p| p.kind == "weekly").count(),
        1
    );
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
fn week_goal_can_hang_on_year() {
    let conn = conn();
    let (year_id, _) = insert_goal(
        &conn,
        "今年把身体练回来",
        "健康是后面所有目标的底座所以必须先写在这里",
        "a1",
        "year",
        None,
        2026,
    )
    .unwrap();
    assert!(insert_goal(&conn, "本周运动三次", "从年度直接落到本周执行", "a1", "week", Some(&year_id), 2026).is_ok());
    assert!(insert_goal(&conn, "本月先恢复体能", "月度可以挂在年度下", "a1", "month", Some(&year_id), 2026).is_ok());
    let life_id = insert_goal(&conn, "成为更稳的人", "长期方向必须写清楚为什么重要", "a6", "life", None, 2026)
        .unwrap()
        .0;
    assert!(insert_goal(&conn, "不能挂人生", "周目标不能直接挂人生目标", "a6", "week", Some(&life_id), 2026).is_err());
    assert!(insert_goal(&conn, "错维周目标", "下级必须和上级在同一维度所以这里应该失败", "a2", "week", Some(&year_id), 2026).is_err());
}

#[test]
fn habit_must_match_goal_area() {
    let conn = conn();
    let (goal_id, _) = insert_goal(&conn, "年度阅读", "成长维度需要持续输入", "a6", "year", None, 2026).unwrap();
    assert!(insert_habit(&conn, "每天阅读", "a6", "daily", 7, Some(&goal_id), "form").is_ok());
    assert!(insert_habit(&conn, "错维习惯", "a1", "daily", 7, Some(&goal_id), "form").is_err());
}

#[test]
fn habit_kind_must_be_form_or_break() {
    let conn = conn();
    assert!(insert_habit(&conn, "早睡", "a1", "daily", 7, None, "form").is_ok());
    assert!(insert_habit(&conn, "少刷手机", "a1", "daily", 7, None, "break").is_ok());
    let kinds: Vec<String> = {
        let mut stmt = conn.prepare("SELECT title, kind FROM habits ORDER BY title").unwrap();
        stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .unwrap()
            .map(|r| {
                let (title, kind) = r.unwrap();
                format!("{title}:{kind}")
            })
            .collect()
    };
    assert!(kinds.iter().any(|v| v == "早睡:form"));
    assert!(kinds.iter().any(|v| v == "少刷手机:break"));
    assert!(domain::normalize_habit_kind(Some("other")).is_err());
    assert_eq!(domain::normalize_habit_kind(None).unwrap(), "form");
}

#[test]
fn delete_goal_unlinks_habit() {
    let conn = conn();
    let (goal_id, _) = insert_goal(&conn, "可删目标", "没有子目标和任务时应该能删", "a1", "year", None, 2026).unwrap();
    insert_habit(&conn, "喝水", "a1", "daily", 7, Some(&goal_id), "form").unwrap();
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
    insert_habit(&conn, "早起", "a1", "daily", 7, None, "form").unwrap();
    insert_habit(&conn, "已打卡的习惯", "a1", "daily", 7, None, "form").unwrap();
    let done_id: String = conn
        .query_row("SELECT id FROM habits WHERE title = '已打卡的习惯'", [], |row| row.get(0))
        .unwrap();
    conn.execute(
        "INSERT INTO habit_logs (habit_id, date, done) VALUES (?1, ?2, 1)",
        params![done_id, day],
    )
    .unwrap();
    let ics = build_ics(&conn).unwrap();
    assert!(ics.contains("BEGIN:VCALENDAR"));
    assert!(ics.contains("任务：完成审查"));
    assert!(ics.contains("习惯：早起"));
    assert!(!ics.contains("RRULE"));
    assert!(!ics.contains("已打卡的习惯"));
}

#[test]
fn week_task_can_hang_on_covering_year_or_month() {
    let conn = conn();
    let year = today().year() as i64;
    let (year_id, _) = insert_goal(&conn, "今年推进", "覆盖本周", "a2", "year", None, year).unwrap();
    let (q_id, _) = insert_goal(&conn, "本季推进", "覆盖本周", "a2", "quarter", Some(&year_id), year).unwrap();
    let (m_id, _) = insert_goal(&conn, "本月推进", "覆盖本周", "a2", "month", Some(&q_id), year).unwrap();
    let day = format_date(today());
    insert_task(&conn, "挂年目标", &day, Some(&year_id), None, false).unwrap();
    insert_task(&conn, "挂月目标", &day, Some(&m_id), None, false).unwrap();
    let linked: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT title, goal_id FROM tasks ORDER BY title")
            .unwrap();
        stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .map(|(title, gid)| format!("{title}:{gid}"))
            .collect()
    };
    assert!(linked.iter().any(|row| row == &format!("挂年目标:{year_id}")));
    assert!(linked.iter().any(|row| row == &format!("挂月目标:{m_id}")));
}

#[test]
fn week_task_rejects_life_paused_and_uncovered_period() {
    let conn = conn();
    let year = today().year() as i64;
    let (life_id, _) = insert_goal(&conn, "人生方向", "太大不能直接执行", "a2", "life", None, year).unwrap();
    let (old_year, _) = insert_goal(&conn, "去年的事", "不覆盖本周", "a2", "year", None, 2020).unwrap();
    let (year_id, _) = insert_goal(&conn, "今年推进", "覆盖本周", "a2", "year", None, year).unwrap();
    let (q_id, _) = insert_goal(&conn, "本季推进", "覆盖本周", "a2", "quarter", Some(&year_id), year).unwrap();
    let (m_id, _) = insert_goal(&conn, "本月推进", "覆盖本周", "a2", "month", Some(&q_id), year).unwrap();
    let (w_id, _) = insert_goal(&conn, "本周目标", "仅本周", "a2", "week", Some(&m_id), year).unwrap();
    conn.execute("UPDATE goals SET status = 'paused' WHERE id = ?1", [&year_id])
        .unwrap();
    let day = format_date(today());
    let next_week = format_date(domain::add_days(week_start(today(), 1), 7));
    assert!(insert_task(&conn, "挂人生", &day, Some(&life_id), None, false).is_err());
    assert!(insert_task(&conn, "挂去年", &day, Some(&old_year), None, false).is_err());
    assert!(insert_task(&conn, "挂搁置年目标", &day, Some(&year_id), None, false).is_err());
    assert!(insert_task(&conn, "错周", &next_week, Some(&w_id), None, false).is_err());
    insert_task(&conn, "不挂也可以", &day, None, None, false).unwrap();
}

#[test]
fn skip_weekly_review_locks_tasks() {
    let conn = conn();
    let day = format_date(today());
    insert_task(&conn, "跳过前还能加", &day, None, None, false).unwrap();
    let week = format_date(week_start(today(), 1));
    skip_weekly_review_record(&conn, &week).unwrap();
    assert!(insert_task(&conn, "跳过后不能加", &day, None, None, false).is_err());
}

#[test]
fn goal_week_task_counts_do_not_change_progress() {
    let conn = conn();
    let year = today().year() as i64;
    let (year_id, _) = insert_goal(&conn, "今年推进", "进度仍手填", "a2", "year", None, year).unwrap();
    conn.execute("UPDATE goals SET progress = 30 WHERE id = ?1", [&year_id])
        .unwrap();
    let day = format_date(today());
    insert_task(&conn, "本周做完", &day, Some(&year_id), None, false).unwrap();
    insert_task(&conn, "本周还没做", &day, Some(&year_id), None, false).unwrap();
    let next = format_date(week_start(today(), 1) + chrono::Duration::days(7));
    insert_task(&conn, "下周才做", &next, Some(&year_id), None, false).unwrap();
    conn.execute(
        "UPDATE tasks SET status = 'done' WHERE title = '本周做完'",
        [],
    )
    .unwrap();
    let goal = list_all(&conn)
        .unwrap()
        .into_iter()
        .find(|g| g.id == year_id)
        .expect("year goal");
    assert_eq!(goal.progress, 30);
    assert_eq!(goal.task_count, 3);
    assert_eq!(goal.week_task_total, 2);
    assert_eq!(goal.week_task_done, 1);
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
fn onboarding_hangs_first_task_on_year_without_week_goal() {
    let conn = conn();
    let payload: OnboardingPayload = serde_json::from_str(
        r#"{
        "scores": [{"id":"a1","score":6}],
        "title": "今年把身体练回来",
        "why": "必须写为什么重要这句话够长了",
        "areaId": "a1",
        "taskTitle": "明早去跑3公里",
        "habitTitle": "睡前阅读",
        "habitFrequency": "daily",
        "habitAreaId": "a1"
    }"#,
    )
    .unwrap();
    complete_onboarding_record(&conn, payload).unwrap();

    let weeks: i64 = conn
        .query_row("SELECT COUNT(1) FROM goals WHERE level = 'week'", [], |row| row.get(0))
        .unwrap();
    assert_eq!(weeks, 0);

    let (goal_level, goal_title): (String, String) = conn
        .query_row(
            "SELECT g.level, g.title
             FROM tasks t JOIN goals g ON g.id = t.goal_id
             WHERE t.title = '明早去跑3公里'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(goal_level, "year");
    assert_eq!(goal_title, "今年把身体练回来");

    let habit_goal: String = conn
        .query_row(
            "SELECT g.title FROM habits h JOIN goals g ON g.id = h.goal_id
             WHERE h.title = '睡前阅读'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(habit_goal, "今年把身体练回来");
}

#[test]
fn onboarding_still_hangs_task_on_week_when_week_title_sent() {
    let conn = conn();
    let payload: OnboardingPayload = serde_json::from_str(
        r#"{
        "scores": [{"id":"a2","score":6}],
        "title": "另外一个年目标也要够长",
        "why": "必须写为什么重要这句话够长了",
        "areaId": "a2",
        "weekTitle": "本周先跑三次",
        "taskTitle": "挂在周目标上的任务"
    }"#,
    )
    .unwrap();
    complete_onboarding_record(&conn, payload).unwrap();
    let week_level: String = conn
        .query_row(
            "SELECT g.level FROM tasks t JOIN goals g ON g.id = t.goal_id
             WHERE t.title = '挂在周目标上的任务'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(week_level, "week");
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

#[test]
fn monthly_submit_applies_scores_then_snapshots() {
    let conn = conn();
    apply_scores(
        &conn,
        &[AreaScoreInput {
            id: "a1".into(),
            score: 3,
        }],
    )
    .unwrap();
    let month = &format_date(today())[..7];
    let view = submit_monthly_review_record(
        &conn,
        month,
        "推进还可以",
        "发现节奏不对",
        "下月少开新坑",
        Some(&[AreaScoreInput {
            id: "a1".into(),
            score: 7,
        }]),
    )
    .unwrap();
    assert_eq!(view.status, "submitted");
    let health = view
        .snapshot
        .area_scores
        .iter()
        .find(|a| a.id == "a1")
        .expect("health area");
    assert_eq!(health.score, 7);
    let score: i64 = conn
        .query_row("SELECT score FROM areas WHERE id = 'a1'", [], |row| row.get(0))
        .unwrap();
    assert_eq!(score, 7);
}

#[test]
fn monthly_submit_without_scores_keeps_radar() {
    let conn = conn();
    apply_scores(
        &conn,
        &[AreaScoreInput {
            id: "a2".into(),
            score: 9,
        }],
    )
    .unwrap();
    let month = &format_date(today())[..7];
    let view = submit_monthly_review_record(
        &conn,
        month,
        "推进还可以",
        "发现节奏不对",
        "下月少开新坑",
        None,
    )
    .unwrap();
    let career = view
        .snapshot
        .area_scores
        .iter()
        .find(|a| a.id == "a2")
        .expect("career area");
    assert_eq!(career.score, 9);
    let score: i64 = conn
        .query_row("SELECT score FROM areas WHERE id = 'a2'", [], |row| row.get(0))
        .unwrap();
    assert_eq!(score, 9);
}

#[test]
fn month_snapshot_groups_tasks_on_parent_goals_and_freezes() {
    let conn = conn();
    let year = today().year() as i64;
    let (year_id, _) = insert_goal(&conn, "今年推进", "年目标要看见执行", "a2", "year", None, year).unwrap();
    let (q_id, _) = insert_goal(&conn, "本季推进", "季目标也算上级", "a2", "quarter", Some(&year_id), year).unwrap();
    let (m_id, _) = insert_goal(&conn, "本月推进", "月目标本月执行", "a2", "month", Some(&q_id), year).unwrap();
    let (w_id, _) = insert_goal(&conn, "本周目标", "周目标不算进月汇总", "a2", "week", Some(&m_id), year).unwrap();
    let day = format_date(today());
    insert_task(&conn, "年目标做成", &day, Some(&year_id), None, false).unwrap();
    insert_task(&conn, "年目标没做", &day, Some(&year_id), None, false).unwrap();
    insert_task(&conn, "月目标做成", &day, Some(&m_id), None, false).unwrap();
    insert_task(&conn, "周目标做成", &day, Some(&w_id), None, false).unwrap();
    insert_task(&conn, "不挂的不算", &day, None, None, false).unwrap();
    conn.execute(
        "UPDATE tasks SET status = 'done' WHERE title IN ('年目标做成', '月目标做成', '周目标做成')",
        [],
    )
    .unwrap();
    let month = &format_date(today())[..7];
    let live = monthly_view(&conn, month).unwrap();
    let rows = &live.snapshot.goal_tasks;
    assert_eq!(rows.iter().find(|g| g.id == year_id).map(|g| (g.done, g.total)), Some((1, 2)));
    assert_eq!(rows.iter().find(|g| g.id == m_id).map(|g| (g.done, g.total)), Some((1, 1)));
    assert!(rows.iter().all(|g| g.id != w_id));
    let submitted = submit_monthly_review_record(
        &conn,
        month,
        "推进还可以",
        "发现节奏不对",
        "下月少开新坑",
        None,
    )
    .unwrap();
    assert_eq!(submitted.snapshot.goal_tasks.len(), rows.len());
    insert_task(&conn, "提交后才写的", &day, Some(&year_id), None, false).unwrap();
    let frozen = monthly_view(&conn, month).unwrap();
    let year_row = frozen
        .snapshot
        .goal_tasks
        .iter()
        .find(|g| g.id == year_id)
        .expect("year row");
    assert_eq!((year_row.done, year_row.total), (1, 2));
}

#[test]
fn year_snapshot_groups_tasks_on_parent_goals() {
    let conn = conn();
    let year_n = today().year() as i64;
    let (year_id, _) = insert_goal(&conn, "今年推进", "年复盘要看见执行", "a2", "year", None, year_n).unwrap();
    let day = format_date(today());
    insert_task(&conn, "年做成", &day, Some(&year_id), None, false).unwrap();
    insert_task(&conn, "年没做", &day, Some(&year_id), None, false).unwrap();
    conn.execute("UPDATE tasks SET status = 'done' WHERE title = '年做成'", [])
        .unwrap();
    let view = yearly_view(&conn, &format!("{year_n:04}")).unwrap();
    let row = view
        .snapshot
        .goal_tasks
        .iter()
        .find(|g| g.id == year_id)
        .expect("year row");
    assert_eq!((row.done, row.total), (1, 2));
}

fn submitted_week(conn: &rusqlite::Connection) -> String {
    let week = format_date(week_start(today(), 1));
    conn.execute(
        "INSERT INTO weekly_reviews (id, week_start, q_went_well, q_not_well, q_reason, q_next_week, satisfaction, status, submitted_at)
         VALUES ('wr-next', ?1, '好', '一般', '原因', '少开会', 8, 'submitted', datetime('now'))",
        params![week],
    )
    .unwrap();
    week
}

#[test]
fn weekly_submit_can_create_unlinked_next_week_tasks_once() {
    let conn = conn();
    let week = submitted_week(&conn);
    let next = format_date(week_start(today(), 1) + chrono::Duration::days(7));
    let view = apply_weekly_next_tasks(&conn, &week, &["少开会".into(), "早睡".into()], false).unwrap();
    assert!(view.next_tasks_created);
    let titles: Vec<String> = conn
        .prepare("SELECT title FROM tasks WHERE week_start = ?1 ORDER BY sort_order")
        .unwrap()
        .query_map([&next], |row| row.get(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(titles, vec!["少开会".to_string(), "早睡".to_string()]);
    let linked: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM tasks WHERE week_start = ?1 AND goal_id IS NOT NULL",
            [&next],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(linked, 0);
    let second = apply_weekly_next_tasks(&conn, &week, &["再来一条".into()], false);
    assert_eq!(
        second.err().map(|e| e.code),
        Some(crate::error::REVIEW_NEXT_TASKS_DONE)
    );
}

#[test]
fn weekly_next_tasks_empty_consumes_and_draft_cannot_apply() {
    let conn = conn();
    let week = submitted_week(&conn);
    apply_weekly_next_tasks(&conn, &week, &[], false).unwrap();
    let n: i64 = conn
        .query_row("SELECT COUNT(1) FROM tasks", [], |row| row.get(0))
        .unwrap();
    assert_eq!(n, 0);
    assert!(weekly_view(&conn, &week).unwrap().next_tasks_created);

    let draft = format_date(week_start(today(), 1) - chrono::Duration::days(7));
    conn.execute(
        "INSERT INTO weekly_reviews (id, week_start, q_next_week, status)
         VALUES ('wr-draft', ?1, '草稿里的打算', 'draft')",
        params![draft],
    )
    .unwrap();
    let draft_err = apply_weekly_next_tasks(&conn, &draft, &["不该出现".into()], false);
    assert_eq!(
        draft_err.err().map(|e| e.code),
        Some(crate::error::VALIDATION_FAILED)
    );
}

#[test]
fn weekly_closeout_can_carry_unfinished_and_add_new_tasks() {
    let conn = conn();
    let day = format_date(today());
    insert_task(&conn, "上周没做完", &day, None, None, false).unwrap();
    insert_task(&conn, "也没做完", &day, None, None, false).unwrap();
    let week = submitted_week(&conn);
    let view = weekly_view(&conn, &week).unwrap();
    assert_eq!(view.unfinished.len(), 2);
    apply_weekly_next_tasks(&conn, &week, &["新承诺".into()], true).unwrap();
    let next = format_date(week_start(today(), 1) + chrono::Duration::days(7));
    let left: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM tasks WHERE week_start = ?1 AND status = 'todo'",
            [&week],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(left, 0);
    let titles: Vec<String> = conn
        .prepare("SELECT title FROM tasks WHERE week_start = ?1 ORDER BY carried_over_count DESC, title")
        .unwrap()
        .query_map([&next], |row| row.get(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(titles, vec!["上周没做完".to_string(), "也没做完".to_string(), "新承诺".to_string()]);
    let carried: i64 = conn
        .query_row(
            "SELECT carried_over_count FROM tasks WHERE title = '上周没做完'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(carried, 1);
    let new_carry: i64 = conn
        .query_row(
            "SELECT carried_over_count FROM tasks WHERE title = '新承诺'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(new_carry, 0);
}

#[test]
fn weekly_closeout_without_carry_allows_locked_week_fallback() {
    let conn = conn();
    let day = format_date(today());
    insert_task(&conn, "先留着", &day, None, None, false).unwrap();
    let week = submitted_week(&conn);
    apply_weekly_next_tasks(&conn, &week, &[], false).unwrap();
    let still: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM tasks WHERE week_start = ?1 AND title = '先留着'",
            [&week],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(still, 1);
    carry_unfinished_from(&conn, &week).unwrap();
    let next = format_date(week_start(today(), 1) + chrono::Duration::days(7));
    let dest: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM tasks WHERE week_start = ?1 AND title = '先留着'",
            [&next],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(dest, 1);
}

#[test]
fn factory_reset_wipes_data_reseeds_and_does_not_owe_past_reviews() {
    let conn = conn();
    insert_goal(
        &conn,
        "要被清空的目标",
        "恢复出厂后这条目标必须消失所以这句话写长一点",
        "a6",
        "year",
        None,
        i64::from(today().year()),
    )
    .unwrap();
    settings::upsert(&conn, "onboarded", "1").unwrap();
    settings::upsert(&conn, "theme", "moss").unwrap();
    settings::upsert(&conn, "started_on", "2020-01-01").unwrap();
    conn.execute(
        "INSERT INTO weekly_reviews (id, week_start, q_went_well, q_not_well, q_reason, q_next_week, satisfaction, status, submitted_at)
         VALUES ('wr-old', '2020-01-06', '好', '一般', '原因', '下周', 8, 'submitted', datetime('now'))",
        [],
    )
    .unwrap();
    let dir = std::env::temp_dir().join(format!("life-planner-reset-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&dir);
    backup::factory_reset(&conn, &dir).unwrap();
    let goals: i64 = conn
        .query_row("SELECT COUNT(1) FROM goals", [], |row| row.get(0))
        .unwrap();
    let reviews: i64 = conn
        .query_row("SELECT COUNT(1) FROM weekly_reviews", [], |row| row.get(0))
        .unwrap();
    let areas: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM areas WHERE is_archived = 0",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let loaded = settings::load(&conn).unwrap();
    assert_eq!(goals, 0);
    assert_eq!(reviews, 0);
    assert_eq!(areas, 8);
    assert!(!loaded.onboarded);
    assert_eq!(loaded.theme, "dark");
    assert!(loaded.started_on.is_none());
    let list = review_list(&conn).unwrap();
    assert!(
        !list.pending.iter().any(|p| p.key.starts_with("2020")),
        "factory reset must not recreate 2020 catch-up: {:?}",
        list.pending.iter().map(|p| format!("{}:{}", p.kind, p.key)).collect::<Vec<_>>()
    );
    let backups = std::fs::read_dir(backup::backups_dir(&dir)).unwrap();
    assert!(backups.filter_map(|e| e.ok()).any(|e| {
        e.path()
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s == "bak")
            .unwrap_or(false)
    }));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn yearly_submit_applies_scores_then_snapshots() {
    let conn = conn();
    apply_scores(
        &conn,
        &[AreaScoreInput {
            id: "a1".into(),
            score: 3,
        }],
    )
    .unwrap();
    let year = format!("{:04}", today().year());
    let view = submit_yearly_review_record(
        &conn,
        &year,
        "推进还可以",
        "发现节奏不对",
        "明年少开新坑",
        Some(&[AreaScoreInput {
            id: "a1".into(),
            score: 8,
        }]),
    )
    .unwrap();
    assert_eq!(view.status, "submitted");
    let health = view
        .snapshot
        .area_scores
        .iter()
        .find(|a| a.id == "a1")
        .expect("health area");
    assert_eq!(health.score, 8);
    let score: i64 = conn
        .query_row("SELECT score FROM areas WHERE id = 'a1'", [], |row| row.get(0))
        .unwrap();
    assert_eq!(score, 8);
}

#[test]
fn yearly_submit_without_scores_keeps_radar() {
    let conn = conn();
    apply_scores(
        &conn,
        &[AreaScoreInput {
            id: "a2".into(),
            score: 9,
        }],
    )
    .unwrap();
    let year = format!("{:04}", today().year());
    let view = submit_yearly_review_record(
        &conn,
        &year,
        "推进还可以",
        "发现节奏不对",
        "明年少开新坑",
        None,
    )
    .unwrap();
    let career = view
        .snapshot
        .area_scores
        .iter()
        .find(|a| a.id == "a2")
        .expect("career area");
    assert_eq!(career.score, 9);
    let score: i64 = conn
        .query_row("SELECT score FROM areas WHERE id = 'a2'", [], |row| row.get(0))
        .unwrap();
    assert_eq!(score, 9);
}

#[test]
fn habit_review_snapshot_includes_and_freezes_goal_title() {
    let conn = conn();
    let today = today();
    let year_n = today.year() as i64;
    let week = format_date(week_start(today, 1));
    let month = format!("{:04}-{:02}", today.year(), today.month());
    let year = format!("{:04}", today.year());
    let (goal_id, _) = insert_goal(&conn, "今年读完十二本书", "挂习惯", "a2", "year", None, year_n).unwrap();
    insert_habit(&conn, "每天阅读", "a2", "weekly", 5, Some(&goal_id), "form").unwrap();

    let weekly = weekly_view(&conn, &week).unwrap();
    let week_habit = weekly
        .snapshot
        .habits
        .iter()
        .find(|h| h.title == "每天阅读")
        .expect("week habit");
    assert_eq!(week_habit.goal_title.as_deref(), Some("今年读完十二本书"));

    let monthly = monthly_view(&conn, &month).unwrap();
    let month_habit = monthly
        .snapshot
        .habit_rates
        .iter()
        .find(|h| h.title == "每天阅读")
        .expect("month habit");
    assert_eq!(month_habit.goal_title.as_deref(), Some("今年读完十二本书"));

    let yearly = yearly_view(&conn, &year).unwrap();
    let year_habit = yearly
        .snapshot
        .habit_rates
        .iter()
        .find(|h| h.title == "每天阅读")
        .expect("year habit");
    assert_eq!(year_habit.goal_title.as_deref(), Some("今年读完十二本书"));

    let snap = serde_json::to_string(&weekly.snapshot).unwrap();
    conn.execute(
        "INSERT INTO weekly_reviews (id, week_start, summary_snapshot, q_went_well, q_not_well, q_reason, q_next_week, satisfaction, status, submitted_at)
         VALUES ('wr-habit', ?1, ?2, '好', '一般', '原因', '下周', 8, 'submitted', datetime('now'))",
        params![week, snap],
    )
    .unwrap();
    conn.execute("UPDATE habits SET goal_id = NULL WHERE title = '每天阅读'", [])
        .unwrap();
    conn.execute(
        "UPDATE goals SET title = '改过名的目标' WHERE id = ?1",
        params![goal_id],
    )
    .unwrap();

    let frozen = weekly_view(&conn, &week).unwrap();
    let frozen_habit = frozen
        .snapshot
        .habits
        .iter()
        .find(|h| h.title == "每天阅读")
        .expect("frozen habit");
    assert_eq!(frozen_habit.goal_title.as_deref(), Some("今年读完十二本书"));

    let live = monthly_view(&conn, &month).unwrap();
    let live_habit = live
        .snapshot
        .habit_rates
        .iter()
        .find(|h| h.title == "每天阅读")
        .expect("live month habit");
    assert!(live_habit.goal_title.is_none());

    conn.execute(
        "INSERT INTO weekly_reviews (id, week_start, summary_snapshot, q_went_well, q_not_well, q_reason, q_next_week, satisfaction, status)
         VALUES ('wr-old', '2001-01-01', ?1, '好', '一般', '原因', '下周', 7, 'submitted')",
        [r#"{"task_total":0,"task_done":0,"unlinked":0,"habits":[{"title":"旧习惯","rate":40}],"goals":[]}"#],
    )
    .unwrap();
    let old = weekly_view(&conn, "2001-01-01").unwrap();
    assert_eq!(old.snapshot.habits[0].title, "旧习惯");
    assert!(old.snapshot.habits[0].goal_title.is_none());
    assert_eq!(old.snapshot.habits[0].kind, "form");
}
