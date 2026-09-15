/**
 * Applications View
 * Matches stitch_applicant_tracking_kanban_dashboard design.
 * All colours via CSS variables → dark mode works automatically.
 * Supports interactive Kanban Board & Data Table views with drag-and-drop.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { safeSaveDialog as save } from "../lib/tauriBridge";
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

const KANBAN_COLUMNS: { status: Status; label: string; color: string }[] = [
  { status: "applied", label: "Applied", color: "var(--accent)" },
  { status: "screening", label: "Screening", color: "var(--warning)" },
  { status: "interview", label: "Interview", color: "#a855f7" },
  { status: "offer", label: "Offer", color: "var(--success)" },
  { status: "rejected", label: "Rejected", color: "var(--danger)" },
  { status: "ghosted", label: "Ghosted", color: "var(--text-faint)" },
];

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
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);
  const [editValues, setEditValues] = useState<FormValues | null>(null);
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<{ app: Application; slot: DocSlot } | null>(null);
  const [importing, setImporting] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<Status | null>(null);

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
        a.company,
        a.role,
        a.job_id,
        a.portal,
        a.location,
        a.notes,
        a.work_type,
        a.status,
        ...Object.values(a.extra || {}).map(String),
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
      setApps((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, status, updated_at: new Date().toISOString() } : a)),
      );
      await api.updateStatus(app.id, status);
      setNotice(`✓ Moved ${app.company} to ${status.charAt(0).toUpperCase() + status.slice(1)}`);
      setTimeout(() => setNotice(""), 3000);
      load();
    } catch (err) {
      setNotice(`Failed to update status: ${err}`);
    }
  };

  const selectRow = (app: Application) => {
    setSelectedAppId(app.id ?? null);
    setDrawerOpen(true);
    setAddingNote(false);
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
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
    } else {
      window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
    }
  };

  // ── Drag & drop handlers for Kanban ────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, status: Status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== status) setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: Status) => {
    e.preventDefault();
    setDragOverColumn(null);
    const idStr = e.dataTransfer.getData("text/plain");
    const id = Number(idStr);
    if (isNaN(id)) return;
    const app = apps.find((a) => a.id === id);
    if (app && app.status !== targetStatus) {
      await changeStatus(app, targetStatus);
    }
  };

  return (
    <div className="apps-root">
      {/* Notice Banner */}
      {notice && (
        <div className="apps-notice">
          <span>{notice}</span>
          <button
            type="button"
            style={{
              background: "transparent",
              padding: "0 0.25rem",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              fontSize: "1rem",
            }}
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
            placeholder="Search company, role, portal, location..."
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="apps-count-badge">
            {filtered.length} of {apps.length}
          </span>
        </div>

        <div className="apps-toolbar-actions">
          {/* View Toggle */}
          <div className="apps-view-toggle">
            <button
              type="button"
              className={`apps-toggle-btn${viewMode === "kanban" ? " active" : ""}`}
              onClick={() => setViewMode("kanban")}
              title="Kanban Board View"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>view_kanban</span>
              <span>Kanban</span>
            </button>
            <button
              type="button"
              className={`apps-toggle-btn${viewMode === "table" ? " active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Data Table View"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_rows</span>
              <span>Table</span>
            </button>
          </div>

          <button
            className="apps-btn primary"
            type="button"
            onClick={onNewApplication || (() => api.openPopup())}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
            New Application
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
        {apps.length === 0 ? (
          <div className="apps-table-wrap">
            <div className="apps-empty">
              <div className="apps-empty-icon material-symbols-outlined">auto_awesome</div>
              <div className="apps-empty-title">Welcome to Job Tracker!</div>
              <div className="apps-empty-sub">
                No job applications recorded yet. Add your first application, or load our realistic sample dataset to explore the full dashboard, Kanban boards, and analytics.
              </div>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
                <button
                  className="apps-btn primary"
                  type="button"
                  onClick={async () => {
                    await api.seedSampleData();
                    load();
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
                  Load 14+ Realistic Demo Applications
                </button>
                <button
                  className="apps-btn"
                  type="button"
                  onClick={onNewApplication || (() => api.openPopup())}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  Add Single Application
                </button>
              </div>
            </div>
          </div>
        ) : viewMode === "kanban" ? (
          /* ── KANBAN BOARD VIEW ── */
          <div className="apps-kanban-board">
            {KANBAN_COLUMNS.map((col) => {
              const colApps = filtered.filter((a) => (a.status || "applied") === col.status);
              const isOver = dragOverColumn === col.status;

              return (
                <div
                  key={col.status}
                  className={`kanban-col${isOver ? " drag-over" : ""}`}
                  onDragOver={(e) => handleDragOver(e, col.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.status)}
                >
                  {/* Column Header */}
                  <div className="kanban-col-header">
                    <div className="kanban-col-title-wrap">
                      <span className="kanban-col-dot" style={{ background: col.color }} />
                      <span>{col.label}</span>
                    </div>
                    <span className="kanban-col-count">{colApps.length}</span>
                  </div>

                  {/* Card List */}
                  <div className="kanban-col-cards">
                    {colApps.length === 0 ? (
                      <div className="kanban-empty-col">
                        Drop applications here
                      </div>
                    ) : (
                      colApps.map((app) => {
                        const isSelected = selectedApp?.id === app.id && drawerOpen;
                        const isRemote =
                          app.work_type === "remote" ||
                          (app.location?.toLowerCase().includes("remote") ?? false);
                        const salaryText =
                          (app.extra?.["salary_range"] as string) ||
                          (app.salary_expectation ? (app.salary_expectation.startsWith("$") ? app.salary_expectation : `$${app.salary_expectation}`) : "");

                        return (
                          <div
                            key={app.id}
                            className={`kanban-card${isSelected ? " selected" : ""}`}
                            draggable
                            onDragStart={(e) => app.id != null && handleDragStart(e, app.id)}
                            onClick={() => selectRow(app)}
                          >
                            <div className="kanban-card-top">
                              <span className="kanban-card-company">{app.company}</span>
                              {app.portal && (
                                <span style={{ fontSize: "0.6875rem", color: "var(--text-faint)", fontWeight: 500 }}>
                                  {app.portal}
                                </span>
                              )}
                            </div>

                            <div className="kanban-card-role">{app.role}</div>

                            <div className="kanban-card-meta">
                              {salaryText && (
                                <span className="kanban-card-salary">{salaryText}</span>
                              )}
                              {isRemote ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--success)", fontWeight: 600 }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--success)" }} />
                                  Remote
                                </span>
                              ) : (
                                <span>{app.location || "Onsite"}</span>
                              )}
                            </div>

                            <div className="kanban-card-bottom" onClick={(e) => e.stopPropagation()}>
                              <span>{fmtDate(app.created_at).date}</span>
                              <select
                                className={`status-pill-select ${app.status || "applied"}`}
                                style={{ transform: "scale(0.88)", transformOrigin: "right center" }}
                                value={app.status || "applied"}
                                onChange={(e) => changeStatus(app, e.target.value as Status)}
                                title="Move application stage"
                              >
                                {STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ── DATA TABLE VIEW ── */
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
                      app.work_type === "remote" ||
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
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                  <div className="drawer-meta-label">Applied Date</div>
                  <div className="drawer-meta-value">
                    {fmtDate(selectedApp.created_at).date}
                  </div>
                </div>
                <div>
                  <div className="drawer-meta-label">Salary / Comp</div>
                  <div className="drawer-meta-value">
                    {(selectedApp.extra?.["salary_range"] as string) ||
                      (selectedApp.salary_expectation
                        ? selectedApp.salary_expectation.startsWith("$")
                          ? selectedApp.salary_expectation
                          : `$${selectedApp.salary_expectation}`
                        : "—")}
                  </div>
                </div>
              </div>

              {/* Job Posting URL */}
              {selectedApp.job_url && (
                <div>
                  <div className="drawer-section-title">Job Posting Link</div>
                  <a
                    href={selectedApp.job_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "0.8125rem",
                      color: "var(--accent)",
                      wordBreak: "break-all",
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
                    {selectedApp.job_url}
                  </a>
                </div>
              )}

              {/* Custom Extra Fields */}
              {selectedApp.extra && Object.keys(selectedApp.extra).length > 0 && (
                <div>
                  <div className="drawer-section-title">Details &amp; Custom Fields</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(selectedApp.extra).map(([k, v]) => (
                      <div
                        key={k}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.8125rem",
                          padding: "0.25rem 0",
                          borderBottom: "1px dashed var(--border-subtle)",
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)", textTransform: "capitalize" }}>
                          {k.replace(/_/g, " ")}:
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <div className="drawer-section-title">Notes &amp; Timeline</div>
                {selectedApp.notes ? (
                  <div className="drawer-notes">{selectedApp.notes}</div>
                ) : (
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-faint)", fontStyle: "italic" }}>
                    No notes logged for this application yet.
                  </div>
                )}
              </div>

              {/* Quick Note Add */}
              {addingNote && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <textarea
                    placeholder="Add an update (e.g. Completed round 1, received follow-up email...)"
                    style={{
                      width: "100%",
                      minHeight: 70,
                      padding: "0.5rem",
                      fontSize: "0.8125rem",
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      color: "var(--text)",
                      outline: "none",
                      resize: "vertical",
                    }}
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
