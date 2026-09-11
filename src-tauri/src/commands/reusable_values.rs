//! Commands for managing saved reusable profile choices (addresses, phone numbers).
//!
//! A user can maintain multiple saved addresses (e.g. "Tampa Address",
//! "New York Address", "Parents") and phone numbers (e.g. "Primary Mobile",
//! "Google Voice"). When selected in an application, the value text is
//! saved immutably into the application row so that editing a reusable profile
//! later never corrupts historical application records.

use crate::db::Db;
use chrono::Local;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReusableValue {
    pub id: Option<i64>,
    pub category: String, // 'address' | 'phone'
    pub label: String,    // e.g. 'Tampa Address'
    pub value: String,    // e.g. '123 Ocean Blvd, Tampa, FL 33602'
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct NewReusableValue {
    pub id: Option<i64>,
    pub category: String,
    pub label: String,
    pub value: String,
    pub is_default: bool,
}

fn with_conn<T>(
    db: &State<Db>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let guard = db.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("database not initialized")?;
    f(conn)
}

#[tauri::command]
pub fn list_reusable_values(
    category: Option<String>,
    db: State<Db>,
) -> Result<Vec<ReusableValue>, String> {
    with_conn(&db, |conn| {
        let sql: &str = match &category {
            Some(_) => {
                "SELECT id, category, label, value, is_default, created_at
                 FROM reusable_values
                 WHERE category = ?1
                 ORDER BY is_default DESC, label ASC"
            }
            None => {
                "SELECT id, category, label, value, is_default, created_at
                 FROM reusable_values
                 ORDER BY category ASC, is_default DESC, label ASC"
            }
        };

        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = if let Some(cat) = category {
            stmt.query_map([cat], map_row).map_err(|e| e.to_string())?
        } else {
            stmt.query_map([], map_row).map_err(|e| e.to_string())?
        };

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    })
}

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<ReusableValue> {
    let is_default_int: i64 = r.get(4)?;
    Ok(ReusableValue {
        id: Some(r.get(0)?),
        category: r.get(1)?,
        label: r.get(2)?,
        value: r.get(3)?,
        is_default: is_default_int != 0,
        created_at: r.get(5)?,
    })
}

#[tauri::command]
pub fn save_reusable_value(val: NewReusableValue, db: State<Db>) -> Result<i64, String> {
    with_conn(&db, |conn| {
        let label = val.label.trim();
        let value = val.value.trim();
        if label.is_empty() {
            return Err("Label cannot be empty".into());
        }

        let is_default_int = if val.is_default { 1 } else { 0 };

        if val.is_default {
            // Unset previous defaults in this category
            let _ = conn.execute(
                "UPDATE reusable_values SET is_default = 0 WHERE category = ?1",
                params![val.category],
            );
        }

        if let Some(id) = val.id {
            conn.execute(
                "UPDATE reusable_values
                 SET label = ?1, value = ?2, is_default = ?3
                 WHERE id = ?4",
                params![label, value, is_default_int, id],
            )
            .map_err(|e| e.to_string())?;
            Ok(id)
        } else {
            let now = Local::now().to_rfc3339();
            conn.execute(
                "INSERT INTO reusable_values (category, label, value, is_default, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![val.category, label, value, is_default_int, now],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    })
}

#[tauri::command]
pub fn delete_reusable_value(id: i64, db: State<Db>) -> Result<(), String> {
    with_conn(&db, |conn| {
        conn.execute("DELETE FROM reusable_values WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}
