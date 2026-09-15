//! Global hotkey registration and the windows they summon.
//!
//! Two shortcuts, both user-configurable (stored in settings):
//! - add-entry popup (default Alt+Shift+J)
//! - dashboard       (default Alt+Shift+D)
//!
//! The popup is a small frameless always-on-top window created on demand;
//! the dashboard is the main window, shown and focused.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const DEFAULT_ADD_SHORTCUT: &str = "Alt+Shift+J";
pub const DEFAULT_DASHBOARD_SHORTCUT: &str = "Alt+Shift+D";

pub fn show_dashboard(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub fn show_popup(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("popup") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
        return;
    }
    let result =
        WebviewWindowBuilder::new(app, "popup", WebviewUrl::App("index.html#/popup".into()))
            .title("Add Application")
            .inner_size(440.0, 640.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .center()
            .focused(true)
            .build();
    if let Ok(win) = result {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
    } else if let Err(e) = result {
        eprintln!("failed to create popup window: {e}");
    }
}

/// (Re-)register both global shortcuts. Called at startup and again
/// whenever the user changes a hotkey in settings.
pub fn register(app: &AppHandle, add: &str, dashboard: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;

    gs.on_shortcut(add, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            show_popup(app);
        }
    })
    .map_err(|e| format!("could not register add-entry hotkey {add}: {e}"))?;

    gs.on_shortcut(dashboard, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            show_dashboard(app);
        }
    })
    .map_err(|e| format!("could not register dashboard hotkey {dashboard}: {e}"))?;

    Ok(())
}

/// Tauri command so the settings screen can apply new hotkeys immediately.
#[tauri::command]
pub fn apply_hotkeys(app: AppHandle, add: String, dashboard: String) -> Result<(), String> {
    register(&app, &add, &dashboard)
}

/// Open the add-entry popup from the UI (same window the hotkey summons).
#[tauri::command]
pub fn open_popup(app: AppHandle) {
    show_popup(&app);
}

/// Close the popup window (Esc, or after a successful save).
#[tauri::command]
pub fn close_popup(app: AppHandle) {
    if let Some(win) = app.get_webview_window("popup") {
        let _ = win.close();
    }
}
