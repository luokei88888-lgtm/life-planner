mod backup;
mod commands;
mod db;
mod domain;
mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::init(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::health,
            commands::settings::get_settings,
            commands::settings::set_theme,
            commands::settings::set_week_starts_on,
            commands::settings::set_auto_backup,
            commands::settings::set_keep_backups,
            commands::settings::set_reminder_enabled,
            commands::settings::set_reminder_time,
            commands::settings::set_sync_dir,
            commands::settings::mark_started,
            commands::backup::backup_now,
            commands::backup::export_json,
            commands::backup::import_json,
            commands::backup::factory_reset,
            commands::calendar::pick_sync_dir,
            commands::calendar::sync_now,
            commands::calendar::export_ics,
            commands::calendar::fire_due_reminders,
            commands::areas::list_areas,
            commands::areas::list_archived_areas,
            commands::areas::create_area,
            commands::areas::update_area,
            commands::areas::archive_area,
            commands::areas::restore_area,
            commands::areas::score_areas,
            commands::goals::list_goals,
            commands::goals::list_goal_history,
            commands::goals::create_goal,
            commands::goals::update_goal,
            commands::goals::set_goal_progress,
            commands::goals::set_goal_status,
            commands::goals::delete_goal,
            commands::tasks::list_week_plan,
            commands::tasks::list_goal_tasks,
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::toggle_task,
            commands::tasks::toggle_focus,
            commands::tasks::delete_task,
            commands::tasks::carry_task,
            commands::tasks::carry_unfinished,
            commands::habits::list_habits,
            commands::habits::get_habit,
            commands::habits::create_habit,
            commands::habits::update_habit,
            commands::habits::set_habit_active,
            commands::habits::toggle_habit_log,
            commands::notes::list_notes,
            commands::notes::list_goal_timeline,
            commands::notes::create_note,
            commands::notes::update_note,
            commands::notes::delete_note,
            commands::reviews::list_reviews,
            commands::reviews::get_weekly_review,
            commands::reviews::save_weekly_draft,
            commands::reviews::submit_weekly_review,
            commands::reviews::skip_weekly_review,
            commands::reviews::apply_weekly_next_week_tasks,
            commands::reviews::get_monthly_review,
            commands::reviews::save_monthly_draft,
            commands::reviews::submit_monthly_review,
            commands::reviews::get_yearly_review,
            commands::reviews::save_yearly_draft,
            commands::reviews::submit_yearly_review,
            commands::onboarding::complete_onboarding,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod integration_tests;
