//! In-memory state and validation for jobs captured from the Chrome extension.
//!
//! Tracks the latest active-tab job context with timestamp, URL, and tab ID
//! to ensure stale or unrelated job context from background tabs is never
//! mistakenly prefilled into the user's form.

use chrono::{DateTime, Duration, Local, Utc};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

pub const MAX_JOB_DESCRIPTION_LEN: usize = 65536; // 64KB max description text
pub const MAX_FIELD_LEN: usize = 1024;
pub const CAPTURE_EXPIRY_MINUTES: i64 = 30; // Drop context older than 30 mins

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DetectedJob {
    pub company: Option<String>,
    pub role: Option<String>,
    pub location: Option<String>,
    pub work_type: Option<String>, // 'Remote' | 'Hybrid' | 'On-site'
    pub salary: Option<String>,
    pub portal: Option<String>,
    pub job_id: Option<String>,
    pub url: String,
    pub description: Option<String>,
    pub employment_type: Option<String>,
    pub captured_at: String,
    pub tab_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureSummary {
    pub job: DetectedJob,
    pub fields_count: usize,
    pub is_stale: bool,
}

#[derive(Debug, Default)]
pub struct CaptureState {
    pub latest: Option<DetectedJob>,
    pub received_at: Option<DateTime<Local>>,
}

pub type SharedCaptureState = Arc<Mutex<CaptureState>>;

pub fn new_capture_state() -> SharedCaptureState {
    Arc::new(Mutex::new(CaptureState::default()))
}

/// Sanitize and validate incoming payload from the Chrome extension
pub fn sanitize_job(mut job: DetectedJob) -> Option<DetectedJob> {
    job.url = job.url.trim().to_string();
    if job.url.is_empty() || (!job.url.starts_with("http://") && !job.url.starts_with("https://")) {
        return None;
    }

    job.company = job
        .company
        .map(|s| sanitize_string(s, MAX_FIELD_LEN))
        .filter(|s| !s.is_empty());
    job.role = job
        .role
        .map(|s| sanitize_string(s, MAX_FIELD_LEN))
        .filter(|s| !s.is_empty());
    job.location = job
        .location
        .map(|s| sanitize_string(s, MAX_FIELD_LEN))
        .filter(|s| !s.is_empty());
    job.portal = job
        .portal
        .map(|s| sanitize_string(s, MAX_FIELD_LEN))
        .filter(|s| !s.is_empty());
    job.job_id = job
        .job_id
        .map(|s| sanitize_string(s, MAX_FIELD_LEN))
        .filter(|s| !s.is_empty());
    job.salary = job
        .salary
        .map(|s| sanitize_string(s, MAX_FIELD_LEN))
        .filter(|s| !s.is_empty());
    job.employment_type = job
        .employment_type
        .map(|s| sanitize_string(s, MAX_FIELD_LEN))
        .filter(|s| !s.is_empty());

    // Normalize work type if present
    if let Some(wt) = job.work_type {
        let lower = wt.to_lowercase();
        if lower.contains("remote") {
            job.work_type = Some("Remote".into());
        } else if lower.contains("hybrid") {
            job.work_type = Some("Hybrid".into());
        } else if lower.contains("on-site")
            || lower.contains("onsite")
            || lower.contains("in-person")
            || lower.contains("in person")
        {
            job.work_type = Some("On-site".into());
        } else {
            job.work_type = Some(sanitize_string(wt, 64));
        }
    }

    // Strip HTML tags from description and limit length
    if let Some(desc) = job.description {
        let text = strip_html_tags(&desc);
        let trimmed = sanitize_string(text, MAX_JOB_DESCRIPTION_LEN);
        job.description = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
    }

    if job.captured_at.is_empty() {
        job.captured_at = Utc::now().to_rfc3339();
    }

    Some(job)
}

fn sanitize_string(s: String, max_len: usize) -> String {
    let trimmed = s.trim();
    if trimmed.len() > max_len {
        trimmed[..max_len].to_string()
    } else {
        trimmed.to_string()
    }
}

/// Simple regex-free HTML tag stripper to prevent malicious markup inside Tauri webview
pub fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        if ch == '<' {
            in_tag = true;
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag {
            out.push(ch);
        }
    }
    // Replace multiple spaces/newlines
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .trim()
        .to_string()
}

impl CaptureState {
    pub fn count_fields(job: &DetectedJob) -> usize {
        let mut count = 0;
        if job.company.is_some() {
            count += 1;
        }
        if job.role.is_some() {
            count += 1;
        }
        if job.location.is_some() {
            count += 1;
        }
        if job.work_type.is_some() {
            count += 1;
        }
        if job.salary.is_some() {
            count += 1;
        }
        if job.portal.is_some() {
            count += 1;
        }
        if job.job_id.is_some() {
            count += 1;
        }
        if !job.url.is_empty() {
            count += 1;
        }
        if job.description.is_some() {
            count += 1;
        }
        count
    }

    pub fn is_stale(&self) -> bool {
        match self.received_at {
            Some(time) => {
                let diff = Local::now().signed_duration_since(time);
                diff > Duration::minutes(CAPTURE_EXPIRY_MINUTES)
            }
            None => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_and_strip_html() {
        let raw = "<script>alert('hack')</script><p>We are hiring a <b>Senior Engineer</b> &amp; Architect.</p>";
        let stripped = strip_html_tags(raw);
        assert_eq!(
            stripped,
            "alert('hack')We are hiring a Senior Engineer & Architect."
        );

        let job = DetectedJob {
            company: Some("  Google LLC  ".into()),
            role: Some("Staff Engineer".into()),
            work_type: Some("remote (US only)".into()),
            url: "https://careers.google.com/jobs/123".into(),
            description: Some("<p>Full description here</p>".into()),
            ..Default::default()
        };

        let sanitized = sanitize_job(job).unwrap();
        assert_eq!(sanitized.company.unwrap(), "Google LLC");
        assert_eq!(sanitized.work_type.unwrap(), "Remote");
        assert_eq!(sanitized.description.unwrap(), "Full description here");
    }
}
