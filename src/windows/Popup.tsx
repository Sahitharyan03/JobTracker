/**
 * New Job Application Modal Window
 * 100% Pixel-accurate implementation of stitch_single_page_job_application_form.
 * Supports auto-detection from Chrome extension, duplicate checking,
 * reusable address & phone auto-fill, LaTeX/PDF documents, and keyboard shortcuts.
 */

import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import {
  emptyValues,
  type FormValues,
} from "../lib/form";
import type {
  Application,
  DuplicateCheckResult,
  ReusableValue,
} from "../types";
import "./Popup.css";

type SaveState = "idle" | "saving" | "saved" | "error";

interface DetectionNotice {
  type: "full" | "partial" | "none";
  message: string;
}

export default function Popup() {
  const [values, setValues] = useState<FormValues>(emptyValues());
  const [resumeFormat, setResumeFormat] = useState<"tex" | "pdf">("tex");
  const [coverFormat, setCoverFormat] = useState<"tex" | "pdf">("tex");
  const [resumeTex, setResumeTex] = useState("");
  const [resumePdfPath, setResumePdfPath] = useState("");
  const [coverTex, setCoverTex] = useState("");
  const [coverPdfPath, setCoverPdfPath] = useState("");
  const [resumeExpanded, setResumeExpanded] = useState(true);
  const [coverExpanded, setCoverExpanded] = useState(true);

  const [savedAddresses, setSavedAddresses] = useState<ReusableValue[]>([]);
  const [savedPhones, setSavedPhones] = useState<ReusableValue[]>([]);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [detectionNotice, setDetectionNotice] = useState<DetectionNotice | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null);

  // Load field definitions, settings, and reusable values
  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        const mode = s.doc_mode === "pdf" ? "pdf" : "tex";
        setResumeFormat(mode);
        setCoverFormat(mode);
      })
      .catch(() => {});

    api.listReusableValues("address").then(setSavedAddresses).catch(() => {});
    api.listReusableValues("phone").then(setSavedPhones).catch(() => {});
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
        }
      })
      .catch(() => {});
  }, []);

  // Duplicate detection debounced check
  useEffect(() => {
    const company = values.builtin.company?.trim();
    const role = values.builtin.role?.trim();
    if (!company || !role || company.length < 2 || role.length < 2) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(() => {
      api
        .checkDuplicateApplication(
          company,
          role,
          values.builtin.job_url,
          values.builtin.job_id,
        )
        .then((res: DuplicateCheckResult) => {
          if (res.is_duplicate) {
            setDuplicateWarning(res);
          } else {
            setDuplicateWarning(null);
          }
        })
        .catch(() => {});
    }, 450);

    return () => clearTimeout(timer);
  }, [values.builtin.company, values.builtin.role, values.builtin.job_id, values.builtin.job_url]);

  const updateBuiltin = (field: string, val: string) => {
    setValues((prev) => ({
      ...prev,
      builtin: {
        ...prev.builtin,
        [field]: val,
      },
    }));
  };

  const handlePickResumePdf = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") {
      setResumePdfPath(selected);
    }
  };

  const handlePickCoverPdf = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") {
      setCoverPdfPath(selected);
    }
  };

  const handleSave = useCallback(async () => {
    if (saveState === "saving") return;
    const company = (values.builtin.company || "").trim();
    const role = (values.builtin.role || "").trim();
    if (!company || !role) {
      setError("Company and Role are required.");
      return;
    }

    setError("");
    setSaveState("saving");

    try {
      let importedResumePath: string | null = null;
      let importedCoverPath: string | null = null;

      if (resumeFormat === "pdf" && resumePdfPath) {
        importedResumePath = await api.importPdf(resumePdfPath, company, role, "resume");
      }
      if (coverFormat === "pdf" && coverPdfPath) {
        importedCoverPath = await api.importPdf(coverPdfPath, company, role, "cover");
      }

      const payload: Partial<Application> = {
        created_at: new Date().toISOString(),
        company,
        role,
        status: "applied",
        job_id: values.builtin.job_id || "",
        portal: values.builtin.portal || "",
        location: values.builtin.location || "",
        work_type: values.builtin.work_type || "",
        salary_expectation: values.builtin.salary_expectation || "",
        address_used: values.builtin.address_used || "",
        phone: values.builtin.phone || "",
        notes: values.builtin.notes || "",
        job_url: values.builtin.job_url || "",
        job_description: values.builtin.job_description || "",
        resume_kind: resumeFormat === "tex" ? (resumeTex ? "tex" : null) : (importedResumePath ? "pdf" : null),
        resume_tex: resumeFormat === "tex" ? resumeTex : null,
        resume_path: importedResumePath,
        cover_kind: coverFormat === "tex" ? (coverTex ? "tex" : null) : (importedCoverPath ? "pdf" : null),
        cover_tex: coverFormat === "tex" ? coverTex : null,
        cover_path: importedCoverPath,
        extra: values.extra,
      };

      await api.createApplication(payload);

      // Clear captured job from loopback cache
      await api.clearLatestJobCapture().catch(() => {});

      setSaveState("saved");
      setTimeout(() => {
        api.closePopup();
      }, 400);
    } catch (e) {
      setSaveState("error");
      setError(String(e));
    }
  }, [saveState, values, resumeFormat, resumeTex, resumePdfPath, coverFormat, coverTex, coverPdfPath]);

  // Bind Cmd/Ctrl+Enter for quick saving and Esc to dismiss
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSave();
      }
      if (event.key === "Escape") {
        api.closePopup();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  return (
    <div className="popup-window" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <main className="relative w-full h-full flex flex-col overflow-hidden" style={{ background: "var(--bg-elevated)", color: "var(--text)" }}>
        {/* BEGIN: ModalHeader */}
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
            className="modal-close-btn"
            type="button"
            onClick={() => api.closePopup()}
            aria-label="Close dialog"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        {/* Non-blocking Detection Toast / Banner */}
        {detectionNotice && (
          <div className={`detection-banner ${
            detectionNotice.type === "full"
              ? "detection-full"
              : detectionNotice.type === "partial"
              ? "detection-partial"
              : "detection-none"
          }`}>
            <span>{detectionNotice.message}</span>
            <button
              className="banner-dismiss"
              onClick={() => setDetectionNotice(null)}
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
                `Possible duplicate: Application already exists (${
                  duplicateWarning.existing_id ? `ID #${duplicateWarning.existing_id}` : "earlier"
                }).`}
            </span>
            <button className="banner-dismiss" onClick={() => setDuplicateWarning(null)}>
              ×
            </button>
          </div>
        )}

        {/* BEGIN: ProgressIndicator */}
        <div className="popup-progress-guide">
          <div className="progress-info">
            <span className="progress-stage">Stage: Ready to Draft</span>
            <span className="progress-count">4 Sections</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: "33%" }}></div>
          </div>
        </div>

        {/* BEGIN: FormContentScrollArea */}
        <form
          className="popup-scroll-body"
          id="jobApplicationForm"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          {/* SECTION 1: JOB DETAILS */}
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6 }}>
              <h2 style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Job Details</h2>
            </div>

            {/* Company Name */}
            <div>
              <label htmlFor="company-name">
                Company <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="company-name"
                style={{ width: "100%" }}
                placeholder="e.g. Acme Corp, Google"
                required
                type="text"
                value={values.builtin.company || ""}
                onChange={(e) => updateBuiltin("company", e.target.value)}
                autoFocus
              />
            </div>

            {/* Role Title */}
            <div>
              <label htmlFor="role-title">
                Role <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="role-title"
                style={{ width: "100%" }}
                placeholder="e.g. Senior Frontend Engineer"
                required
                type="text"
                value={values.builtin.role || ""}
                onChange={(e) => updateBuiltin("role", e.target.value)}
              />
            </div>

            {/* Job ID & Portal Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label htmlFor="job-id">
                  Job ID
                </label>
                <input
                  id="job-id"
                  style={{ width: "100%" }}
                  placeholder="e.g. REQ-9842"
                  type="text"
                  value={values.builtin.job_id || ""}
                  onChange={(e) => updateBuiltin("job_id", e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="application-portal">
                  Portal
                </label>
                <select
                  id="application-portal"
                  style={{ width: "100%" }}
                  value={values.builtin.portal || ""}
                  onChange={(e) => updateBuiltin("portal", e.target.value)}
                >
                  <option value="">— Select source portal —</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Greenhouse">Greenhouse</option>
                  <option value="Lever">Lever</option>
                  <option value="Workday">Workday</option>
                  <option value="Indeed">Indeed</option>
                  <option value="jobrightai">Jobright AI</option>
                  <option value="Company Website">Company Career Portal</option>
                  <option value="Internal Referral">Internal Referral</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Location Field */}
            <div>
              <label htmlFor="job-location">
                Location
              </label>
              <input
                id="job-location"
                style={{ width: "100%" }}
                placeholder="e.g. San Francisco, CA (Remote)"
                type="text"
                value={values.builtin.location || ""}
                onChange={(e) => updateBuiltin("location", e.target.value)}
              />
            </div>
          </section>

          {/* SECTION 2: CONTACT & COMPENSATION */}
          <section style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6 }}>
              <h2 style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Contact &amp; Compensation</h2>
            </div>

            {/* Address Used Field */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <label htmlFor="address-used">
                  Address Used
                </label>
                {savedAddresses.length > 0 && (
                  <select
                    style={{ fontSize: "0.6875rem", color: "var(--accent)", background: "transparent", border: "none", padding: 0, outline: "none", cursor: "pointer" }}
                    onChange={(e) => {
                      if (e.target.value) updateBuiltin("address_used", e.target.value);
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Saved addresses...</option>
                    {savedAddresses.map((addr) => (
                      <option key={addr.id} value={addr.value}>
                        {addr.label}: {addr.value.slice(0, 32)}...
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <input
                id="address-used"
                style={{ width: "100%" }}
                placeholder="e.g. 1428 Elmwood Ave, Apt 4B, San Francisco, CA"
                type="text"
                value={values.builtin.address_used || ""}
                onChange={(e) => updateBuiltin("address_used", e.target.value)}
              />
            </div>

            {/* Phone & Salary Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <label htmlFor="contact-phone">
                    Phone Used
                  </label>
                  {savedPhones.length > 0 && (
                    <select
                      style={{ fontSize: "0.6875rem", color: "var(--accent)", background: "transparent", border: "none", padding: 0, outline: "none", cursor: "pointer" }}
                      onChange={(e) => {
                        if (e.target.value) updateBuiltin("phone", e.target.value);
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Saved phones...</option>
                      {savedPhones.map((ph) => (
                        <option key={ph.id} value={ph.value}>
                          {ph.label}: {ph.value}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  id="contact-phone"
                  style={{ width: "100%" }}
                  placeholder="e.g. +1 (555) 234-5678"
                  type="text"
                  value={values.builtin.phone || ""}
                  onChange={(e) => updateBuiltin("phone", e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="target-salary">
                  Target Salary
                </label>
                <input
                  id="target-salary"
                  style={{ width: "100%" }}
                  placeholder="e.g. $145,000 / yr"
                  type="text"
                  value={values.builtin.salary_expectation || ""}
                  onChange={(e) => updateBuiltin("salary_expectation", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* SECTION 3: NOTES */}
          <section style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
            <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6 }}>
              <h2 style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Notes &amp; Context</h2>
            </div>
            <div>
              <textarea
                style={{ width: "100%", minHeight: 70 }}
                placeholder="Referrals, recruiter email, interview stages, or custom instructions..."
                value={values.builtin.notes || ""}
                onChange={(e) => updateBuiltin("notes", e.target.value)}
              />
            </div>
          </section>

          {/* SECTION 4: DOCUMENTS & ATTACHMENTS */}
          <section style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: 6 }}>
              <h2 style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Documents &amp; Attachments</h2>
            </div>

            {/* Resume Attachment Card */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.875rem", background: "var(--bg-inset)" }}>
              <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, userSelect: "none" }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  onClick={() => setResumeExpanded(!resumeExpanded)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--text-faint)", transition: "transform 140ms", transform: resumeExpanded ? "none" : "rotate(-90deg)" }}>
                    expand_more
                  </span>
                  <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text)" }}>Resume</h3>
                </div>
                {/* LaTeX / PDF Toggle Segment */}
                <div style={{ display: "flex", alignItems: "center", background: "var(--bg-elevated)", padding: 2, borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                  <button
                    style={{ padding: "2px 8px", fontSize: "0.6875rem", fontWeight: 600, borderRadius: "0.25rem", background: resumeFormat === "tex" ? "var(--primary)" : "transparent", color: resumeFormat === "tex" ? "var(--on-primary)" : "var(--text-secondary)" }}
                    type="button"
                    onClick={() => setResumeFormat("tex")}
                  >
                    .tex
                  </button>
                  <button
                    style={{ padding: "2px 8px", fontSize: "0.6875rem", fontWeight: 600, borderRadius: "0.25rem", background: resumeFormat === "pdf" ? "var(--primary)" : "transparent", color: resumeFormat === "pdf" ? "var(--on-primary)" : "var(--text-secondary)" }}
                    type="button"
                    onClick={() => setResumeFormat("pdf")}
                  >
                    .pdf
                  </button>
                </div>
              </header>

              {resumeExpanded && (
                <div>
                  {resumeFormat === "tex" ? (
                    <textarea
                      style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.75rem", minHeight: 80 }}
                      placeholder="Paste LaTeX source here (e.g. \documentclass{article}...)"
                      rows={4}
                      value={resumeTex}
                      onChange={(e) => setResumeTex(e.target.value)}
                    />
                  ) : (
                    <div
                      style={{ border: "2px dashed var(--border-strong)", borderRadius: "var(--radius)", padding: "1.25rem", textAlign: "center", cursor: "pointer", background: "var(--bg-elevated)" }}
                      onClick={handlePickResumePdf}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 28, color: "var(--text-faint)", marginBottom: 4 }}>upload_file</span>
                      <p style={{ fontSize: "0.75rem", color: "var(--text)", fontWeight: 500 }}>Click to choose Resume.pdf or drag &amp; drop</p>
                      <p style={{ fontSize: "0.6875rem", color: "var(--text-faint)", marginTop: 2 }}>PDF files up to 10MB</p>
                      {resumePdfPath && (
                        <p style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Selected: {resumePdfPath}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cover Letter Attachment Card */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.875rem", background: "var(--bg-inset)" }}>
              <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, userSelect: "none" }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  onClick={() => setCoverExpanded(!coverExpanded)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--text-faint)", transition: "transform 140ms", transform: coverExpanded ? "none" : "rotate(-90deg)" }}>
                    expand_more
                  </span>
                  <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text)" }}>Cover Letter</h3>
                </div>
                {/* LaTeX / PDF Toggle Segment */}
                <div style={{ display: "flex", alignItems: "center", background: "var(--bg-elevated)", padding: 2, borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                  <button
                    style={{ padding: "2px 8px", fontSize: "0.6875rem", fontWeight: 600, borderRadius: "0.25rem", background: coverFormat === "tex" ? "var(--primary)" : "transparent", color: coverFormat === "tex" ? "var(--on-primary)" : "var(--text-secondary)" }}
                    type="button"
                    onClick={() => setCoverFormat("tex")}
                  >
                    .tex
                  </button>
                  <button
                    style={{ padding: "2px 8px", fontSize: "0.6875rem", fontWeight: 600, borderRadius: "0.25rem", background: coverFormat === "pdf" ? "var(--primary)" : "transparent", color: coverFormat === "pdf" ? "var(--on-primary)" : "var(--text-secondary)" }}
                    type="button"
                    onClick={() => setCoverFormat("pdf")}
                  >
                    .pdf
                  </button>
                </div>
              </header>

              {coverExpanded && (
                <div>
                  {coverFormat === "tex" ? (
                    <textarea
                      style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.75rem", minHeight: 80 }}
                      placeholder="Paste Cover Letter LaTeX source here"
                      rows={4}
                      value={coverTex}
                      onChange={(e) => setCoverTex(e.target.value)}
                    />
                  ) : (
                    <div
                      style={{ border: "2px dashed var(--border-strong)", borderRadius: "var(--radius)", padding: "1.25rem", textAlign: "center", cursor: "pointer", background: "var(--bg-elevated)" }}
                      onClick={handlePickCoverPdf}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 28, color: "var(--text-faint)", marginBottom: 4 }}>upload_file</span>
                      <p style={{ fontSize: "0.75rem", color: "var(--text)", fontWeight: 500 }}>Click to choose Cover_Letter.pdf or drag &amp; drop</p>
                      <p style={{ fontSize: "0.6875rem", color: "var(--text-faint)", marginTop: 2 }}>PDF files up to 10MB</p>
                      {coverPdfPath && (
                        <p style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Selected: {coverPdfPath}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {error && <div className="popup-error-alert">{error}</div>}
        </form>

        {/* BEGIN: ModalStickyFooter */}
        <footer className="popup-modal-footer">
          <div className="footer-shortcut-hint">
            <span className="kbd-pill">⌘/Ctrl + Enter</span>
            <span>save</span>
            <span className="sep">•</span>
            <span className="kbd-pill">Esc</span>
            <span>close</span>
          </div>

          <div className="footer-actions">
            <button
              className="btn-modal-cancel"
              type="button"
              onClick={() => api.closePopup()}
            >
              Cancel
            </button>
            <button
              className="btn-modal-save"
              type="button"
              disabled={saveState === "saving"}
              onClick={handleSave}
            >
              {saveState === "saving" ? (
                "Saving..."
              ) : saveState === "saved" ? (
                "Saved ✓"
              ) : (
                "Record Application"
              )}
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
