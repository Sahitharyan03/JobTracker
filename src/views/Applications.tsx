/**
 * Applications View matching stitch_applicant_tracking_kanban_dashboard reference.
 * Provides both interactive Kanban Pipeline and Data Table views with search,
 * stage filters, document inspection, inline status transitions, edit drawer, and exports.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";
import DynamicForm from "../components/DynamicForm";
import { valuesFromApplication, type FormValues } from "../lib/form";
import DocumentViewer, { type DocSlot } from "../components/DocumentViewer";
import ImportWizard from "../components/ImportWizard";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  STATUSES,
  type Application,
  type FieldDefinition,
  type Status,
} from "../types";
import "./Applications.css";

interface Props {
  onNewApplication?: () => void;
}

const KANBAN_STAGES: { status: Status; label: string; color: string }[] =
  STATUSES.map((s: Status) => ({
    status: s,
    label: STATUS_LABELS[s],
    color: STATUS_COLORS[s],
  }));

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

export default function Applications({ onNewApplication }: Props) {
  const [apps, setApps] = useState<Application[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Application | null>(null);
  const [editValues, setEditValues] = useState<FormValues | null>(null);
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<{ app: Application; slot: DocSlot } | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    api.listApplications().then(setApps).catch((e) => setNotice(String(e)));
    api.listFields().then(setFields).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (stageFilter !== "all" && a.status !== stageFilter) return false;
      if (!q) return true;
      return [
        a.company,
        a.role,
        a.job_id,
        a.portal,
        a.location,
        a.notes,
        a.work_type,
        a.status,
        ...Object.values(a.extra).map(String),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [apps, query, stageFilter]);

  const countsByStage = useMemo(() => {
    const counts: Record<string, number> = { all: apps.length };
    for (const a of apps) {
      counts[a.status] = (counts[a.status] || 0) + 1;
    }
    return counts;
  }, [apps]);

  const changeStatus = async (app: Application, status: Status) => {
    if (app.id == null) return;
    await api.updateStatus(app.id, status);
    load();
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
    if (!window.confirm(`Delete ${app.company} — ${app.role}?`)) return;
    await api.deleteApplication(app.id);
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
      setNotice(`Exported successfully to ${path}`);
      setTimeout(() => setNotice(""), 4000);
    } catch (e) {
      setNotice(String(e));
    }
  };

  return (
    <div className="apps-container">
      {/* Top Utility Bar */}
      <div className="apps-utility-bar">
        <div className="utility-left">
          {/* Search Box */}
          <div className="search-input-wrapper">
            <span className="material-symbols-outlined search-icon">search</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search applications..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery("")}
              >
                ×
              </button>
            )}
          </div>

          <span className="count-badge">
            {filtered.length} of {apps.length}
          </span>
        </div>

        {/* Action Buttons & View Toggle */}
        <div className="utility-right">
          <button
            type="button"
            className="action-btn"
            onClick={() => setImporting(true)}
          >
            <span className="material-symbols-outlined">file_upload</span>
            Import
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => doExport("csv")}
          >
            <span className="material-symbols-outlined">download</span>
            Export CSV
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => doExport("xlsx")}
          >
            <span className="material-symbols-outlined">table_view</span>
            Export XLSX
          </button>

          <div className="view-mode-switch">
            <button
              type="button"
              className={`view-btn ${viewMode === "kanban" ? "active" : ""}`}
              onClick={() => setViewMode("kanban")}
              title="Kanban Board View"
            >
              <span className="material-symbols-outlined">view_kanban</span>
            </button>
            <button
              type="button"
              className={`view-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table View"
            >
              <span className="material-symbols-outlined">view_list</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stage Filter Pills Bar */}
      <div className="stage-filter-bar">
        <button
          type="button"
          className={`stage-pill ${stageFilter === "all" ? "active" : ""}`}
          onClick={() => setStageFilter("all")}
        >
          <span>All</span>
          <span className="stage-count">{countsByStage.all || 0}</span>
        </button>
        {KANBAN_STAGES.map((s) => (
          <button
            key={s.status}
            type="button"
            className={`stage-pill ${stageFilter === s.status ? "active" : ""}`}
            onClick={() => setStageFilter(s.status)}
          >
            <span
              className="stage-dot"
              style={{ backgroundColor: s.color }}
            ></span>
            <span>{s.label}</span>
            <span className="stage-count">{countsByStage[s.status] || 0}</span>
          </button>
        ))}
      </div>

      {notice && <div className="apps-alert-notice">{notice}</div>}

      {/* Content Area */}
      {apps.length === 0 ? (
        <div className="empty-apps-state">
          <div className="empty-icon-circle">
            <span className="material-symbols-outlined">work_outline</span>
          </div>
          <h2 className="empty-title">No applications yet</h2>
          <p className="empty-subtitle">
            Press your global hotkey anywhere or click below to log your first job application.
          </p>
          <button
            type="button"
            className="btn-empty-add"
            onClick={onNewApplication || (() => api.openPopup())}
          >
            <span className="material-symbols-outlined">add</span>
            New Application
          </button>
        </div>
      ) : viewMode === "kanban" ? (
        /* KANBAN PIPELINE VIEW */
        <div className="kanban-board">
          {KANBAN_STAGES.map((col) => {
            const stageApps = filtered.filter((a) => a.status === col.status);
            return (
              <div className="kanban-column" key={col.status}>
                <div className="column-header">
                  <div className="column-title-group">
                    <span
                      className="column-dot"
                      style={{ backgroundColor: col.color }}
                    ></span>
                    <h3 className="column-title">{col.label}</h3>
                  </div>
                  <span className="column-count-badge">{stageApps.length}</span>
                </div>

                <div className="column-cards-track">
                  {stageApps.map((app) => {
                    const initials = app.company
                      ? app.company.slice(0, 2).toUpperCase()
                      : "JT";
                    return (
                      <div className="kanban-card" key={app.id}>
                        <div className="card-top-row">
                          <div className="company-badge-box">{initials}</div>
                          <div className="company-role-group">
                            <h4 className="card-role" title={app.role}>
                              {app.role}
                            </h4>
                            <span className="card-company" title={app.company}>
                              {app.company}
                            </span>
                          </div>
                        </div>

                        {/* Badges / Meta row */}
                        <div className="card-badges-row">
                          {app.work_type && app.work_type !== "Unknown" && (
                            <span className="pill-badge pill-work">
                              {app.work_type}
                            </span>
                          )}
                          {app.portal && (
                            <span className="pill-badge pill-portal">
                              {app.portal}
                            </span>
                          )}
                          {app.salary_expectation && (
                            <span className="pill-badge pill-salary">
                              {app.salary_expectation}
                            </span>
                          )}
                          {app.location && (
                            <span className="pill-badge pill-loc" title={app.location}>
                              {app.location}
                            </span>
                          )}
                        </div>

                        {/* Card Footer: Timestamp, Docs, Actions */}
                        <div className="card-footer-row">
                          <span
                            className="card-time-ago"
                            title={formatTimestamp(app.created_at)}
                          >
                            {timeAgo(app.created_at)}
                          </span>

                          <div className="card-actions-group">
                            {/* Document indicators */}
                            {app.resume_kind && (
                              <button
                                type="button"
                                className="doc-view-btn"
                                title="View attached Resume"
                                onClick={() => setViewing({ app, slot: "resume" })}
                              >
                                R
                              </button>
                            )}
                            {app.cover_kind && (
                              <button
                                type="button"
                                className="doc-view-btn"
                                title="View attached Cover Letter"
                                onClick={() => setViewing({ app, slot: "cover" })}
                              >
                                C
                              </button>
                            )}

                            {/* Status mover select */}
                            <select
                              className="inline-status-select"
                              value={app.status}
                              onChange={(e) =>
                                changeStatus(app, e.target.value as Status)
                              }
                              title="Move stage"
                            >
                              {STATUSES.map((s: Status) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              className="card-icon-action"
                              title="Edit application"
                              onClick={() => startEdit(app)}
                            >
                              <span className="material-symbols-outlined">edit</span>
                            </button>
                            <button
                              type="button"
                              className="card-icon-action danger-hover"
                              title="Delete application"
                              onClick={() => remove(app)}
                            >
                              <span className="material-symbols-outlined">delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {stageApps.length === 0 && (
                    <div className="empty-column-placeholder">
                      <span>No jobs in {col.label.toLowerCase()}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE / LIST VIEW */
        <div className="table-card-wrapper">
          <table className="modern-apps-table">
            <thead>
              <tr>
                <th>Applied</th>
                <th>Company</th>
                <th>Role</th>
                <th>Portal</th>
                <th>Location</th>
                <th>Work Type</th>
                <th>Salary</th>
                <th>Status</th>
                <th>Docs</th>
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((app) => (
                <tr key={app.id}>
                  <td className="cell-date" title={app.created_at}>
                    {formatTimestamp(app.created_at)}
                  </td>
                  <td className="cell-company">
                    <span className="company-logo-text">
                      {app.company.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="company-name-bold">{app.company}</span>
                  </td>
                  <td className="cell-role">{app.role}</td>
                  <td>
                    <span className="cell-portal-pill">{app.portal || "—"}</span>
                  </td>
                  <td className="cell-loc">{app.location || "—"}</td>
                  <td>
                    <span className="cell-work-pill">{app.work_type || "—"}</span>
                  </td>
                  <td className="cell-salary">{app.salary_expectation || "—"}</td>
                  <td>
                    <StatusBadge
                      status={app.status}
                      onChange={(s) => changeStatus(app, s)}
                    />
                  </td>
                  <td className="cell-docs">
                    {app.resume_kind && (
                      <button
                        type="button"
                        className="doc-badge-btn"
                        title="View Resume"
                        onClick={() => setViewing({ app, slot: "resume" })}
                      >
                        R
                      </button>
                    )}
                    {app.cover_kind && (
                      <button
                        type="button"
                        className="doc-badge-btn"
                        title="View Cover Letter"
                        onClick={() => setViewing({ app, slot: "cover" })}
                      >
                        C
                      </button>
                    )}
                  </td>
                  <td className="cell-table-actions">
                    <button
                      type="button"
                      className="table-btn-edit"
                      onClick={() => startEdit(app)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="table-btn-delete"
                      onClick={() => remove(app)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewing && (
        <DocumentViewer
          app={viewing.app}
          slot={viewing.slot}
          onClose={() => setViewing(null)}
        />
      )}

      {/* Edit Slide-Over / Modal */}
      {editing && editValues && (
        <div className="edit-overlay" onClick={() => setEditing(null)}>
          <div className="edit-slide-panel" onClick={(e) => e.stopPropagation()}>
            <header className="edit-panel-header">
              <div>
                <h2 className="edit-panel-title">
                  Edit — {editing.company}
                </h2>
                <p className="edit-panel-subtitle">
                  {editing.role} · Applied {formatTimestamp(editing.created_at)}
                </p>
              </div>
              <button
                type="button"
                className="edit-close-btn"
                onClick={() => setEditing(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>

            <div className="edit-panel-body">
              <DynamicForm
                fields={fields}
                values={editValues}
                onChange={setEditValues}
              />
            </div>

            <footer className="edit-panel-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-save-edit"
                onClick={saveEdit}
              >
                Save Changes
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Import Wizard Modal */}
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
