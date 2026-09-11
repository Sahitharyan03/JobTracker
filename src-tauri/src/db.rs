//! SQLite connection management and schema migrations.
//!
//! The database lives inside the user-chosen data directory as
//! `jobtracker.db`. The path to that directory is stored in a small JSON
//! config file in the OS config location (see [`crate::config`]), so the
//! data folder itself stays fully portable.

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

/// Application-wide handle to the (optional) open database.
///
/// `None` until the user completes first-run setup and picks a data folder.
pub struct Db(pub Mutex<Option<Connection>>);

pub const DB_FILE_NAME: &str = "jobtracker.db";

///// Open (creating if needed) the database inside `data_dir` and run migrations.
pub fn open(data_dir: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let db_path = data_dir.join(DB_FILE_NAME);
    backup_before_migration_if_needed(data_dir, &db_path)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

/// If a database exists and has an older schema version, create an atomic
/// backup before running the forward-only migration.
fn backup_before_migration_if_needed(data_dir: &Path, db_path: &Path) -> Result<(), String> {
    if !db_path.exists() {
        return Ok(());
    }
    // Inspect current user_version without modifying the database
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);
    drop(conn);

    if version == 1 {
        let backup_path = data_dir.join("jobtracker.backup-before-v2.db");
        if !backup_path.exists() {
            std::fs::copy(db_path, &backup_path)
                .map_err(|e| format!("failed to create database backup before migration: {e}"))?;
        }
    }
    Ok(())
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    if version < 1 {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS field_definitions (
                id         INTEGER PRIMARY KEY,
                key        TEXT NOT NULL UNIQUE,
                label      TEXT NOT NULL,
                field_type TEXT NOT NULL DEFAULT 'text',
                options    TEXT,
                required   INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                visible    INTEGER NOT NULL DEFAULT 1,
                builtin    INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS applications (
                id                 INTEGER PRIMARY KEY,
                created_at         TEXT NOT NULL,
                company            TEXT NOT NULL DEFAULT '',
                role               TEXT NOT NULL DEFAULT '',
                job_id             TEXT NOT NULL DEFAULT '',
                portal             TEXT NOT NULL DEFAULT '',
                location           TEXT NOT NULL DEFAULT '',
                address_used       TEXT NOT NULL DEFAULT '',
                phone              TEXT NOT NULL DEFAULT '',
                salary_expectation TEXT NOT NULL DEFAULT '',
                status             TEXT NOT NULL DEFAULT 'applied',
                notes              TEXT NOT NULL DEFAULT '',
                extra              TEXT NOT NULL DEFAULT '{}',
                resume_kind        TEXT,
                resume_tex         TEXT,
                resume_path        TEXT,
                cover_kind         TEXT,
                cover_tex          TEXT,
                cover_path         TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_applications_created_at
                ON applications (created_at);

            CREATE TABLE IF NOT EXISTS status_events (
                id             INTEGER PRIMARY KEY,
                application_id INTEGER NOT NULL
                                REFERENCES applications (id) ON DELETE CASCADE,
                status         TEXT NOT NULL,
                changed_at     TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_status_events_application
                ON status_events (application_id);

            CREATE TABLE IF NOT EXISTS anomaly_notes (
                id           INTEGER PRIMARY KEY,
                period_start TEXT NOT NULL,
                period_type  TEXT NOT NULL,
                direction    TEXT NOT NULL,
                note         TEXT NOT NULL DEFAULT '',
                created_at   TEXT NOT NULL,
                UNIQUE (period_start, period_type)
            );

            PRAGMA user_version = 1;
            "#,
        )
        .map_err(|e| e.to_string())?;

        seed_default_fields(conn)?;
    }

    if version < 2 {
        // Forward-only migration to v2:
        // Add job_url, job_description, work_type, captured_at columns
        // and create reusable_values table for multiple saved addresses/phones.
        conn.execute_batch(
            r#"
            ALTER TABLE applications ADD COLUMN job_url TEXT NOT NULL DEFAULT '';
            ALTER TABLE applications ADD COLUMN job_description TEXT NOT NULL DEFAULT '';
            ALTER TABLE applications ADD COLUMN work_type TEXT NOT NULL DEFAULT '';
            ALTER TABLE applications ADD COLUMN captured_at TEXT NOT NULL DEFAULT '';

            CREATE TABLE IF NOT EXISTS reusable_values (
                id         INTEGER PRIMARY KEY,
                category   TEXT NOT NULL,
                label      TEXT NOT NULL,
                value      TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reusable_values_category
                ON reusable_values (category);

            PRAGMA user_version = 2;
            "#,
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// The built-in form fields every new database starts with.
///
/// Built-in fields map to real columns on `applications`; custom fields the
/// user adds later live in the `extra` JSON column. Hiding a field never
/// touches stored data.
fn seed_default_fields(conn: &Connection) -> Result<(), String> {
    let defaults: [(&str, &str, &str, Option<&str>, i64); 9] = [
        ("company", "Company", "text", None, 1),
        ("role", "Role", "text", None, 1),
        ("job_id", "Job ID", "text", None, 0),
        (
            "portal",
            "Portal",
            "select",
            Some(r#"["Ashby","Greenhouse","Lever","Workday","LinkedIn","Company site","Other"]"#),
            0,
        ),
        ("location", "Location", "text", None, 0),
        ("address_used", "Address Used", "text", None, 0),
        ("phone", "Phone Number", "text", None, 0),
        ("salary_expectation", "Salary Expectation", "text", None, 0),
        ("notes", "Notes", "textarea", None, 0),
    ];

    let mut stmt = conn
        .prepare(
            "INSERT OR IGNORE INTO field_definitions
             (key, label, field_type, options, required, sort_order, visible, builtin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 1)",
        )
        .map_err(|e| e.to_string())?;

    for (i, (key, label, ftype, options, required)) in defaults.iter().enumerate() {
        stmt.execute(rusqlite::params![
            key, label, ftype, options, required, i as i64
        ])
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_v1_to_v2_migration_and_backup() {
        let temp_dir = std::env::temp_dir().join(format!(
            "jt_test_db_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let db_file = temp_dir.join(DB_FILE_NAME);

        // Step 1: Create a real v1 database manually
        {
            let conn = Connection::open(&db_file).unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE field_definitions (
                    id INTEGER PRIMARY KEY,
                    key TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    field_type TEXT NOT NULL DEFAULT 'text',
                    options TEXT,
                    required INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    visible INTEGER NOT NULL DEFAULT 1,
                    builtin INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE applications (
                    id INTEGER PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    company TEXT NOT NULL DEFAULT '',
                    role TEXT NOT NULL DEFAULT '',
                    job_id TEXT NOT NULL DEFAULT '',
                    portal TEXT NOT NULL DEFAULT '',
                    location TEXT NOT NULL DEFAULT '',
                    address_used TEXT NOT NULL DEFAULT '',
                    phone TEXT NOT NULL DEFAULT '',
                    salary_expectation TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'applied',
                    notes TEXT NOT NULL DEFAULT '',
                    extra TEXT NOT NULL DEFAULT '{}',
                    resume_kind TEXT,
                    resume_tex TEXT,
                    resume_path TEXT,
                    cover_kind TEXT,
                    cover_tex TEXT,
                    cover_path TEXT
                );
                CREATE TABLE status_events (
                    id INTEGER PRIMARY KEY,
                    application_id INTEGER NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
                    status TEXT NOT NULL,
                    changed_at TEXT NOT NULL
                );
                CREATE TABLE anomaly_notes (
                    id INTEGER PRIMARY KEY,
                    period_start TEXT NOT NULL,
                    period_type TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    UNIQUE (period_start, period_type)
                );
                PRAGMA user_version = 1;
                "#,
            )
            .unwrap();

            // Insert sample user data
            conn.execute(
                "INSERT INTO applications (id, created_at, company, role, extra, notes)
                 VALUES (101, '2026-01-15T10:00:00Z', 'Acme Corp', 'Engineer', '{\"team\":\"Core\"}', 'Important interview notes')",
                [],
            ).unwrap();
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('hotkey_add', 'Alt+Shift+J')",
                [],
            )
            .unwrap();
        }

        // Step 2: Open with open(&temp_dir) which triggers backup + migration
        let conn = open(&temp_dir).unwrap();

        // Step 3: Verify backup file was created
        let backup_file = temp_dir.join("jobtracker.backup-before-v2.db");
        assert!(
            backup_file.exists(),
            "Backup before v2 migration must exist"
        );

        // Verify version is now 2
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 2);

        // Step 4: Verify original application record and custom data was preserved exactly
        let (id, company, role, extra, notes, job_url, work_type): (i64, String, String, String, String, String, String) = conn.query_row(
            "SELECT id, company, role, extra, notes, job_url, work_type FROM applications WHERE id = 101",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
        ).unwrap();

        assert_eq!(id, 101);
        assert_eq!(company, "Acme Corp");
        assert_eq!(role, "Engineer");
        assert_eq!(extra, "{\"team\":\"Core\"}");
        assert_eq!(notes, "Important interview notes");
        assert_eq!(job_url, "");
        assert_eq!(work_type, "");

        // Step 5: Verify reusable_values table exists
        conn.execute(
            "INSERT INTO reusable_values (category, label, value, is_default, created_at)
             VALUES ('address', 'Tampa Address', '123 Ocean Blvd', 1, '2026-01-15T12:00:00Z')",
            [],
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT count(*) FROM reusable_values", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);

        // Cleanup
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
