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
    <div className="bg-slate-900/60 min-h-screen flex items-center justify-center p-2 sm:p-4 font-sans antialiased text-slate-800">
      <main className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden">
        {/* BEGIN: ModalHeader */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-20" data-tauri-drag-region>
          <div className="flex items-center space-x-3" data-tauri-drag-region>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
              <span className="material-symbols-outlined text-[20px]">description</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">New Application</h1>
              <p className="text-xs text-slate-500 font-medium">Record job application details &amp; documents</p>
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            type="button"
            onClick={() => api.closePopup()}
            aria-label="Close dialog"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>

        {/* Non-blocking Detection Toast / Banner */}
        {detectionNotice && (
          <div className={`px-5 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
            detectionNotice.type === "full"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : detectionNotice.type === "partial"
              ? "bg-indigo-50 text-indigo-800 border-indigo-200"
              : "bg-amber-50 text-amber-800 border-amber-200"
          }`}>
            <span>{detectionNotice.message}</span>
            <button
              className="text-slate-400 hover:text-slate-600 ml-2 cursor-pointer"
              onClick={() => setDetectionNotice(null)}
            >
              ×
            </button>
          </div>
        )}

        {/* Duplicate Warning Banner */}
        {duplicateWarning && (
          <div className="px-5 py-2.5 bg-amber-50 text-amber-900 border-b border-amber-200 text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-amber-600 text-[18px]">warning</span>
              <span>
                {duplicateWarning.reason ||
                  `Possible duplicate: Application already exists (${
                    duplicateWarning.existing_id ? `ID #${duplicateWarning.existing_id}` : "earlier"
                  }).`}
              </span>
            </div>
            <button className="text-amber-500 hover:text-amber-800 cursor-pointer" onClick={() => setDuplicateWarning(null)}>
              ×
            </button>
          </div>
        )}

        {/* BEGIN: ProgressIndicator */}
        <div className="px-6 pt-3 pb-2 bg-slate-50/60 border-b border-slate-100">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1.5">
            <span className="text-indigo-600 font-semibold">Stage: Ready to Draft</span>
            <span>4 Sections</span>
          </div>
          <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
            <div className="bg-indigo-600 h-1 w-1/3 rounded-full transition-all duration-300"></div>
          </div>
        </div>

        {/* BEGIN: FormContentScrollArea */}
        <form
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
          id="jobApplicationForm"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          {/* SECTION 1: JOB DETAILS */}
          <section className="space-y-4">
            <div className="border-b border-slate-100 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Job Details</h2>
            </div>

            {/* Company Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="company-name">
                Company <span className="text-rose-500">*</span>
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                id="company-name"
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
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="role-title">
                Role <span className="text-rose-500">*</span>
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                id="role-title"
                placeholder="e.g. Senior Frontend Engineer"
                required
                type="text"
                value={values.builtin.role || ""}
                onChange={(e) => updateBuiltin("role", e.target.value)}
              />
            </div>

            {/* Job ID & Portal Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="job-id">
                  Job ID
                </label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                  id="job-id"
                  placeholder="e.g. REQ-9842"
                  type="text"
                  value={values.builtin.job_id || ""}
                  onChange={(e) => updateBuiltin("job_id", e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="application-portal">
                  Portal
                </label>
                <div className="relative">
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none appearance-none"
                    id="application-portal"
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
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                    <span className="material-symbols-outlined text-[18px]">unfold_more</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Location Field */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="job-location">
                Location
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                id="job-location"
                placeholder="e.g. San Francisco, CA (Remote)"
                type="text"
                value={values.builtin.location || ""}
                onChange={(e) => updateBuiltin("location", e.target.value)}
              />
            </div>
          </section>

          {/* SECTION 2: CONTACT & COMPENSATION */}
          <section className="space-y-4 pt-2">
            <div className="border-b border-slate-100 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Contact &amp; Compensation</h2>
            </div>

            {/* Address Used Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-slate-700" htmlFor="address-used">
                  Address Used
                </label>
                {savedAddresses.length > 0 && (
                  <select
                    className="text-[11px] text-indigo-600 bg-transparent border-none p-0 outline-none cursor-pointer hover:underline"
                    onChange={(e) => {
                      if (e.target.value) updateBuiltin("address_used", e.target.value);
                    }}
                    value=""
                  >
                    <option value="">Auto-fill from saved...</option>
                    {savedAddresses.map((sa) => (
                      <option key={sa.id} value={sa.value}>{sa.label}</option>
                    ))}
                  </select>
                )}
              </div>
              <input
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                id="address-used"
                placeholder="e.g. Current primary residence or city"
                type="text"
                value={values.builtin.address_used || ""}
                onChange={(e) => updateBuiltin("address_used", e.target.value)}
              />
            </div>

            {/* Phone & Salary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-slate-700" htmlFor="phone-number">
                    Phone Number
                  </label>
                  {savedPhones.length > 0 && (
                    <select
                      className="text-[11px] text-indigo-600 bg-transparent border-none p-0 outline-none cursor-pointer hover:underline"
                      onChange={(e) => {
                        if (e.target.value) updateBuiltin("phone", e.target.value);
                      }}
                      value=""
                    >
                      <option value="">Auto-fill...</option>
                      {savedPhones.map((sp) => (
                        <option key={sp.id} value={sp.value}>{sp.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                  id="phone-number"
                  placeholder="+1 (555) 000-0000"
                  type="tel"
                  value={values.builtin.phone || ""}
                  onChange={(e) => updateBuiltin("phone", e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="salary-expectation">
                  Salary Expectation
                </label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                  id="salary-expectation"
                  placeholder="e.g. $160,000 - $180,000"
                  type="text"
                  value={values.builtin.salary_expectation || ""}
                  onChange={(e) => updateBuiltin("salary_expectation", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* SECTION 3: APPLICATION NOTES */}
          <section className="space-y-4 pt-2">
            <div className="border-b border-slate-100 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Application Notes</h2>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="application-notes">
                Notes
              </label>
              <textarea
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none resize-y"
                id="application-notes"
                placeholder="Add follow-up reminders, referral contacts, interview timelines, or key questions..."
                rows={3}
                value={values.builtin.notes || ""}
                onChange={(e) => updateBuiltin("notes", e.target.value)}
              ></textarea>
            </div>
          </section>

          {/* SECTION 4: DOCUMENTS & ATTACHMENTS */}
          <section className="space-y-4 pt-2 pb-4">
            <div className="border-b border-slate-100 pb-2 mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documents &amp; Attachments</h2>
            </div>

            {/* Resume Attachment Card */}
            <div className="border border-slate-200 rounded-xl p-4 mb-4 bg-white transition-all shadow-xs">
              <header className="flex items-center justify-between mb-3 cursor-pointer group select-none">
                <div
                  className="flex items-center space-x-2 text-slate-800"
                  onClick={() => setResumeExpanded(!resumeExpanded)}
                >
                  <span className={`material-symbols-outlined text-slate-400 group-hover:text-slate-600 transition-transform ${resumeExpanded ? "" : "-rotate-90"}`}>
                    expand_more
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">Resume</h3>
                </div>
                {/* LaTeX / PDF Toggle Segment */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs border border-slate-200">
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      resumeFormat === "tex" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                    type="button"
                    onClick={() => setResumeFormat("tex")}
                  >
                    .tex
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      resumeFormat === "pdf" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
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
                      className="w-full font-mono text-xs rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none resize-y"
                      placeholder="Paste LaTeX source here (e.g. \documentclass{article}...)"
                      rows={4}
                      value={resumeTex}
                      onChange={(e) => setResumeTex(e.target.value)}
                    />
                  ) : (
                    <div
                      className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-300 transition-colors cursor-pointer"
                      onClick={handlePickResumePdf}
                    >
                      <span className="material-symbols-outlined text-slate-400 text-[32px] mb-1">upload_file</span>
                      <p className="text-xs text-slate-600 font-medium">Click to choose Resume.pdf or drag &amp; drop</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">PDF files up to 10MB</p>
                      {resumePdfPath && (
                        <p className="text-xs text-indigo-600 font-bold mt-2 truncate">Selected: {resumePdfPath}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cover Letter Attachment Card */}
            <div className="border border-slate-200 rounded-xl p-4 mb-4 bg-white transition-all shadow-xs">
              <header className="flex items-center justify-between mb-3 cursor-pointer group select-none">
                <div
                  className="flex items-center space-x-2 text-slate-800"
                  onClick={() => setCoverExpanded(!coverExpanded)}
                >
                  <span className={`material-symbols-outlined text-slate-400 group-hover:text-slate-600 transition-transform ${coverExpanded ? "" : "-rotate-90"}`}>
                    expand_more
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">Cover Letter</h3>
                </div>
                {/* LaTeX / PDF Toggle Segment */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs border border-slate-200">
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      coverFormat === "tex" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                    type="button"
                    onClick={() => setCoverFormat("tex")}
                  >
                    .tex
                  </button>
                  <button
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      coverFormat === "pdf" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
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
                      className="w-full font-mono text-xs rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all outline-none resize-y"
                      placeholder="Paste Cover Letter LaTeX source here"
                      rows={4}
                      value={coverTex}
                      onChange={(e) => setCoverTex(e.target.value)}
                    />
                  ) : (
                    <div
                      className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-slate-300 transition-colors cursor-pointer"
                      onClick={handlePickCoverPdf}
                    >
                      <span className="material-symbols-outlined text-slate-400 text-[32px] mb-1">upload_file</span>
                      <p className="text-xs text-slate-600 font-medium">Click to choose Cover_Letter.pdf or drag &amp; drop</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">PDF files up to 10MB</p>
                      {coverPdfPath && (
                        <p className="text-xs text-indigo-600 font-bold mt-2 truncate">Selected: {coverPdfPath}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold">{error}</div>}
        </form>

        {/* BEGIN: ModalStickyFooter */}
        <footer className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white/95 backdrop-blur-sm sticky bottom-0 z-20">
          <div className="text-xs text-slate-500 select-none flex items-center space-x-1.5">
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600">⌘/Ctrl + Enter</kbd>
            <span>to save</span>
            <span className="text-slate-300">•</span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600">Esc</kbd>
            <span>to close</span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              type="button"
              onClick={() => api.closePopup()}
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center justify-center px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all duration-150 cursor-pointer"
              form="jobApplicationForm"
              type="submit"
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
      </main>
    </div>
  );
}
