import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { open as tauriOpen, save as tauriSave, type OpenDialogOptions, type SaveDialogOptions } from "@tauri-apps/plugin-dialog";
import { openPath as tauriOpenPath } from "@tauri-apps/plugin-opener";
import {
  INITIAL_APPLICATIONS,
  INITIAL_FIELDS,
  INITIAL_REUSABLE_VALUES,
  INITIAL_STATUS_EVENTS,
} from "./mockData";
import type {
  AnomalyNote,
  Application,
  CaptureSummary,
  DuplicateCheckResult,
  FieldDefinition,
  ImportRow,
  ImportSummary,
  ParsedTable,
  ReusableValue,
  Status,
  StatusEvent,
} from "../types";

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

// ── Web / Demo localStorage Store ───────────────────────────────────────────
const STORAGE_PREFIX = "jt_demo_";

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors in demo mode
  }
}

class DemoStore {
  get applications(): Application[] {
    return getStored<Application[]>("applications", INITIAL_APPLICATIONS);
  }
  set applications(val: Application[]) {
    setStored("applications", val);
  }

  get fields(): FieldDefinition[] {
    return getStored<FieldDefinition[]>("fields", INITIAL_FIELDS);
  }
  set fields(val: FieldDefinition[]) {
    setStored("fields", val);
  }

  get reusableValues(): ReusableValue[] {
    return getStored<ReusableValue[]>("reusable_values", INITIAL_REUSABLE_VALUES);
  }
  set reusableValues(val: ReusableValue[]) {
    setStored("reusable_values", val);
  }

  get statusEvents(): Record<number, StatusEvent[]> {
    return getStored<Record<number, StatusEvent[]>>("status_events", INITIAL_STATUS_EVENTS);
  }
  set statusEvents(val: Record<number, StatusEvent[]>) {
    setStored("status_events", val);
  }

  get settings(): Record<string, string> {
    return getStored<Record<string, string>>("settings", {
      doc_mode: "tex",
      hotkey_add: "Alt+Shift+J",
      hotkey_dashboard: "Alt+Shift+D",
      theme: "light",
      token: "jt_demo_token_88921",
    });
  }
  set settings(val: Record<string, string>) {
    setStored("settings", val);
  }

  get anomalyNotes(): AnomalyNote[] {
    return getStored<AnomalyNote[]>("anomaly_notes", []);
  }
  set anomalyNotes(val: AnomalyNote[]) {
    setStored("anomaly_notes", val);
  }

  get latestCapture(): CaptureSummary | null {
    return getStored<CaptureSummary | null>("latest_capture", null);
  }
  set latestCapture(val: CaptureSummary | null) {
    setStored("latest_capture", val);
  }

  reset() {
    this.applications = INITIAL_APPLICATIONS;
    this.fields = INITIAL_FIELDS;
    this.reusableValues = INITIAL_REUSABLE_VALUES;
    this.statusEvents = INITIAL_STATUS_EVENTS;
    this.anomalyNotes = [];
    this.latestCapture = null;
  }
}

export const demoStore = new DemoStore();

// Initialize demo store if empty
if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_PREFIX + "initialized")) {
  demoStore.reset();
  localStorage.setItem(STORAGE_PREFIX + "initialized", "true");
}

// ── Safe Tauri Invocation with Demo Fallback ────────────────────────────────
export async function safeInvoke<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  if (isTauri()) {
    try {
      return await tauriInvoke<T>(cmd, args);
    } catch (err) {
      console.warn(`Tauri invoke error on ${cmd}:`, err);
      throw err;
    }
  }

  // ── Web / Non-Tauri fallback emulation ───────────────────────────────────
  return emulateCommand<T>(cmd, args);
}

function emulateCommand<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  switch (cmd) {
    case "get_setup_state": {
      return Promise.resolve({
        ready: true,
        data_dir: "/Users/demo/JobTracker",
      } as unknown as T);
    }

    case "set_data_dir": {
      return Promise.resolve(undefined as unknown as T);
    }

    case "get_settings": {
      return Promise.resolve(demoStore.settings as unknown as T);
    }

    case "set_setting": {
      const { key, value } = args || {};
      const current = demoStore.settings;
      current[key] = value;
      demoStore.settings = current;
      return Promise.resolve(undefined as unknown as T);
    }

    case "list_fields": {
      return Promise.resolve(demoStore.fields as unknown as T);
    }

    case "save_fields": {
      const { fields } = args || {};
      demoStore.fields = fields || [];
      return Promise.resolve(undefined as unknown as T);
    }

    case "list_applications": {
      return Promise.resolve(demoStore.applications as unknown as T);
    }

    case "create_application": {
      const { app } = args || {};
      const list = demoStore.applications;
      const nextId = Math.max(0, ...list.map((a) => a.id ?? 0)) + 1;
      const now = new Date().toISOString();
      const newApp: Application = {
        id: nextId,
        company: app?.company || "New Company",
        role: app?.role || "Software Engineer",
        portal: app?.portal || "Direct",
        job_url: app?.job_url || "",
        job_id: app?.job_id || "",
        location: app?.location || "Remote",
        work_type: app?.work_type || "Remote",
        address_used: app?.address_used || "",
        phone: app?.phone || "",
        salary_expectation: app?.salary_expectation || "",
        status: (app?.status as Status) || "applied",
        notes: app?.notes || "",
        job_description: app?.job_description || "",
        resume_kind: app?.resume_kind || null,
        resume_tex: app?.resume_tex || null,
        resume_path: app?.resume_path || null,
        cover_kind: app?.cover_kind || null,
        cover_tex: app?.cover_tex || null,
        cover_path: app?.cover_path || null,
        captured_at: app?.captured_at || now,
        extra: app?.extra || {},
        created_at: app?.created_at || now,
      };
      demoStore.applications = [newApp, ...list];

      // Add status event
      const events = demoStore.statusEvents;
      events[nextId] = [
        {
          status: newApp.status,
          changed_at: now,
        },
      ];
      demoStore.statusEvents = events;

      return Promise.resolve(nextId as unknown as T);
    }

    case "update_status": {
      const { id, status } = args || {};
      const list = demoStore.applications;
      const app = list.find((a) => a.id === id);
      if (app) {
        app.status = status;
        demoStore.applications = [...list];

        const events = demoStore.statusEvents;
        const appEvents = events[id] || [];
        appEvents.push({
          status,
          changed_at: new Date().toISOString(),
        });
        events[id] = appEvents;
        demoStore.statusEvents = events;
      }
      return Promise.resolve(undefined as unknown as T);
    }

    case "update_application": {
      const { app } = args || {};
      if (app && app.id != null) {
        const list = demoStore.applications;
        const idx = list.findIndex((a) => a.id === app.id);
        if (idx !== -1) {
          list[idx] = { ...app };
          demoStore.applications = [...list];
        }
      }
      return Promise.resolve(undefined as unknown as T);
    }

    case "delete_application": {
      const { id } = args || {};
      demoStore.applications = demoStore.applications.filter((a) => a.id !== id);
      return Promise.resolve(undefined as unknown as T);
    }

    case "list_status_events": {
      const { id } = args || {};
      const events = demoStore.statusEvents[id] || [];
      return Promise.resolve(events as unknown as T);
    }

    case "check_duplicate_application": {
      const { company, role } = args || {};
      const existing = demoStore.applications.find(
        (a) =>
          a.company.toLowerCase() === (company || "").toLowerCase() &&
          a.role.toLowerCase() === (role || "").toLowerCase()
      );
      const res: DuplicateCheckResult = {
        is_duplicate: !!existing,
        existing_id: existing?.id ?? null,
        reason: existing
          ? `You already applied to ${existing.company} for ${existing.role} on ${new Date(
              existing.created_at
            ).toLocaleDateString()}`
          : null,
      };
      return Promise.resolve(res as unknown as T);
    }

    case "list_reusable_values": {
      const { category } = args || {};
      const list = demoStore.reusableValues;
      const res = category ? list.filter((r) => r.category === category) : list;
      return Promise.resolve(res as unknown as T);
    }

    case "save_reusable_value": {
      const { val } = args || {};
      const list = demoStore.reusableValues;
      const nextId = val.id || Math.max(0, ...list.map((r) => r.id ?? 0)) + 1;
      const entry: ReusableValue = {
        id: nextId,
        category: val.category || "General",
        label: val.label || "",
        value: val.value || "",
        is_default: !!val.is_default,
      };
      const idx = list.findIndex((r) => r.id === nextId);
      if (idx !== -1) {
        list[idx] = entry;
      } else {
        list.push(entry);
      }
      demoStore.reusableValues = [...list];
      return Promise.resolve(nextId as unknown as T);
    }

    case "delete_reusable_value": {
      const { id } = args || {};
      demoStore.reusableValues = demoStore.reusableValues.filter((r) => r.id !== id);
      return Promise.resolve(undefined as unknown as T);
    }

    case "get_latest_job_capture": {
      return Promise.resolve(demoStore.latestCapture as unknown as T);
    }

    case "clear_latest_job_capture": {
      demoStore.latestCapture = null;
      return Promise.resolve(undefined as unknown as T);
    }

    case "get_extension_token": {
      return Promise.resolve("jt_local_token_88921" as unknown as T);
    }

    case "generate_new_extension_token": {
      const token = "jt_local_token_" + Math.random().toString(36).substring(2, 10);
      return Promise.resolve(token as unknown as T);
    }

    case "get_or_export_extension_dir": {
      return Promise.resolve("/Users/demo/JobTracker/extension" as unknown as T);
    }

    case "open_extension_folder": {
      return Promise.resolve("Extension folder ready" as unknown as T);
    }

    case "list_anomaly_notes": {
      return Promise.resolve(demoStore.anomalyNotes as unknown as T);
    }

    case "save_anomaly_note": {
      const { periodStart, periodType, direction, note } = args || {};
      const notes = demoStore.anomalyNotes;
      notes.push({
        period_start: periodStart,
        period_type: periodType,
        direction,
        note,
        created_at: new Date().toISOString(),
      });
      demoStore.anomalyNotes = notes;
      return Promise.resolve(undefined as unknown as T);
    }

    case "tex_engine_available": {
      return Promise.resolve(false as unknown as T);
    }

    case "ollama_models": {
      return Promise.resolve(["llama3.2:latest", "mistral:latest", "qwen2.5:latest"] as unknown as T);
    }

    case "ollama_ask": {
      const { question } = args || {};
      return Promise.resolve(
        `[Demo AI Assistant]: Based on your tracking metrics, you have sent ${
          demoStore.applications.length
        } applications with top response velocity at Stripe and Linear. Analysis for: "${question}" is looking healthy!` as unknown as T
      );
    }

    case "apply_hotkeys":
    case "open_popup":
    case "closePopup": {
      return Promise.resolve(undefined as unknown as T);
    }

    case "export_csv":
    case "export_xlsx": {
      return Promise.resolve(undefined as unknown as T);
    }

    case "parse_import_file": {
      const parsed: ParsedTable = {
        headers: ["Company", "Role", "Status", "Salary", "Date", "Location"],
        rows: [
          ["Airbnb", "Senior Frontend Engineer", "applied", "$200,000", "2026-09-01", "Remote"],
          ["Google", "Staff Systems Architect", "screening", "$270,000", "2026-08-28", "Mountain View, CA"],
          ["Apple", "iOS Software Engineer", "interview", "$220,000", "2026-08-20", "Cupertino, CA"],
        ],
      };
      return Promise.resolve(parsed as unknown as T);
    }

    case "import_applications": {
      const { rows } = (args as { rows?: ImportRow[] }) || {};
      const count = rows ? rows.length : 0;
      const summary: ImportSummary = {
        inserted: count,
        replaced: 0,
        errors: [],
      };
      return Promise.resolve(summary as unknown as T);
    }

    default: {
      console.warn(`Unhandled demo command: ${cmd}`, args);
      return Promise.resolve(null as unknown as T);
    }
  }
}

// ── Safe Dialogs & Opener ───────────────────────────────────────────────────
export async function safeOpenDialog(options?: OpenDialogOptions): Promise<string | string[] | null> {
  if (isTauri()) {
    return tauriOpen(options);
  }
  // Browser fallback: simulated path
  return "/Users/demo/Documents/sample_resume.pdf";
}

export async function safeSaveDialog(options?: SaveDialogOptions): Promise<string | null> {
  if (isTauri()) {
    return tauriSave(options);
  }
  // Browser fallback
  return "/Users/demo/Downloads/JobTracker_export.csv";
}

export async function safeOpenPath(path: string): Promise<void> {
  if (isTauri()) {
    return tauriOpenPath(path);
  }
  if (path.startsWith("http")) {
    window.open(path, "_blank");
  } else {
    console.info("Opening path in demo mode:", path);
  }
}
