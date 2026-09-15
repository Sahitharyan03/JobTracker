import { safeInvoke, demoStore, isTauri } from "./lib/tauriBridge";
import { INITIAL_APPLICATIONS, INITIAL_FIELDS, INITIAL_REUSABLE_VALUES } from "./lib/mockData";
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
  SetupState,
  Status,
  StatusEvent,
} from "./types";

export const api = {
  // Runtime environment check
  isTauri: () => isTauri(),

  // Sample data management
  seedSampleData: async () => {
    if (isTauri()) {
      // In Tauri: insert mock applications into SQLite if needed
      for (const app of INITIAL_APPLICATIONS) {
        await safeInvoke<number>("create_application", { app });
      }
      for (const val of INITIAL_REUSABLE_VALUES) {
        await safeInvoke<number>("save_reusable_value", { val });
      }
      await safeInvoke<void>("save_fields", { fields: INITIAL_FIELDS });
    } else {
      demoStore.reset();
    }
  },
  resetSampleData: async () => {
    if (!isTauri()) {
      demoStore.reset();
    }
  },

  // Setup
  getSetupState: () => safeInvoke<SetupState>("get_setup_state"),
  setDataDir: (path: string) => safeInvoke<void>("set_data_dir", { path }),

  // Settings
  getSettings: () => safeInvoke<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) =>
    safeInvoke<void>("set_setting", { key, value }),

  // Field configuration
  listFields: () => safeInvoke<FieldDefinition[]>("list_fields"),
  saveFields: (fields: FieldDefinition[]) =>
    safeInvoke<void>("save_fields", { fields }),

  // Applications
  createApplication: (app: Partial<Application>) =>
    safeInvoke<number>("create_application", { app }),
  listApplications: () => safeInvoke<Application[]>("list_applications"),
  updateStatus: (id: number, status: Status) =>
    safeInvoke<void>("update_status", { id, status }),
  updateApplication: (app: Application) =>
    safeInvoke<void>("update_application", { app }),
  deleteApplication: (id: number) => safeInvoke<void>("delete_application", { id }),
  listStatusEvents: (id: number) =>
    safeInvoke<StatusEvent[]>("list_status_events", { id }),
  checkDuplicateApplication: (company: string, role: string, jobUrl?: string, jobId?: string) =>
    safeInvoke<DuplicateCheckResult>("check_duplicate_application", {
      company,
      role,
      jobUrl: jobUrl || null,
      jobId: jobId || null,
    }),

  // Reusable values (addresses, phone numbers)
  listReusableValues: (category?: string) =>
    safeInvoke<ReusableValue[]>("list_reusable_values", { category: category || null }),
  saveReusableValue: (val: {
    id?: number | null;
    category: string;
    label: string;
    value: string;
    is_default: boolean;
  }) => safeInvoke<number>("save_reusable_value", { val }),
  deleteReusableValue: (id: number) =>
    safeInvoke<void>("delete_reusable_value", { id }),

  // Extension Job Capture
  getLatestJobCapture: () =>
    safeInvoke<CaptureSummary | null>("get_latest_job_capture"),
  clearLatestJobCapture: () => safeInvoke<void>("clear_latest_job_capture"),
  getExtensionToken: () => safeInvoke<string>("get_extension_token"),
  generateNewExtensionToken: () =>
    safeInvoke<string>("generate_new_extension_token"),
  getOrExportExtensionDir: () => safeInvoke<string>("get_or_export_extension_dir"),
  openExtensionFolder: () => safeInvoke<string>("open_extension_folder"),

  // Documents
  importPdf: (source: string, company: string, role: string, docType: string) =>
    safeInvoke<string>("import_pdf", { source, company, role, docType }),
  resolveDocumentPath: (relative: string) =>
    safeInvoke<string>("resolve_document_path", { relative }),

  // Compilation & document bytes
  texEngineAvailable: () => safeInvoke<boolean>("tex_engine_available"),
  compileTex: (tex: string) => safeInvoke<number[]>("compile_tex", { tex }),
  readDocument: (relative: string) =>
    safeInvoke<number[]>("read_document", { relative }),
  savePdfAs: (path: string, bytes: number[]) =>
    safeInvoke<void>("save_pdf_as", { path, bytes }),

  // Export
  exportCsv: (path: string) => safeInvoke<void>("export_csv", { path }),
  exportXlsx: (path: string) => safeInvoke<void>("export_xlsx", { path }),

  // Import
  parseImportFile: (path: string) => safeInvoke<ParsedTable>("parse_import_file", { path }),
  importApplications: (rows: ImportRow[]) =>
    safeInvoke<ImportSummary>("import_applications", { rows }),

  // Anomaly annotations
  listAnomalyNotes: () => safeInvoke<AnomalyNote[]>("list_anomaly_notes"),
  saveAnomalyNote: (
    periodStart: string,
    periodType: string,
    direction: string,
    note: string,
  ) =>
    safeInvoke<void>("save_anomaly_note", {
      periodStart,
      periodType,
      direction,
      note,
    }),

  // Ollama assistant
  ollamaModels: (url: string) => safeInvoke<string[]>("ollama_models", { url }),
  ollamaAsk: (url: string, model: string, question: string) =>
    safeInvoke<string>("ollama_ask", { url, model, question }),

  // Hotkeys / windows
  applyHotkeys: (add: string, dashboard: string) =>
    safeInvoke<void>("apply_hotkeys", { add, dashboard }),
  openPopup: () => safeInvoke<void>("open_popup"),
  closePopup: () => safeInvoke<void>("close_popup"),
};
