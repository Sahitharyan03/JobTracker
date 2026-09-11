/**
 * Applications View
 * Matches stitch_applicant_tracking_kanban_dashboard design.
 * All colours via CSS variables → dark mode works automatically.
 * All buttons wired to real API / state.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import DynamicForm from "../components/DynamicForm";
import { valuesFromApplication, type FormValues } from "../lib/form";
import DocumentViewer, { type DocSlot } from "../components/DocumentViewer";
import ImportWizard from "../components/ImportWizard";
import {
  STATUSES,
  type Application,
  type FieldDefinition,
  type Status,
} from "../types";
import "./Applications.css";

interface Props {
  onNewApplication?: () => void;
}

function fmtDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill ${status}`}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "currentColor",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function Applications({ onNewApplication }: Props) {
  const [apps, setApps] = useState<Application[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [query, setQuery] = useState("");
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [editValues, setEditValues] = useState<FormValues | null>(null);
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<{ app: Application; slot: DocSlot } | null>(null);
  const [importing, setImporting] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const load = useCallback(() => {
    api.listApplications().then(setApps).catch((e) => setNotice(String(e)));
    api.listFields().then(setFields).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) =>
      [
        a.company, a.role, a.job_id, a.portal, a.location,
        a.notes, a.work_type, a.status,
        ...Object.values(a.extra).map(String),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [apps, query]);

  const selectedApp = useMemo(() => {
    if (selectedAppId != null) {
      const found = apps.find((a) => a.id === selectedAppId);
      if (found) return found;
    }
    return null;
  }, [apps, selectedAppId]);

  const changeStatus = async (app: Application, status: Status) => {
    if (app.id == null) return;
    try {
      // Optimistically update local apps state so UI reacts instantly
      setApps((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, status } : a)),
      );
      await api.updateStatus(app.id, status);
      setNotice(`✓ Status updated to ${status.charAt(0).toUpperCase() + status.slice(1)}`);
      setTimeout(() => setNotice(""), 3000);
      load();
    } catch (err) {
      setNotice(`Failed to update status: ${err}`);
    }
  };


  const startEdit = (app: Application) => {
    setEditing(app);
    setEditValues(valuesFromApplication(app));
  };

  const saveEdit = async () => {
    if (!editing || !editValues) return;
    await api.updateApplication({
      ...editing,
      ...editValues.builtin,
      extra: editValues.extra,
    } as Application);
    setEditing(null);
    setEditValues(null);
    load();
  };

  const remove = async (app: Application) => {
    if (app.id == null) return;
    if (!window.confirm(`Delete "${app.company} — ${app.role}"?\nThis cannot be undone.`)) return;
    await api.deleteApplication(app.id);
    setDrawerOpen(false);
    setSelectedAppId(null);
    load();
  };

  const doExport = async (kind: "csv" | "xlsx") => {
    const path = await save({
      defaultPath: `job-applications.${kind}`,
      filters: [
        kind === "csv"
          ? { name: "CSV", extensions: ["csv"] }
          : { name: "Excel", extensions: ["xlsx"] },
      ],
    });
    if (!path) return;
    try {
      if (kind === "csv") await api.exportCsv(path);
      else await api.exportXlsx(path);
      setNotice(`✓ Exported to ${path}`);
      setTimeout(() => setNotice(""), 4000);
    } catch (e) {
      setNotice(String(e));
    }
  };

  const handleAddNote = async () => {
    if (!selectedApp || !newNoteText.trim() || selectedApp.id == null) return;
    const existingNotes = selectedApp.notes || "";
    const ts = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const updatedNotes = existingNotes
      ? `${existingNotes}\n\n[${ts}]: ${newNoteText.trim()}`
      : `[${ts}]: ${newNoteText.trim()}`;
    await api.updateApplication({ ...selectedApp, notes: updatedNotes });
    setNewNoteText("");
    setAddingNote(false);
    load();
  };

  const handleFollowUp = (app: Application) => {
    const email = (app.extra?.["email"] as string) || "";
    const subject = encodeURIComponent(`Following Up: ${app.role} at ${app.company}`);
    const body = encodeURIComponent(
      `Hi,\n\nI wanted to follow up on my application for the ${app.role} position at ${app.company}.\n\nThank you for your time.\n\nBest regards`,
    );
    if (email) {
      window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    } else {
      // Add follow-up note instead
      setAddingNote(true);
      setNewNoteText("📧 Sent follow-up email");
    }
  };

  const selectRow = (app: Application) => {
    setSelectedAppId(app.id ?? null);
    setDrawerOpen(true);
    setAddingNote(false);
    setNewNoteText("");
  };

  return (
    <div className="apps-root">
      {/* Notice */}
      {notice && (
        <div className="apps-notice">
          <span>{notice}</span>
          <button
            type="button"
            style={{ background: "transparent", padding: "0 0.25rem", border: "none", cursor: "pointer", color: "inherit", fontSize: "1rem" }}
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="apps-toolbar">
        <div className="apps-search-wrap">
          <span className="apps-search-icon material-symbols-outlined">search</span>
          <input
            className="apps-search-input"
            placeholder="Search applications..."
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="apps-count-badge">
            {filtered.length} of {apps.length}
          </span>
        </div>

        <div className="apps-toolbar-actions">
          <button
            className="apps-btn primary"
            type="button"
            onClick={onNewApplication || (() => api.openPopup())}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
            New
          </button>
          <button
            className="apps-btn"
            type="button"
            onClick={() => setImporting(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>file_upload</span>
            Import
          </button>
          <button
            className="apps-btn"
            type="button"
            onClick={() => doExport("csv")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>download</span>
            Export CSV
          </button>
          <button
            className="apps-btn"
            type="button"
            onClick={() => doExport("xlsx")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>table_view</span>
            Export Excel
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="apps-layout">
        {/* Table */}
        <div className="apps-table-wrap">
          <div style={{ overflowX: "auto" }}>
            <table className="apps-table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>APPLIED</th>
                  <th>COMPANY</th>
                  <th>ROLE</th>
                  <th style={{ width: 120 }}>PORTAL</th>
                  <th style={{ width: 140 }}>LOCATION</th>
                  <th style={{ width: 130 }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => {
                  const isSelected = selectedApp?.id === app.id && drawerOpen;
                  const isRemote =
                    app.work_type === "Remote" ||
                    (app.location?.toLowerCase().includes("remote") ?? false);
                  const { date, time } = fmtDate(app.created_at);

                  return (
                    <tr
                      key={app.id}
                      className={isSelected ? "selected" : ""}
                      onClick={() => selectRow(app)}
                    >
                      <td>
                        <div className="apps-date-main">{date}</div>
                        {time && <div className="apps-date-time">{time}</div>}
                      </td>
                      <td>
                        <div className="apps-company">{app.company}</div>
                      </td>
                      <td>
                        <div className="apps-role">{app.role}</div>
                      </td>
                      <td>
                        <span className="apps-portal">{app.portal || "—"}</span>
                      </td>
                      <td>
                        {isRemote ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--success)", fontWeight: 600, fontSize: "0.75rem" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", display: "inline-block" }} />
                            Remote
                          </span>
                        ) : (
                          <span className="apps-location">{app.location || "—"}</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className={`status-pill-select ${app.status || "applied"}`}
                          value={app.status || "applied"}
                          onChange={(e) => changeStatus(app, e.target.value as Status)}
                          title="Change status"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="apps-empty">
                        <div className="apps-empty-icon material-symbols-outlined">inbox</div>
                        <div className="apps-empty-title">
                          {query ? "No applications match your search" : "No applications yet"}
                        </div>
                        <div className="apps-empty-sub">
                          {query ? 'Try a different search term' : 'Click "New Application" to get started'}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Drawer */}
        {drawerOpen && selectedApp && (
          <aside className="apps-drawer">
            {/* Header */}
            <div className="drawer-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <StatusPill status={selectedApp.status || "applied"} />
                  {selectedApp.portal && (
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-faint)", fontWeight: 500 }}>
                      {selectedApp.portal}
                    </span>
                  )}
                </div>
                <div className="drawer-company">{selectedApp.company}</div>
                <div className="drawer-role">{selectedApp.role}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  className="drawer-icon-btn"
                  onClick={() => startEdit(selectedApp)}
                  title="Edit entry"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                </button>
                <button
                  className="drawer-icon-btn danger"
                  onClick={() => remove(selectedApp)}
                  title="Delete entry"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                </button>
                <button
                  className="drawer-icon-btn"
                  onClick={() => { setDrawerOpen(false); setSelectedAppId(null); }}
                  title="Close"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="drawer-body">
              {/* Meta grid */}
              <div className="drawer-meta-grid">
                <div>
                  <div className="drawer-meta-label">Location</div>
                  <div className="drawer-meta-value">
                    {selectedApp.location || "—"}
                  </div>
                </div>
                <div>
                  <div className="drawer-meta-label">Job ID</div>
                  <div className="drawer-meta-value">
                    {selectedApp.job_id || "—"}
                  </div>
                </div>
                <div>
                  <div className="drawer-meta-label">Applied</div>
                  <div className="drawer-meta-value">
                    {fmtDate(selectedApp.created_at).date}
                  </div>
                </div>
                <div>
                  <div className="drawer-meta-label">Salary Ask</div>
                  <div className="drawer-meta-value">
                    {selectedApp.salary_expectation
                      ? selectedApp.salary_expectation.startsWith("$")
                        ? selectedApp.salary_expectation
                        : `$${selectedApp.salary_expectation}`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* Pipeline Stage */}
              <div>
                <span className="drawer-stage-label">Pipeline Stage</span>
                <select
                  className="drawer-stage-select"
                  value={selectedApp.status}
                  onChange={(e) => changeStatus(selectedApp, e.target.value as Status)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contact */}
              <div>
                <div className="drawer-section-title">
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>person</span>
                  Submission Info
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(selectedApp.extra?.["email"] as string) && (
                    <div className="drawer-contact-row">
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: "var(--text-faint)", marginTop: 2 }}>mail</span>
                      <span className="val">{selectedApp.extra?.["email"] as string}</span>
                    </div>
                  )}
                  {selectedApp.phone && (
                    <div className="drawer-contact-row">
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: "var(--text-faint)", marginTop: 2 }}>call</span>
                      <span className="val">{selectedApp.phone}</span>
                    </div>
                  )}
                  {selectedApp.address_used && (
                    <div className="drawer-contact-row">
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: "var(--text-faint)", marginTop: 2 }}>home_pin</span>
                      <span className="val">{selectedApp.address_used}</span>
                    </div>
                  )}
                  {!selectedApp.phone && !selectedApp.address_used && !(selectedApp.extra?.["email"] as string) && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>No contact info recorded</span>
                  )}
                </div>
              </div>

              {/* Documents */}
              <div>
                <div className="drawer-section-title">
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>description</span>
                  Attached Documents
                </div>
                {selectedApp.resume_path || selectedApp.cover_path ? (
                  <div>
                    {selectedApp.resume_path && (
                      <div className="drawer-doc-card">
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div className="drawer-doc-badge resume">PDF</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="drawer-doc-name">
                              {selectedApp.company.replace(/\s+/g, "_")}_Resume.pdf
                            </div>
                            <div className="drawer-doc-sub">Resume</div>
                          </div>
                        </div>
                        <button
                          className="drawer-icon-btn"
                          title="View resume"
                          onClick={() => setViewing({ app: selectedApp, slot: "resume" })}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
                        </button>
                      </div>
                    )}
                    {selectedApp.cover_path && (
                      <div className="drawer-doc-card">
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div className="drawer-doc-badge cover">PDF</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="drawer-doc-name">
                              CoverLetter_{selectedApp.company.replace(/\s+/g, "")}.pdf
                            </div>
                            <div className="drawer-doc-sub">Cover Letter</div>
                          </div>
                        </div>
                        <button
                          className="drawer-icon-btn"
                          title="View cover letter"
                          onClick={() => setViewing({ app: selectedApp, slot: "cover" })}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>No documents attached</span>
                )}
              </div>

              {/* Notes */}
              {selectedApp.notes && (
                <div>
                  <div className="drawer-section-title">
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>sticky_note_2</span>
                    Notes
                  </div>
                  <div className="drawer-notes-box">{selectedApp.notes}</div>
                </div>
              )}

              {/* Inline note editor */}
              {addingNote && (
                <div className="drawer-add-note-area">
                  <textarea
                    className="drawer-add-note-textarea"
                    placeholder="Type your note..."
                    rows={3}
                    value={newNoteText}
                    autoFocus
                    onChange={(e) => setNewNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote();
                      if (e.key === "Escape") setAddingNote(false);
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button
                      type="button"
                      className="apps-btn"
                      style={{ padding: "0.3rem 0.75rem" }}
                      onClick={() => { setAddingNote(false); setNewNoteText(""); }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="apps-btn primary"
                      style={{ padding: "0.3rem 0.75rem" }}
                      onClick={handleAddNote}
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="drawer-footer">
              <button
                className="drawer-action-btn"
                type="button"
                onClick={() => { setAddingNote(true); setNewNoteText(""); }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle" }}>add</span>{" "}
                Add Note
              </button>
              <button
                className="drawer-action-btn accent"
                type="button"
                onClick={() => handleFollowUp(selectedApp)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle" }}>forward_to_inbox</span>{" "}
                Follow Up
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Edit Modal */}
      {editing && editValues && (
        <div className="edit-modal-overlay" onClick={() => setEditing(null)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-modal-header">
              <span className="edit-modal-title">
                Edit — {editing.company} / {editing.role}
              </span>
              <button className="drawer-icon-btn" onClick={() => setEditing(null)}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div className="edit-modal-body">
              <DynamicForm
                fields={fields}
                values={editValues}
                onChange={setEditValues}
              />
            </div>
            <div className="edit-modal-footer">
              <button className="apps-btn" type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="apps-btn primary" type="button" onClick={saveEdit}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer */}
      {viewing && (
        <DocumentViewer
          app={viewing.app}
          slot={viewing.slot}
          onClose={() => setViewing(null)}
        />
      )}

      {/* Import Wizard */}
      {importing && (
        <ImportWizard
          fields={fields}
          existingApps={apps}
          onFieldsChanged={load}
          onImported={load}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}
