//! CSV and Excel export of the applications table.
//!
//! Columns: the fixed built-in set, then every custom-field key that has
//! ever been stored (including fields since hidden — data is never lost),
//! discovered from the union of all `extra` JSON objects.

use crate::db::Db;
use rusqlite::Connection;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::PathBuf;
use tauri::State;

const BUILTIN_COLUMNS: [&str; 13] = [
    "Timestamp",
    "Company",
    "Role",
    "Job ID",
    "Portal",
    "Location",
    "Work Type",
    "Address Used",
    "Phone Number",
    "Salary Expectation",
    "Status",
    "Job URL",
    "Notes",
];

struct ExportRow {
    builtin: [String; 13],
    extra: serde_json::Map<String, Value>,
}

fn collect_rows(conn: &Connection) -> Result<(Vec<String>, Vec<ExportRow>), String> {
    let mut stmt = conn
        .prepare(
            "SELECT created_at, company, role, job_id, portal, location,
                    work_type, address_used, phone, salary_expectation, status, job_url, notes, extra
             FROM applications ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<ExportRow> = stmt
        .query_map([], |r| {
            let extra_json: String = r.get(13)?;
            let extra = serde_json::from_str::<Value>(&extra_json)
                .ok()
                .and_then(|v| v.as_object().cloned())
                .unwrap_or_default();
            Ok(ExportRow {
                builtin: [
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                    r.get(9)?,
                    r.get(10)?,
                    r.get(11)?,
                    r.get(12)?,
                ],
                extra,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    let mut extra_keys = BTreeSet::new();
    for row in &rows {
        for key in row.extra.keys() {
            extra_keys.insert(key.clone());
        }
    }

    let mut header: Vec<String> = BUILTIN_COLUMNS.iter().map(|s| s.to_string()).collect();
    header.extend(extra_keys.iter().cloned());
    Ok((header, rows))
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn csv_escape(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

#[tauri::command]
pub fn export_csv(path: PathBuf, db: State<Db>) -> Result<(), String> {
    let guard = db.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("database not initialized")?;
    let (header, rows) = collect_rows(conn)?;

    let mut out = String::new();
    out.push_str(
        &header
            .iter()
            .map(|h| csv_escape(h))
            .collect::<Vec<_>>()
            .join(","),
    );
    out.push('\n');

    let extra_keys = &header[BUILTIN_COLUMNS.len()..];
    for row in &rows {
        let mut cells: Vec<String> = row.builtin.iter().map(|c| csv_escape(c)).collect();
        for key in extra_keys {
            let cell = row.extra.get(key).map(value_to_string).unwrap_or_default();
            cells.push(csv_escape(&cell));
        }
        out.push_str(&cells.join(","));
        out.push('\n');
    }

    std::fs::write(&path, out).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_xlsx(path: PathBuf, db: State<Db>) -> Result<(), String> {
    use rust_xlsxwriter::{Format, Workbook};

    let guard = db.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("database not initialized")?;
    let (header, rows) = collect_rows(conn)?;

    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name("Applications").map_err(|e| e.to_string())?;

    let bold = Format::new().set_bold();
    for (col, name) in header.iter().enumerate() {
        sheet
            .write_string_with_format(0, col as u16, name, &bold)
            .map_err(|e| e.to_string())?;
    }

    let extra_keys = &header[BUILTIN_COLUMNS.len()..];
    for (i, row) in rows.iter().enumerate() {
        let r = (i + 1) as u32;
        for (col, cell) in row.builtin.iter().enumerate() {
            sheet
                .write_string(r, col as u16, cell)
                .map_err(|e| e.to_string())?;
        }
        for (j, key) in extra_keys.iter().enumerate() {
            let cell = row.extra.get(key).map(value_to_string).unwrap_or_default();
            sheet
                .write_string(r, (BUILTIN_COLUMNS.len() + j) as u16, &cell)
                .map_err(|e| e.to_string())?;
        }
    }

    sheet.autofit();
    workbook.save(&path).map_err(|e| e.to_string())
}
