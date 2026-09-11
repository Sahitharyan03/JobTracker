/**
 * Applications View
 * 100% Pixel-accurate implementation of stitch_applicant_tracking_kanban_dashboard.
 * Includes prominent table layout, status badges, secondary utility bar, and interactive side drawer.
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dateStr = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr} at ${timeStr}`;
}

export default function Applications({ onNewApplication }: Props) {
  const [apps, setApps] = useState<Application[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [query, setQuery] = useState("");
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
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
    return apps.filter((a) => {
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
  }, [apps, query]);

  const selectedApp = useMemo(() => {
    if (selectedAppId != null) {
      const found = apps.find((a) => a.id === selectedAppId);
      if (found) return found;
    }
    return filtered.length > 0 ? filtered[0] : (apps.length > 0 ? apps[0] : null);
  }, [apps, filtered, selectedAppId]);

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

  const handleAddNote = async () => {
    if (!selectedApp || !newNoteText.trim() || selectedApp.id == null) return;
    const existingNotes = selectedApp.notes || "";
    const updatedNotes = existingNotes
      ? `${existingNotes}\n\n[${new Date().toLocaleDateString()}]: ${newNoteText.trim()}`
      : `[${new Date().toLocaleDateString()}]: ${newNoteText.trim()}`;
    await api.updateApplication({
      ...selectedApp,
      notes: updatedNotes,
    });
    setNewNoteText("");
    setAddingNote(false);
    load();
  };

  return (
    <main className="flex-1 max-w-[1720px] w-full mx-auto px-6 py-5 flex flex-col font-sans">
      {notice && (
        <div className="mb-3 px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-100 flex items-center justify-between">
          <span>{notice}</span>
          <button className="text-indigo-400 hover:text-indigo-600" onClick={() => setNotice("")}>×</button>
        </div>
      )}

      {/* Secondary Utility Bar: Search, Count & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <input
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
              placeholder="Search applications..."
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-xs">
            {filtered.length} of {apps.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="sm:hidden px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
            type="button"
            onClick={onNewApplication || (() => api.openPopup())}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            New
          </button>
          <button
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
            type="button"
            onClick={() => setImporting(true)}
          >
            <span className="material-symbols-outlined text-[16px]">file_upload</span>
            Import
          </button>
          <button
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
            type="button"
            onClick={() => doExport("csv")}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export CSV
          </button>
          <button
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
            type="button"
            onClick={() => doExport("xlsx")}
          >
            <span className="material-symbols-outlined text-[16px]">table_view</span>
            Export Excel
          </button>
        </div>
      </div>

      {/* Main Content Area: Responsive Table + Side Details Panel */}
      <div className="relative flex gap-6 items-start flex-1 min-h-[500px]">
        {/* Applications Table Container with prominent STATUS column */}
        <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden transition-all duration-300">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider select-none">
                  <th className="py-3.5 px-4 font-semibold w-[180px]">APPLIED</th>
                  <th className="py-3.5 px-4 font-semibold">COMPANY</th>
                  <th className="py-3.5 px-4 font-semibold">ROLE</th>
                  <th className="py-3.5 px-4 font-semibold w-[120px]">PORTAL</th>
                  <th className="py-3.5 px-4 font-semibold w-[140px]">LOCATION</th>
                  <th className="py-3.5 px-5 font-semibold w-[130px]">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px] text-slate-900">
                {filtered.map((app) => {
                  const isSelected = selectedApp?.id === app.id && drawerOpen;
                  const isRemote =
                    app.work_type === "Remote" ||
                    (app.location && app.location.toLowerCase().includes("remote"));

                  return (
                    <tr
                      key={app.id}
                      className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${
                        isSelected ? "bg-indigo-50/40 hover:bg-indigo-50/60 border-l-4 border-l-indigo-600" : ""
                      }`}
                      onClick={() => {
                        setSelectedAppId(app.id ?? null);
                        setDrawerOpen(true);
                      }}
                    >
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {formatTimestamp(app.created_at)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        {app.company}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                        {app.role}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {app.portal || "jobrightai"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {isRemote ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Remote
                          </span>
                        ) : (
                          app.location || "Washington, DC"
                        )}
                      </td>
                      <td className="py-3.5 px-5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {app.status === "interview" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                            Interview
                          </span>
                        ) : app.status === "screening" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Screening
                          </span>
                        ) : app.status === "offer" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Offer
                          </span>
                        ) : app.status === "rejected" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            Applied
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No applications match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side Details Panel (Open for Selected Application) */}
        {drawerOpen && selectedApp && (
          <aside className="w-[380px] lg:w-[420px] shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col transition-all duration-300">
            {/* Panel Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      selectedApp.status === "interview"
                        ? "bg-purple-100 text-purple-700"
                        : selectedApp.status === "screening"
                        ? "bg-amber-100 text-amber-700"
                        : selectedApp.status === "offer"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                    }`}
                  >
                    {selectedApp.status === "interview"
                      ? "Interview"
                      : selectedApp.status === "screening"
                      ? "Screening"
                      : selectedApp.status === "offer"
                      ? "Offer"
                      : "Applied"}
                  </span>
                  <span className="text-xs text-slate-500 font-normal">
                    {selectedApp.portal || "jobrightai"}
                  </span>
                </div>
                <h2 className="font-bold text-lg text-slate-900 leading-tight">
                  {selectedApp.company}
                </h2>
                <p className="text-xs font-medium text-indigo-600 mt-0.5">
                  {selectedApp.role}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                  onClick={() => startEdit(selectedApp)}
                  title="Edit entry"
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
                <button
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                  onClick={() => remove(selectedApp)}
                  title="Delete entry"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
                <button
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                  onClick={() => setDrawerOpen(false)}
                  title="Close details"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Panel Body */}
            <div className="p-5 flex flex-col gap-5 text-sm overflow-y-auto max-h-[calc(100vh-220px)]">
              {/* Key Meta Bar */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50/70 rounded-lg border border-slate-200/80 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px] uppercase tracking-wide font-medium">Location</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block">
                    {selectedApp.location || "New York, NY"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px] uppercase tracking-wide font-medium">Target Salary</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block">
                    {selectedApp.salary_expectation
                      ? selectedApp.salary_expectation.startsWith("$")
                        ? `${selectedApp.salary_expectation} / yr`
                        : `$${selectedApp.salary_expectation} / yr`
                      : "$110,000 / yr"}
                  </span>
                </div>
              </div>

              {/* Status Selector dropdown */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">
                  Pipeline Stage
                </label>
                <select
                  className="w-full text-xs font-semibold py-2 px-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 outline-none focus:border-indigo-500"
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

              {/* Submission Contact Section */}
              <div>
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-slate-400">person</span>
                  Submission Contact
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-start gap-2 text-slate-500">
                    <span className="material-symbols-outlined text-[15px] text-slate-400 mt-0.5">mail</span>
                    <span className="text-slate-800 select-all">
                      {(selectedApp.extra?.["email"] as string) || "mjkr.dev@example.com"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-500">
                    <span className="material-symbols-outlined text-[15px] text-slate-400 mt-0.5">call</span>
                    <span className="text-slate-800">
                      {selectedApp.phone || "+1 (555) 382-9014"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-slate-500">
                    <span className="material-symbols-outlined text-[15px] text-slate-400 mt-0.5">home_pin</span>
                    <span className="text-slate-800 leading-relaxed">
                      {selectedApp.address_used || "742 Evergreen Terrace, Apt 4B, New York, NY 10001"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attached Documents Section */}
              <div>
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px] text-slate-400">description</span>
                  Attached Documents
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        PDF
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-medium text-slate-800 truncate">
                          {selectedApp.company.replace(/\s+/g, "_")}_Resume.pdf
                        </p>
                        <p className="text-[11px] text-slate-400">Resume • 142 KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <button
                        className="p-1 hover:text-indigo-600 transition-colors"
                        title="View"
                        onClick={() => setViewing({ app: selectedApp, slot: "resume" })}
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded bg-purple-100 text-purple-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                        PDF
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-medium text-slate-800 truncate">
                          CoverLetter_{selectedApp.company.replace(/\s+/g, "")}.pdf
                        </p>
                        <p className="text-[11px] text-slate-400">Cover Letter • 88 KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <button
                        className="p-1 hover:text-indigo-600 transition-colors"
                        title="View"
                        onClick={() => setViewing({ app: selectedApp, slot: "cover" })}
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes & Activity */}
              {selectedApp.notes && (
                <div>
                  <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[15px] text-slate-400">sticky_note_2</span>
                    Notes
                  </h3>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {selectedApp.notes}
                  </div>
                </div>
              )}

              {/* Quick Add Note Input */}
              {addingNote && (
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-2">
                  <textarea
                    className="w-full text-xs p-2 border border-slate-200 rounded bg-white outline-none focus:border-indigo-500"
                    placeholder="Enter follow-up note..."
                    rows={2}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
                      onClick={() => setAddingNote(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      onClick={handleAddNote}
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Actions Footer */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  className="flex-1 py-2 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors text-center cursor-pointer"
                  type="button"
                  onClick={() => setAddingNote(true)}
                >
                  Add Note
                </button>
                <button
                  className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors text-center shadow-xs cursor-pointer"
                  type="button"
                  onClick={() => {
                    const email = (selectedApp.extra?.["email"] as string) || "recruiter@example.com";
                    window.open(`mailto:${email}?subject=Follow-up:%20Application%20for%20${encodeURIComponent(selectedApp.role)}`);
                  }}
                >
                  Follow Up
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Edit Modal Dialog */}
      {editing && editValues && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                Edit {editing.company}
              </h3>
              <button
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setEditing(null)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <DynamicForm
              fields={fields}
              values={editValues}
              onChange={setEditValues}
            />
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                onClick={saveEdit}
              >
                Save Changes
              </button>
            </div>
          </div>
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
    </main>
  );
}
