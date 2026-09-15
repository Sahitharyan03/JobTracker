/**
 * Interactive import wizard: pick a CSV/Excel file, map its columns to
 * Job Tracker's fields (including the date, since imported rows are
 * historical), resolve anything that looks like a duplicate row by row,
 * then import. Works equally for restoring your own export or bringing
 * in an old spreadsheet with completely different column names.
 */

import { useMemo, useState } from "react";
import { safeOpenDialog as open } from "../lib/tauriBridge";
import { api } from "../api";
import {
  buildImportRow,
  builtinTargetOptions,
  findDuplicate,
  suggestTarget,
  type ColumnMapping,
  type MappingTarget,
} from "../lib/importMapping";
import { dayKey } from "../lib/analytics";
import type {
  Application,
  FieldDefinition,
  ImportRow,
  ImportSummary,
  ParsedTable,
} from "../types";
import "./ImportWizard.css";

type Step = "pick" | "map" | "review" | "done";
type RowAction = "add" | "skip" | "replace";

interface ReviewRow {
  row: ImportRow;
  dateOk: boolean;
  dateOverride: string;
  duplicateOf: Application | null;
  action: RowAction;
}

/**
 * Encode a mapping target to match the <option value> it corresponds to
 * in the dropdown below. Builtin options are bare keys (value="company");
 * only custom fields carry a "custom:" prefix — the two must stay in
 * sync or the <select> can't find a matching option and silently shows
 * whatever option happens to be first, masking every selection.
 */
function targetKey(target: MappingTarget): string {
  if (target.kind === "custom") return `custom:${target.key}`;
  if (target.kind === "builtin") return target.key;
  return target.kind;
}

interface Props {
  fields: FieldDefinition[];
  existingApps: Application[];
  onFieldsChanged: () => void;
  onImported: () => void;
  onClose: () => void;
}

export default function ImportWizard({
  fields,
  existingApps,
  onFieldsChanged,
  onImported,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [dateFormat, setDateFormat] = useState<"auto" | "mdy" | "dmy" | "ymd">("auto");
  const [customFields, setCustomFields] = useState<FieldDefinition[]>(fields);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const customFieldChoices = useMemo(
    () => customFields.filter((f) => !f.builtin),
    [customFields],
  );

  const pickFile = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: "Spreadsheet", extensions: ["csv", "xlsx", "xls", "ods"] }],
    });
    if (typeof picked !== "string") return;
    setBusy(true);
    setError("");
    try {
      const parsed = await api.parseImportFile(picked);
      if (parsed.headers.length === 0) throw new Error("The file appears to have no columns.");
      setTable(parsed);
      setMappings(
        parsed.headers.map((header, i) => ({
          sourceIndex: i,
          sourceHeader: header,
          target: suggestTarget(header, customFieldChoices),
        })),
      );
      setStep("map");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const updateMapping = async (index: number, value: string) => {
    if (value === "__new__") {
      const label = window.prompt("Name for the new field:");
      if (!label?.trim()) return;
      const key = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "field";
      if (customFields.some((f) => f.key === key)) {
        setError("A field with that name already exists.");
        return;
      }
      const updated = [
        ...customFields,
        {
          id: null,
          key,
          label: label.trim(),
          field_type: "text" as const,
          options: null,
          required: false,
          sort_order: customFields.length,
          visible: true,
          builtin: false,
        },
      ];
      try {
        await api.saveFields(updated);
        setCustomFields(updated);
        onFieldsChanged();
        setMappings((prev) =>
          prev.map((m, i) => (i === index ? { ...m, target: { kind: "custom", key } } : m)),
        );
      } catch (e) {
        setError(String(e));
      }
      return;
    }

    const target: MappingTarget =
      value === "date"
        ? { kind: "date" }
        : value === "resume_path"
          ? { kind: "resume_path" }
          : value === "cover_path"
            ? { kind: "cover_path" }
            : value === "ignore"
              ? { kind: "ignore" }
              : value.startsWith("custom:")
                ? { kind: "custom", key: value.slice(7) }
                : { kind: "builtin", key: value as never };

    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, target } : m)));
  };

  const buildReview = () => {
    if (!table) return;
    const today = dayKey(new Date());
    const built: ReviewRow[] = table.rows.map((sourceRow) => {
      const { row, dateOk } = buildImportRow(sourceRow, mappings, dateFormat, today);
      const duplicateOf = findDuplicate(row, existingApps)?.existing ?? null;
      return {
        row,
        dateOk,
        dateOverride: row.created_at.slice(0, 10),
        duplicateOf,
        action: duplicateOf ? "skip" : "add",
      };
    });
    setReviewRows(built);
    setStep("review");
  };

  const hasDateMapping = mappings.some((m) => m.target.kind === "date");
  const duplicateCount = reviewRows.filter((r) => r.duplicateOf).length;
  const willImportCount = reviewRows.filter((r) => r.action !== "skip").length;

  const runImport = async () => {
    setBusy(true);
    setError("");
    try {
      const payload: ImportRow[] = reviewRows
        .filter((r) => r.action !== "skip")
        .map((r) => ({
          ...r.row,
          created_at: `${r.dateOverride}T12:00:00`,
          replace_id: r.action === "replace" ? r.duplicateOf?.id ?? undefined : undefined,
        }));
      const result = await api.importApplications(payload);
      setSummary(result);
      setStep("done");
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="import-overlay" onClick={onClose}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <header className="import-header">
          <h2>Import applications</h2>
          <button onClick={onClose} className="import-close">×</button>
        </header>

        {step === "pick" && (
          <div className="import-body">
            <p className="import-help">
              Bring in old applications from a spreadsheet — your own
              exported CSV/Excel, or a completely different file like an old
              Numbers/Excel tracker. You'll match its columns to Job
              Tracker's fields next.
            </p>
            <button className="primary" onClick={pickFile} disabled={busy}>
              {busy ? "Reading file…" : "Choose file…"}
            </button>
            {error && <p className="import-error">{error}</p>}
          </div>
        )}

        {step === "map" && table && (
          <div className="import-body">
            <p className="import-help">
              Match each column to a Job Tracker field. A date column is
              required — imported entries keep their real application date.
            </p>
            <div className="import-date-format">
              <label>Date format in this file</label>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}
              >
                <option value="auto">Auto-detect</option>
                <option value="mdy">Month/Day/Year</option>
                <option value="dmy">Day/Month/Year</option>
                <option value="ymd">Year/Month/Day</option>
              </select>
            </div>
            <div className="import-mapping-table">
              <div className="import-mapping-row import-mapping-head">
                <span>Your column</span>
                <span>Sample value</span>
                <span>Maps to</span>
              </div>
              {mappings.map((m, i) => (
                <div className="import-mapping-row" key={m.sourceIndex}>
                  <span className="import-col-name">{m.sourceHeader || `Column ${i + 1}`}</span>
                  <span className="import-col-sample">
                    {table.rows[0]?.[m.sourceIndex] || "—"}
                  </span>
                  <select
                    value={targetKey(m.target)}
                    onChange={(e) => updateMapping(i, e.target.value)}
                  >
                    <option value="ignore">Ignore this column</option>
                    <option value="date">Date Applied</option>
                    {builtinTargetOptions().map((b) => (
                      <option key={b.key} value={b.key}>
                        {b.label}
                      </option>
                    ))}
                    {customFieldChoices.map((f) => (
                      <option key={f.key} value={`custom:${f.key}`}>
                        {f.label}
                      </option>
                    ))}
                    <option value="resume_path">Resume (file path)</option>
                    <option value="cover_path">Cover Letter (file path)</option>
                    <option value="__new__">+ Create new field…</option>
                  </select>
                </div>
              ))}
            </div>
            {!hasDateMapping && (
              <p className="import-warning">
                No column mapped to Date Applied — rows without a valid date
                will use today's date instead.
              </p>
            )}
            {error && <p className="import-error">{error}</p>}
            <div className="import-actions">
              <button onClick={() => setStep("pick")}>Back</button>
              <button className="primary" onClick={buildReview}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="import-body">
            <p className="import-help">
              {reviewRows.length} row{reviewRows.length === 1 ? "" : "s"} parsed
              {duplicateCount > 0 &&
                ` · ${duplicateCount} look${duplicateCount === 1 ? "s" : ""} like a possible duplicate — choose what to do with each`}
            </p>
            <div className="import-review-table">
              <div className="import-review-row import-review-head">
                <span>Company / Role</span>
                <span>Date</span>
                <span>Status</span>
                <span>Action</span>
              </div>
              {reviewRows.map((r, i) => (
                <div
                  className={`import-review-row ${r.duplicateOf ? "flagged" : ""}`}
                  key={i}
                >
                  <span className="import-review-name">
                    {r.row.company || "(no company)"}
                    {r.row.role && ` — ${r.row.role}`}
                    {r.duplicateOf && (
                      <span className="import-dup-note">
                        possibly matches an existing entry from{" "}
                        {r.duplicateOf.created_at.slice(0, 10)}
                      </span>
                    )}
                  </span>
                  <span>
                    {r.dateOk ? (
                      r.dateOverride
                    ) : (
                      <input
                        type="date"
                        value={r.dateOverride}
                        onChange={(e) =>
                          setReviewRows((prev) =>
                            prev.map((row, j) =>
                              j === i ? { ...row, dateOverride: e.target.value, dateOk: true } : row,
                            ),
                          )
                        }
                      />
                    )}
                    {!r.dateOk && <span className="import-date-warning">unparsed</span>}
                  </span>
                  <span>{r.row.status ?? "applied"}</span>
                  <span>
                    {r.duplicateOf ? (
                      <select
                        value={r.action}
                        onChange={(e) =>
                          setReviewRows((prev) =>
                            prev.map((row, j) =>
                              j === i ? { ...row, action: e.target.value as RowAction } : row,
                            ),
                          )
                        }
                      >
                        <option value="skip">Skip</option>
                        <option value="add">Add anyway (new entry)</option>
                        <option value="replace">Replace existing</option>
                      </select>
                    ) : (
                      <span className="import-new-badge">New</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {error && <p className="import-error">{error}</p>}
            <div className="import-actions">
              <button onClick={() => setStep("map")}>Back</button>
              <button className="primary" onClick={runImport} disabled={busy}>
                {busy ? "Importing…" : `Import ${willImportCount} application${willImportCount === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}

        {step === "done" && summary && (
          <div className="import-body">
            <h3>Import complete</h3>
            <p className="import-help">
              {summary.inserted} added, {summary.replaced} replaced
              {summary.errors.length > 0 && `, ${summary.errors.length} failed`}.
            </p>
            {summary.errors.length > 0 && (
              <ul className="import-error-list">
                {summary.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <div className="import-actions">
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
