/**
 * Attach a resume or cover letter to an entry — either paste LaTeX source
 * or pick a PDF file, matching the stitch_single_page_job_application_form reference.
 */

import { useState } from "react";
import { safeOpenDialog as open } from "../lib/tauriBridge";
import type { DocValue } from "../lib/form";
import type { DocKind } from "../types";
import "./DocumentAttach.css";

interface Props {
  label: string;
  defaultMode: DocKind;
  value: DocValue;
  onChange: (value: DocValue) => void;
}

export default function DocumentAttach({
  label,
  defaultMode,
  value,
  onChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const mode = value.kind ?? defaultMode;

  const pickPdf = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (typeof picked === "string") {
      onChange({ kind: "pdf", tex: null, pdfSource: picked });
    }
  };

  const clearDoc = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ kind: mode, tex: null, pdfSource: null });
  };

  const attached =
    value.kind === "tex"
      ? Boolean(value.tex?.trim())
      : Boolean(value.pdfSource);

  return (
    <div className={`doc-card ${expanded ? "expanded" : ""}`}>
      <header
        className="doc-header"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
      >
        <div className="doc-title-group">
          <span className={`material-symbols-outlined doc-chevron ${expanded ? "open" : ""}`}>
            expand_more
          </span>
          <span className="doc-label">{label}</span>
          {attached && <span className="doc-attached-badge">Attached</span>}
        </div>

        <div className="doc-header-actions" onClick={(e) => e.stopPropagation()}>
          {attached && (
            <button
              type="button"
              className="doc-clear-btn"
              onClick={clearDoc}
              title="Remove attachment"
            >
              Clear
            </button>
          )}
          <div className="doc-format-toggle" role="radiogroup">
            <button
              type="button"
              className={`doc-format-tab ${mode === "tex" ? "active" : ""}`}
              onClick={() => onChange({ ...value, kind: "tex", pdfSource: null })}
            >
              .tex
            </button>
            <button
              type="button"
              className={`doc-format-tab ${mode === "pdf" ? "active" : ""}`}
              onClick={() => onChange({ ...value, kind: "pdf", tex: null })}
            >
              .pdf
            </button>
          </div>
        </div>
      </header>

      {expanded && (
        <div className="doc-body">
          {mode === "tex" ? (
            <textarea
              className="doc-tex-textarea"
              placeholder={`Paste ${label} LaTeX source here...`}
              value={value.tex ?? ""}
              rows={4}
              onChange={(e) =>
                onChange({ kind: "tex", tex: e.target.value, pdfSource: null })
              }
            />
          ) : (
            <div
              className={`doc-pdf-dropzone ${value.pdfSource ? "has-file" : ""}`}
              onClick={pickPdf}
            >
              <span className="material-symbols-outlined dropzone-icon">upload_file</span>
              {value.pdfSource ? (
                <div className="dropzone-file-info">
                  <span className="dropzone-file-name" title={value.pdfSource}>
                    {value.pdfSource.split("/").pop()?.split("\\").pop()}
                  </span>
                  <span className="dropzone-file-hint">Click to change PDF</span>
                </div>
              ) : (
                <div className="dropzone-empty-info">
                  <span className="dropzone-text">Click to choose {label} PDF</span>
                  <span className="dropzone-sub">Upload PDF document up to 10MB</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
