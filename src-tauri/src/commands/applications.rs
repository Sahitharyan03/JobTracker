//! Application-record commands: create, list, edit, and status changes.
//!
//! `created_at` is set once at insert time and no command accepts a new
//! value for it — timestamps are immutable from inside the app by design.

use crate::db::Db;
use chrono::Local;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

pub const STATUSES: [&str; 6] = [
    "applied",
    "screening",
    "interview",
    "offer",
    "rejected",
    "ghosted",
];

#[derive(Debug, Serialize, Deserialize)]
pub struct Application {
    pub id: Option<i64>,
    pub created_at: String,
    pub company: String,
    pub role: String,
    pub job_id: String,
    pub portal: String,
    pub location: String,
    pub address_used: String,
    pub phone: String,
    pub salary_expectation: String,
    pub status: String,
    pub notes: String,
    /// Custom-field values keyed by field key.
    pub extra: HashMap<String, Value>,
    pub resume_kind: Option<String>,
    pub resume_tex: Option<String>,
    pub resume_path: Option<String>,
    pub cover_kind: Option<String>,
    pub cover_tex: Option<String>,
    pub cover_path: Option<String>,
    #[serde(default)]
    pub job_url: String,
    #[serde(default)]
    pub job_description: String,
    #[serde(default)]
    pub work_type: String,
    #[serde(default)]
    pub captured_at: String,
}

#[derive(Debug, Serialize)]
pub struct StatusEvent {
    pub status: String,
    pub changed_at: String,
}

/// The subset of fields accepted when creating an entry from the popup.
#[derive(Debug, Deserialize)]
pub struct NewApplication {
    pub company: String,
    pub role: String,
    #[serde(default)]
    pub job_id: String,
    #[serde(default)]
    pub portal: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub address_used: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub salary_expectation: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub extra: HashMap<String, Value>,
    pub resume_kind: Option<String>,
    pub resume_tex: Option<String>,
    pub resume_path: Option<String>,
    pub cover_kind: Option<String>,
    pub cover_tex: Option<String>,
    pub cover_path: Option<String>,
    #[serde(default)]
    pub job_url: String,
    #[serde(default)]
    pub job_description: String,
    #[serde(default)]
    pub work_type: String,
    #[serde(default)]
    pub captured_at: String,
}

fn with_conn<T>(
    db: &State<Db>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let guard = db.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("database not initialized")?;
    f(conn)
}

fn row_to_application(r: &rusqlite::Row) -> rusqlite::Result<Application> {
    let extra_json: String = r.get("extra")?;
    Ok(Application {
        id: Some(r.get("id")?),
        created_at: r.get("created_at")?,
        company: r.get("company")?,
        role: r.get("role")?,
        job_id: r.get("job_id")?,
        portal: r.get("portal")?,
        location: r.get("location")?,
        address_used: r.get("address_used")?,
        phone: r.get("phone")?,
        salary_expectation: r.get("salary_expectation")?,
        status: r.get("status")?,
        notes: r.get("notes")?,
        extra: serde_json::from_str(&extra_json).unwrap_or_default(),
        resume_kind: r.get("resume_kind")?,
        resume_tex: r.get("resume_tex")?,
        resume_path: r.get("resume_path")?,
        cover_kind: r.get("cover_kind")?,
        cover_tex: r.get("cover_tex")?,
        cover_path: r.get("cover_path")?,
        job_url: r.get("job_url").unwrap_or_default(),
        job_description: r.get("job_description").unwrap_or_default(),
        work_type: r.get("work_type").unwrap_or_default(),
        captured_at: r.get("captured_at").unwrap_or_default(),
    })
}

#[tauri::command]
pub fn create_application(app: NewApplication, db: State<Db>) -> Result<i64, String> {
    with_conn(&db, |conn| {
        let now = Local::now().to_rfc3339();
        let extra = serde_json::to_string(&app.extra).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO applications
             (created_at, company, role, job_id, portal, location, address_used,
              phone, salary_expectation, status, notes, extra,
              resume_kind, resume_tex, resume_path, cover_kind, cover_tex, cover_path,
              job_url, job_description, work_type, captured_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'applied', ?10, ?11,
                     ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            params![
                now,
                app.company,
                app.role,
                app.job_id,
                app.portal,
                app.location,
                app.address_used,
                app.phone,
                app.salary_expectation,
                app.notes,
                extra,
                app.resume_kind,
                app.resume_tex,
                app.resume_path,
                app.cover_kind,
                app.cover_tex,
                app.cover_path,
                app.job_url,
                app.job_description,
                app.work_type,
                app.captured_at,
            ],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO status_events (application_id, status, changed_at)
             VALUES (?1, 'applied', ?2)",
            params![id, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    })
}

#[tauri::command]
pub fn list_applications(db: State<Db>) -> Result<Vec<Application>, String> {
    with_conn(&db, |conn| {
        let mut stmt = conn
            .prepare("SELECT * FROM applications ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], row_to_application)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}

/// Change an application's status, recording the transition with its own
/// timestamp so funnel and response-time analytics can be computed later.
#[tauri::command]
pub fn update_status(id: i64, status: String, db: State<Db>) -> Result<(), String> {
    if !STATUSES.contains(&status.as_str()) {
        return Err(format!("unknown status: {status}"));
    }
    with_conn(&db, |conn| {
        let now = Local::now().to_rfc3339();
        let updated = conn
            .execute(
                "UPDATE applications SET status = ?1 WHERE id = ?2",
                params![status, id],
            )
            .map_err(|e| e.to_string())?;
        if updated == 0 {
            return Err(format!("no application with id {id}"));
        }
        conn.execute(
            "INSERT INTO status_events (application_id, status, changed_at)
             VALUES (?1, ?2, ?3)",
            params![id, status, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Edit an application's data fields. `created_at` and `status` are
/// deliberately not editable here (status has its own command so every
/// change is logged; timestamps are immutable in-app).
#[tauri::command]
pub fn update_application(app: Application, db: State<Db>) -> Result<(), String> {
    let id = app.id.ok_or("application id is required")?;
    with_conn(&db, |conn| {
        let extra = serde_json::to_string(&app.extra).map_err(|e| e.to_string())?;
        let updated = conn
            .execute(
                "UPDATE applications SET
                   company = ?1, role = ?2, job_id = ?3, portal = ?4, location = ?5,
                   address_used = ?6, phone = ?7, salary_expectation = ?8, notes = ?9,
                   extra = ?10, resume_kind = ?11, resume_tex = ?12, resume_path = ?13,
                   cover_kind = ?14, cover_tex = ?15, cover_path = ?16,
                   job_url = ?17, job_description = ?18, work_type = ?19, captured_at = ?20
                 WHERE id = ?21",
                params![
                    app.company,
                    app.role,
                    app.job_id,
                    app.portal,
                    app.location,
                    app.address_used,
                    app.phone,
                    app.salary_expectation,
                    app.notes,
                    extra,
                    app.resume_kind,
                    app.resume_tex,
                    app.resume_path,
                    app.cover_kind,
                    app.cover_tex,
                    app.cover_path,
                    app.job_url,
                    app.job_description,
                    app.work_type,
                    app.captured_at,
                    id,
                ],
            )
            .map_err(|e| e.to_string())?;
        if updated == 0 {
            return Err(format!("no application with id {id}"));
        }
        Ok(())
    })
}

#[derive(Debug, Serialize)]
pub struct DuplicateCheckResult {
    pub is_duplicate: bool,
    pub existing_id: Option<i64>,
    pub reason: Option<String>,
}

/// Checks whether an application might already exist, based on URL,
/// Company + Job ID, or Company + Role.
#[tauri::command]
pub fn check_duplicate_application(
    company: String,
    role: String,
    job_url: Option<String>,
    job_id: Option<String>,
    db: State<Db>,
) -> Result<DuplicateCheckResult, String> {
    with_conn(&db, |conn| {
        let trimmed_company = company.trim();
        let trimmed_role = role.trim();
        let trimmed_url = job_url.as_deref().unwrap_or("").trim();
        let trimmed_id = job_id.as_deref().unwrap_or("").trim();

        // 1. Check exact URL if provided
        if !trimmed_url.is_empty() {
            let mut stmt = conn
                .prepare("SELECT id FROM applications WHERE job_url = ?1 LIMIT 1")
                .map_err(|e| e.to_string())?;
            if let Ok(id) = stmt.query_row([trimmed_url], |r| r.get::<_, i64>(0)) {
                return Ok(DuplicateCheckResult {
                    is_duplicate: true,
                    existing_id: Some(id),
                    reason: Some(
                        "An application with the exact same Job URL already exists.".into(),
                    ),
                });
            }
        }

        // 2. Check Company + Job ID if Job ID provided
        if !trimmed_id.is_empty() && !trimmed_company.is_empty() {
            let mut stmt = conn
                .prepare(
                    "SELECT id FROM applications
                     WHERE LOWER(company) = LOWER(?1) AND job_id = ?2
                     LIMIT 1",
                )
                .map_err(|e| e.to_string())?;
            if let Ok(id) =
                stmt.query_row(params![trimmed_company, trimmed_id], |r| r.get::<_, i64>(0))
            {
                return Ok(DuplicateCheckResult {
                    is_duplicate: true,
                    existing_id: Some(id),
                    reason: Some(format!("An application for {trimmed_company} with Job ID {trimmed_id} already exists.")),
                });
            }
        }

        // 3. Check Company + Role
        if !trimmed_company.is_empty() && !trimmed_role.is_empty() {
            let mut stmt = conn
                .prepare(
                    "SELECT id FROM applications
                     WHERE LOWER(company) = LOWER(?1) AND LOWER(role) = LOWER(?2)
                     LIMIT 1",
                )
                .map_err(|e| e.to_string())?;
            if let Ok(id) = stmt.query_row(params![trimmed_company, trimmed_role], |r| {
                r.get::<_, i64>(0)
            }) {
                return Ok(DuplicateCheckResult {
                    is_duplicate: true,
                    existing_id: Some(id),
                    reason: Some(format!(
                        "You already applied for {trimmed_role} at {trimmed_company}."
                    )),
                });
            }
        }

        Ok(DuplicateCheckResult {
            is_duplicate: false,
            existing_id: None,
            reason: None,
        })
    })
}

#[tauri::command]
pub fn delete_application(id: i64, db: State<Db>) -> Result<(), String> {
    with_conn(&db, |conn| {
        conn.execute("DELETE FROM applications WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn list_status_events(id: i64, db: State<Db>) -> Result<Vec<StatusEvent>, String> {
    with_conn(&db, |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT status, changed_at FROM status_events
                 WHERE application_id = ?1 ORDER BY changed_at",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([id], |r| {
                Ok(StatusEvent {
                    status: r.get(0)?,
                    changed_at: r.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}
