use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Window, WindowEvent};

use crate::db::{self, Db};
use crate::error::{AppError, SETTINGS_INVALID};

pub const TRAY_ID: &str = "main";
pub const CLOSE_ASKED: &str = "close-asked";

fn close_behavior_of(app: &AppHandle) -> String {
    app.try_state::<Db>()
        .and_then(|db| {
            db::with_conn(&db, |conn| {
                Ok(crate::commands::settings::load(conn)?.close_behavior)
            })
            .ok()
        })
        .unwrap_or_else(|| "ask".into())
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    api.prevent_close();
    match close_behavior_of(window.app_handle()).as_str() {
        "quit" => window.app_handle().exit(0),
        "tray" => {
            let _ = hide_to_tray(window.app_handle());
        }
        _ => {
            let _ = window.emit(CLOSE_ASKED, ());
        }
    }
}

fn ensure_tray(app: &AppHandle) -> Result<(), AppError> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    let show = MenuItem::with_id(app, "show", "打开", true, None::<&str>)
        .map_err(|e| AppError::new(SETTINGS_INVALID, e.to_string()))?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|e| AppError::new(SETTINGS_INVALID, e.to_string()))?;
    let menu = Menu::with_items(app, &[&show, &quit])
        .map_err(|e| AppError::new(SETTINGS_INVALID, e.to_string()))?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| AppError::new(SETTINGS_INVALID, "缺少托盘图标"))?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("人生规划")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = restore_main(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = restore_main(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e| AppError::new(SETTINGS_INVALID, e.to_string()))?;
    Ok(())
}

pub fn hide_to_tray(app: &AppHandle) -> Result<(), AppError> {
    ensure_tray(app)?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(true);
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(50));
        let app_for_window = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = app_for_window.get_webview_window("main") {
                let _ = window.set_skip_taskbar(true);
                let _ = window.hide();
            }
        });
    });
    Ok(())
}

pub fn restore_main(app: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(false);
        let _ = window.unminimize();
        window
            .show()
            .map_err(|e| AppError::new(SETTINGS_INVALID, e.to_string()))?;
        let _ = window.set_focus();
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(false);
    }
    Ok(())
}

#[tauri::command]
pub fn hide_to_tray_cmd(app: AppHandle) -> Result<(), AppError> {
    hide_to_tray(&app)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
