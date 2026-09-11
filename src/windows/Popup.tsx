/**
 * The add-entry popup summoned by the global hotkey or "+ New Application".
 * Implemented based on stitch_single_page_job_application_form reference design.
 * Features automatic prefill from extension capture, duplicate warning, and reusable values.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import DynamicForm from "../components/DynamicForm";
import DocumentAttach from "../components/DocumentAttach";
import {
  emptyDoc,
  emptyValues,
  type DocValue,
  type FormValues,
} from "../lib/form";
import type {
  Application,
  DocKind,
  DuplicateCheckResult,
  FieldDefinition,
} from "../types";
import "./Popup.css";

type SaveState = "idle" | "saving" | "saved" | "error";

interface DetectionNotice {
  type: "full" | "partial" | "none";
  message: string;
}

export default function Popup() {
  const [fields, setFields] = useState<FieldDefinition[] | null>(null);
  const [values, setValues] = useState<FormValues>(emptyValues());
  const [resume, setResume] = useState<DocValue>(emptyDoc);
  const [cover, setCover] = useState<DocValue>(emptyDoc);
  const [docMode, setDocMode] = useState<DocKind>("tex");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [detectionNotice, setDetectionNotice] = useState<DetectionNotice | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null);

  // Load field definitions and user settings
  useEffect(() => {
    api.listFields().then(setFields).catch((e) => setError(String(e)));
    api
      .getSettings()
      .then((s) => setDocMode(s.doc_mode === "pdf" ? "pdf" : "tex"))
      .catch(() => {});
  }, []);

  // Check for detected job from Chrome extension on open
  useEffect(() => {
    api
      .getLatestJobCapture()
      .then((summary) => {
        if (summary && summary.job) {
          const { job, is_stale, fields_count } = summary;
          if (is_stale) {
            setDetectionNotice({
              type: "none",
              message: "⚠️ Job details not detected",
            });
            return;
          }

          // Prefill values
          setValues((prev) => ({
            ...prev,
            builtin: {
              ...prev.builtin,
              company: job.company || prev.builtin.company,
              role: job.role || prev.builtin.role,
              location: job.location || prev.builtin.location,
              portal: job.portal || prev.builtin.portal,
              work_type: job.work_type || prev.builtin.work_type,
              salary_expectation: job.salary || prev.builtin.salary_expectation,
              job_id: job.job_id || prev.builtin.job_id,
              job_url: job.url || prev.builtin.job_url,
              job_description: job.description || prev.builtin.job_description,
            },
          }));

          if (fields_count >= 4 && job.role && job.company) {
            setDetectionNotice({
              type: "full",
              message: `✅ Done filling! Job details captured${job.portal ? ` from ${job.portal}` : ""}`,
            });
          } else if (fields_count > 0) {
            setDetectionNotice({
              type: "partial",
              message: `✅ Job detected · ${fields_count} fields filled`,
            });
          } else {
            setDetectionNotice({
              type: "none",
              message: "⚠️ Job details not detected",
            });
          }
        } else {
          setDetectionNotice({
            type: "none",
            message: "⚠️ Job details not detected",
          });
        }
      })
      .catch(() => {
        // Local server capture check silent fallback
      });
  }, []);

  // Debounced duplicate detection
  useEffect(() => {
    const company = values.builtin.company?.trim() ?? "";
    const role = values.builtin.role?.trim() ?? "";
    if (company.length < 2 || role.length < 2) {
      const clearTimer = setTimeout(() => setDuplicateWarning(null), 0);
      return () => clearTimeout(clearTimer);
    }
    const timer = setTimeout(() => {
      api
        .checkDuplicateApplication(company, role)
        .then((res) => {
          setDuplicateWarning(res.is_duplicate ? res : null);
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [values.builtin.company, values.builtin.role]);

  const save = useCallback(async () => {
    if (saveState === "saving") return;
    const company = values.builtin.company?.trim() ?? "";
    const role = values.builtin.role?.trim() ?? "";
    if (!company || !role) {
      setError("Company and Role are required.");
      return;
    }
    setSaveState("saving");
    setError("");
    try {
      const docFields: Record<string, string> = {};
      for (const [doc, prefix] of [
        [resume, "resume"],
        [cover, "cover"],
      ] as const) {
        if (doc.kind === "tex" && doc.tex?.trim()) {
          docFields[`${prefix}_kind`] = "tex";
          docFields[`${prefix}_tex`] = doc.tex;
        } else if (doc.kind === "pdf" && doc.pdfSource) {
          const rel = await api.importPdf(
            doc.pdfSource,
            company,
            role,
            prefix === "resume" ? "Resume" : "CoverLetter",
          );
          docFields[`${prefix}_kind`] = "pdf";
          docFields[`${prefix}_path`] = rel;
        }
      }
      await api.createApplication({
        ...values.builtin,
        extra: values.extra as Record<string, unknown>,
        ...docFields,
      } as Partial<Application>);
      setSaveState("saved");
      setTimeout(() => api.closePopup(), 450);
    } catch (e) {
      setSaveState("error");
      setError(String(e));
    }
  }, [values, resume, cover, saveState]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") api.closePopup();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  if (!fields) {
    return <div className="popup-loading">{error || "Loading…"}</div>;
  }

  return (
    <div className="popup-window">
      {/* Modal Header */}
      <header className="popup-modal-header" data-tauri-drag-region>
        <div className="modal-title-group" data-tauri-drag-region>
          <div className="modal-header-icon">
            <span className="material-symbols-outlined">description</span>
          </div>
          <div className="modal-header-titles">
            <h1 className="modal-title">New Application</h1>
            <p className="modal-subtitle">Record job application details &amp; documents</p>
          </div>
        </div>
        <button
          type="button"
          className="modal-close-btn"
          onClick={() => api.closePopup()}
          aria-label="Close dialog"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>

      {/* Non-blocking Detection Toast / Banner */}
      {detectionNotice && (
        <div className={`detection-banner detection-${detectionNotice.type}`}>
          <span className="banner-text">{detectionNotice.message}</span>
          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setDetectionNotice(null)}
            title="Dismiss notice"
          >
            ×
          </button>
        </div>
      )}

      {/* Duplicate Warning Banner */}
      {duplicateWarning && (
        <div className="duplicate-warning-banner">
          <span className="material-symbols-outlined warn-icon">warning</span>
          <span className="warn-text">
            {duplicateWarning.reason ||
              `Possible duplicate: An application for this role already exists (${
                duplicateWarning.existing_id ? `ID #${duplicateWarning.existing_id}` : "earlier"
              }).`}
          </span>
          <button
            type="button"
            className="banner-dismiss"
            onClick={() => setDuplicateWarning(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Progress / Section Bar */}
      <div className="popup-progress-guide">
        <div className="progress-info">
          <span className="progress-stage">Stage: Ready to Draft</span>
          <span className="progress-count">4 Sections</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: "45%" }}></div>
        </div>
      </div>

      {/* Scrollable Form Body */}
      <div className="popup-scroll-body">
        <DynamicForm
          fields={fields}
          values={values}
          onChange={setValues}
          autoFocus
        />

        {/* Documents & Attachments Section */}
        <section className="form-section docs-section">
          <div className="section-header">
            <span className="section-title">Documents &amp; Attachments</span>
          </div>
          <div className="docs-stack">
            <DocumentAttach
              label="Resume"
              defaultMode={docMode}
              value={resume}
              onChange={setResume}
            />
            <DocumentAttach
              label="Cover Letter"
              defaultMode={docMode}
              value={cover}
              onChange={setCover}
            />
          </div>
        </section>

        {error && <div className="popup-error-alert">{error}</div>}
      </div>

      {/* Modal Sticky Footer */}
      <footer className="popup-modal-footer">
        <div className="footer-shortcut-hint">
          <kbd className="kbd-pill">⌘/Ctrl + Enter</kbd>
          <span>to save</span>
          <span className="sep">•</span>
          <kbd className="kbd-pill">Esc</kbd>
          <span>to close</span>
        </div>

        <div className="footer-actions">
          <button
            type="button"
            className="btn-modal-cancel"
            onClick={() => api.closePopup()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-modal-save"
            onClick={save}
            disabled={saveState === "saving"}
          >
            {saveState === "saved"
              ? "Saved ✓"
              : saveState === "saving"
              ? "Saving…"
              : "Save"}
          </button>
        </div>
      </footer>
    </div>
  );
}
