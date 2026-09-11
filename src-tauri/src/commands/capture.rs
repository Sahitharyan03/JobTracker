use crate::capture::{CaptureState, CaptureSummary, SharedCaptureState};
use crate::db::Db;
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_latest_job_capture(
    state: State<SharedCaptureState>,
) -> Result<Option<CaptureSummary>, String> {
    let lock = state.lock().map_err(|e| e.to_string())?;
    if let Some(job) = &lock.latest {
        let is_stale = lock.is_stale();
        let fields_count = CaptureState::count_fields(job);
        Ok(Some(CaptureSummary {
            job: job.clone(),
            fields_count,
            is_stale,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn clear_latest_job_capture(state: State<SharedCaptureState>) -> Result<(), String> {
    let mut lock = state.lock().map_err(|e| e.to_string())?;
    lock.latest = None;
    lock.received_at = None;
    Ok(())
}

#[tauri::command]
pub fn get_extension_token(db: State<Db>) -> Result<String, String> {
    let guard = db.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("database not initialized")?;

    let existing: Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = 'extension_token'",
        [],
        |r| r.get(0),
    );

    match existing {
        Ok(token) if !token.trim().is_empty() => Ok(token),
        _ => {
            let new_token = generate_token();
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('extension_token', ?1)",
                params![new_token],
            )
            .map_err(|e| e.to_string())?;
            Ok(new_token)
        }
    }
}

#[tauri::command]
pub fn generate_new_extension_token(db: State<Db>) -> Result<String, String> {
    let guard = db.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("database not initialized")?;

    let new_token = generate_token();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('extension_token', ?1)",
        params![new_token],
    )
    .map_err(|e| e.to_string())?;
    Ok(new_token)
}

#[tauri::command]
pub fn get_or_export_extension_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let ext_dir = app_data.join("companion-extension");
    std::fs::create_dir_all(&ext_dir).map_err(|e| e.to_string())?;
    let icons_dir = ext_dir.join("icons");
    std::fs::create_dir_all(&icons_dir).map_err(|e| e.to_string())?;

    // Write static embedded extension files so user has them automatically
    std::fs::write(
        ext_dir.join("manifest.json"),
        include_str!("../../../browser-extension/dist/manifest.json"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        ext_dir.join("background.js"),
        include_str!("../../../browser-extension/dist/background.js"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        ext_dir.join("content.js"),
        include_str!("../../../browser-extension/dist/content.js"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        ext_dir.join("popup.html"),
        include_str!("../../../browser-extension/dist/popup.html"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        ext_dir.join("popup.css"),
        include_str!("../../../browser-extension/dist/popup.css"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        ext_dir.join("popup.js"),
        include_str!("../../../browser-extension/dist/popup.js"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        icons_dir.join("icon-16.png"),
        include_bytes!("../../../browser-extension/dist/icons/icon-16.png"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        icons_dir.join("icon-48.png"),
        include_bytes!("../../../browser-extension/dist/icons/icon-48.png"),
    )
    .map_err(|e| e.to_string())?;
    std::fs::write(
        icons_dir.join("icon-128.png"),
        include_bytes!("../../../browser-extension/dist/icons/icon-128.png"),
    )
    .map_err(|e| e.to_string())?;

    Ok(ext_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_extension_folder(app: tauri::AppHandle) -> Result<String, String> {
    let path = get_or_export_extension_dir(app)?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(path)
}

fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("jt_{nanos:x}")
}
