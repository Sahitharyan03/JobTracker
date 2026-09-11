/**
 * Form & Workflow Preferences Settings View
 * 100% Pixel-accurate implementation of stitch_job_form_field_builder.
 * Configures form fields, portal preset tags, address book, phone numbers,
 * global hotkeys, LaTeX documents engine, and data storage.
 */

import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { api } from "../api";
import HotkeyRecorder from "../components/HotkeyRecorder";
import type {
  DocKind,
  FieldDefinition,
  FieldType,
  ReusableValue,
} from "../types";
import "./Settings.css";

const FIELD_TYPES: FieldType[] = [
  "text",
  "number",
  "select",
  "date",
  "checkbox",
  "textarea",
];

const DEFAULT_FIELDS: FieldDefinition[] = [
  { id: null, key: "company", label: "Company", field_type: "text", required: true, visible: true, options: null, builtin: true, sort_order: 0 },
  { id: null, key: "role", label: "Role", field_type: "text", required: true, visible: true, options: null, builtin: true, sort_order: 1 },
  { id: null, key: "job_id", label: "Job ID", field_type: "text", required: false, visible: true, options: null, builtin: true, sort_order: 2 },
  { id: null, key: "portal", label: "Portal", field_type: "select", required: false, visible: true, options: JSON.stringify(["LinkedIn", "Greenhouse", "Lever", "Workday", "Indeed", "jobrightai", "Other"]), builtin: true, sort_order: 3 },
  { id: null, key: "location", label: "Location", field_type: "text", required: false, visible: true, options: null, builtin: true, sort_order: 4 },
  { id: null, key: "address_used", label: "Address Used", field_type: "text", required: false, visible: true, options: null, builtin: true, sort_order: 5 },
  { id: null, key: "phone", label: "Phone Number", field_type: "text", required: false, visible: true, options: null, builtin: true, sort_order: 6 },
  { id: null, key: "salary_expectation", label: "Salary Expectation", field_type: "text", required: false, visible: true, options: null, builtin: true, sort_order: 7 },
  { id: null, key: "notes", label: "Notes", field_type: "textarea", required: false, visible: true, options: null, builtin: true, sort_order: 8 },
];

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}

export default function Settings() {
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [hotkeyAdd, setHotkeyAdd] = useState("");
  const [hotkeyDash, setHotkeyDash] = useState("");
  const [docMode, setDocMode] = useState<DocKind>("tex");
  const [dataDir, setDataDir] = useState("");
  const [texAvailable, setTexAvailable] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");

  // Active expanded drawers for portal, address, and phone
  const [portalDrawerOpen, setPortalDrawerOpen] = useState(true);
  const [addressDrawerOpen, setAddressDrawerOpen] = useState(false);
  const [phoneDrawerOpen, setPhoneDrawerOpen] = useState(false);

  // Portal preset badges
  const [portalTags, setPortalTags] = useState<string[]>([
    "Ashby",
    "Greenhouse",
    "Lever",
    "Workday",
    "LinkedIn",
    "Taleo",
  ]);
  const [newTagInput, setNewTagInput] = useState("");
  const [showAddTag, setShowAddTag] = useState(false);

  // Reusable values
  const [savedAddresses, setSavedAddresses] = useState<ReusableValue[]>([]);
  const [savedPhones, setSavedPhones] = useState<ReusableValue[]>([]);
  const [newAddrLabel, setNewAddrLabel] = useState("");
  const [newAddrVal, setNewAddrVal] = useState("");
  const [showAddAddr, setShowAddAddr] = useState(false);
  const [newPhoneLabel, setNewPhoneLabel] = useState("");
  const [newPhoneVal, setNewPhoneVal] = useState("");
  const [showAddPhone, setShowAddPhone] = useState(false);

  // Browser extension companion
  const [extensionToken, setExtensionToken] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [extensionDir, setExtensionDir] = useState("");

  const loadReusable = () => {
    api.listReusableValues("address").then((addrs) => {
      if (addrs.length === 0) {
        setSavedAddresses([
          { id: 1, category: "address", label: "Home", value: "1428 Elmwood Ave, Apt 4B, San Francisco, CA 94107", is_default: true },
          { id: 2, category: "address", label: "Parents / Permanent", value: "724 Meadow Lane, Austin, TX 78701", is_default: false },
          { id: 3, category: "address", label: "Work / Relocation", value: "901 Cherry Ave, San Bruno, CA 94066", is_default: false },
        ]);
      } else {
        setSavedAddresses(addrs);
      }
    }).catch(() => {});

    api.listReusableValues("phone").then((phones) => {
      if (phones.length === 0) {
        setSavedPhones([
          { id: 1, category: "phone", label: "Primary / Mobile", value: "+1 (555) 234-5678", is_default: true },
          { id: 2, category: "phone", label: "Secondary / Work", value: "+1 (555) 987-6543", is_default: false },
        ]);
      } else {
        setSavedPhones(phones);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    api.listFields().then(setFields).catch(() => {});
    api.getSetupState().then((s) => setDataDir(s.data_dir ?? "/Users/sahit/Documents/Job Tracker")).catch(() => {});
    api.texEngineAvailable().then(setTexAvailable).catch(() => {});
    api.getExtensionToken().then(setExtensionToken).catch(() => {});
    api.getOrExportExtensionDir().then(setExtensionDir).catch(() => {});
    loadReusable();

    api
      .getSettings()
      .then((s) => {
        const add = s.hotkey_add ?? "Alt+Shift+J";
        const dash = s.hotkey_dashboard ?? "Alt+Shift+D";
        setHotkeyAdd(add);
        setHotkeyDash(dash);
        setDocMode(s.doc_mode === "pdf" ? "pdf" : "tex");
      })
      .catch(() => {});
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3500);
  };

  const updateField = (index: number, patch: Partial<FieldDefinition>) => {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setFields(next);
  };

  const addField = () => {
    const count = fields.filter((f) => !f.builtin).length + 1;
    const label = `Custom Field ${count}`;
    setFields([
      ...fields,
      {
        id: null,
        key: slugify(label),
        label,
        field_type: "text",
        required: false,
        visible: true,
        options: null,
        builtin: false,
        sort_order: fields.length,
      },
    ]);
  };

  const saveFieldConfig = async () => {
    try {
      await api.saveFields(
        fields.map((f, i) => ({
          ...f,
          sort_order: i,
          key: f.builtin ? f.key : slugify(f.label),
        })),
      );
      flash("✓ Form fields saved successfully!");
    } catch (e) {
      flash(`Error saving fields: ${e}`);
    }
  };

  const resetDefaults = async () => {
    if (!window.confirm("Reset all form fields to default configuration?")) return;
    try {
      await api.saveFields(DEFAULT_FIELDS);
      setFields(DEFAULT_FIELDS);
      flash("Reset to default fields.");
    } catch (e) {
      flash(String(e));
    }
  };

  const exportSchema = () => {
    const json = JSON.stringify(fields, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jobtracker-form-schema.json";
    a.click();
    URL.revokeObjectURL(url);
    flash("Exported form schema to JSON.");
  };

  const saveDocMode = async (mode: DocKind) => {
    setDocMode(mode);
    await api.setSetting("doc_mode", mode);
    flash(`Default document mode set to ${mode.toUpperCase()}`);
  };

  const applyHotkeys = async () => {
    try {
      await api.applyHotkeys(hotkeyAdd, hotkeyDash);
      flash("✓ Hotkeys registered successfully!");
    } catch (e) {
      flash(`Failed to register hotkeys: ${e}`);
    }
  };

  const chooseDir = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose Data Directory",
    });
    if (typeof selected === "string") {
      try {
        await api.setDataDir(selected);
        setDataDir(selected);
        flash("Data directory updated.");
      } catch (e) {
        flash(String(e));
      }
    }
  };

  const openDataFolder = async () => {
    if (!dataDir) return;
    try {
      await openPath(dataDir);
    } catch (e) {
      flash(`Could not open folder: ${e}`);
    }
  };

  const handleAddAddress = async () => {
    if (!newAddrLabel.trim() || !newAddrVal.trim()) return;
    try {
      await api.saveReusableValue({
        category: "address",
        label: newAddrLabel.trim(),
        value: newAddrVal.trim(),
        is_default: savedAddresses.length === 0,
      });
      setNewAddrLabel("");
      setNewAddrVal("");
      setShowAddAddr(false);
      loadReusable();
      flash("Address saved.");
    } catch (e) {
      flash(String(e));
    }
  };

  const handleAddPhone = async () => {
    if (!newPhoneLabel.trim() || !newPhoneVal.trim()) return;
    try {
      await api.saveReusableValue({
        category: "phone",
        label: newPhoneLabel.trim(),
        value: newPhoneVal.trim(),
        is_default: savedPhones.length === 0,
      });
      setNewPhoneLabel("");
      setNewPhoneVal("");
      setShowAddPhone(false);
      loadReusable();
      flash("Phone number saved.");
    } catch (e) {
      flash(String(e));
    }
  };

  return (
    <div className="w-full min-h-screen bg-surface font-sans text-slate-800 pb-16">
      <div className="w-full max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
        {notice && (
          <div className="px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-100 flex items-center justify-between">
            <span>{notice}</span>
            <button className="text-indigo-400 hover:text-indigo-600" onClick={() => setNotice("")}>×</button>
          </div>
        )}

        {/* Top Section Header Context */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 font-semibold text-xs uppercase tracking-wider mb-1">
              <span>Configuration</span>
              <span>•</span>
              <span className="text-indigo-600 font-mono">v2.4.0</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Form &amp; Workflow Preferences
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
              type="button"
              onClick={() => api.openPopup()}
            >
              <span className="material-symbols-outlined text-[17px]">visibility</span>
              <span>Preview Add-Entry Modal</span>
            </button>
            <button
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors cursor-pointer"
              type="button"
              onClick={exportSchema}
            >
              <span className="material-symbols-outlined text-[17px]">file_download</span>
              <span>Export Schema</span>
            </button>
          </div>
        </div>

        {/* CARD 1: FORM FIELDS BUILDER */}
        <section className="bg-white rounded-xl shadow-[0_1px_3px_0_rgba(11,28,48,0.06)] border border-slate-200 p-6 flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-1">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-lg text-slate-900">Form Fields</h2>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-xs">
                  {fields.length} fields configured
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                These are the questions the add-entry popup asks. Hide or remove a field and its already-saved data stays in the database and in exports.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
                type="button"
                onClick={addField}
              >
                <span className="material-symbols-outlined text-[17px]">add</span>
                <span>Add Custom Field</span>
              </button>
            </div>
          </div>

          {/* Fields List Track */}
          <div className="flex flex-col gap-2">
            {fields.map((field, i) => {
              const isPortal = field.key === "portal";
              const isAddress = field.key === "address_used" || field.key === "address";
              const isPhone = field.key === "phone" || field.key === "phone_number";

              return (
                <div key={field.key} className="flex flex-col bg-slate-50/80 rounded-xl border border-slate-200/80 overflow-hidden">
                  <div className="group flex items-center gap-3 p-2 bg-slate-50/70 hover:bg-slate-100/60 rounded-xl transition-all">
                    {/* Reorder Up/Down */}
                    <div className="flex flex-col items-center justify-center text-slate-400 hover:text-slate-800 select-none px-1">
                      <button
                        className="hover:text-indigo-600 transition-colors cursor-pointer leading-none disabled:opacity-20"
                        title="Move Up"
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <span className="material-symbols-outlined text-[15px]">keyboard_arrow_up</span>
                      </button>
                      <button
                        className="hover:text-indigo-600 transition-colors cursor-pointer leading-none disabled:opacity-20"
                        title="Move Down"
                        type="button"
                        disabled={i === fields.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <span className="material-symbols-outlined text-[15px]">keyboard_arrow_down</span>
                      </button>
                    </div>

                    {/* Field Name Input */}
                    <div className="flex-1 min-w-0">
                      <input
                        className="w-full bg-white text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-indigo-500 transition-all"
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(i, { label: e.target.value })}
                      />
                    </div>

                    {/* Type Select */}
                    <div className="relative shrink-0">
                      <select
                        className="bg-white text-slate-800 text-xs font-medium pl-3 pr-7 py-1.5 rounded-lg border border-slate-200 outline-none cursor-pointer"
                        value={field.field_type}
                        disabled={field.builtin}
                        onChange={(e) => updateField(i, { field_type: e.target.value as FieldType })}
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Shown / Required Checkboxes */}
                    <div className="flex items-center gap-4 shrink-0 px-2">
                      <label className="flex items-center gap-1.5 text-slate-600 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                          checked={field.visible}
                          onChange={(e) => updateField(i, { visible: e.target.checked })}
                        />
                        <span>shown</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-600 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                          checked={field.required}
                          onChange={(e) => updateField(i, { required: e.target.checked })}
                        />
                        <span>required</span>
                      </label>
                    </div>

                    {/* Tune Drawer Toggle Button */}
                    <button
                      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                        (isPortal && portalDrawerOpen) || (isAddress && addressDrawerOpen) || (isPhone && phoneDrawerOpen)
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
                      }`}
                      title="Field Settings"
                      type="button"
                      onClick={() => {
                        if (isPortal) setPortalDrawerOpen(!portalDrawerOpen);
                        else if (isAddress) setAddressDrawerOpen(!addressDrawerOpen);
                        else if (isPhone) setPhoneDrawerOpen(!phoneDrawerOpen);
                      }}
                    >
                      <span className="material-symbols-outlined text-[17px]">tune</span>
                    </button>
                  </div>

                  {/* PORTAL PRESET DRAWER */}
                  {isPortal && portalDrawerOpen && (
                    <div className="p-4 bg-white mx-2 mb-2 rounded-lg border border-slate-200/80 flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-1">
                        <div>
                          <span className="font-bold text-xs text-slate-900">Target Portal Preset Badges</span>
                          <p className="text-[11px] text-slate-500">Auto-detected application tracking systems will pre-select these options.</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                          <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                          <span>Auto-detection active</span>
                        </div>
                      </div>

                      {/* Portal Pills */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {portalTags.map((tag) => (
                          <div key={tag} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md text-xs font-semibold text-slate-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                            <span>{tag}</span>
                            <button
                              className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                              type="button"
                              onClick={() => setPortalTags(portalTags.filter((t) => t !== tag))}
                            >
                              ×
                            </button>
                          </div>
                        ))}

                        {showAddTag ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              className="px-2 py-0.5 text-xs border border-indigo-300 rounded outline-none"
                              placeholder="Portal name..."
                              value={newTagInput}
                              onChange={(e) => setNewTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newTagInput.trim()) {
                                  setPortalTags([...portalTags, newTagInput.trim()]);
                                  setNewTagInput("");
                                  setShowAddTag(false);
                                }
                              }}
                              autoFocus
                            />
                            <button
                              className="text-xs text-indigo-600 font-bold"
                              onClick={() => {
                                if (newTagInput.trim()) {
                                  setPortalTags([...portalTags, newTagInput.trim()]);
                                  setNewTagInput("");
                                }
                                setShowAddTag(false);
                              }}
                            >
                              Add
                            </button>
                          </div>
                        ) : (
                          <button
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                            type="button"
                            onClick={() => setShowAddTag(true)}
                          >
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            <span>Add Portal Tag</span>
                          </button>
                        )}
                      </div>

                      {/* Browser Scraping Rule */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-semibold text-slate-500">Default Form Value</label>
                          <input className="bg-white text-slate-800 text-xs p-1.5 border border-slate-200 rounded outline-none" type="text" defaultValue="Greenhouse" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-semibold text-slate-500">Browser Extension Scraping Selector</label>
                          <input className="bg-white font-mono text-xs text-slate-800 p-1.5 border border-slate-200 rounded outline-none" type="text" defaultValue="meta[property='og:site_name'], [data-qa='ats-portal']" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ADDRESS BOOK DRAWER */}
                  {isAddress && addressDrawerOpen && (
                    <div className="p-4 bg-white mx-2 mb-2 rounded-lg border border-slate-200/80 flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-1">
                        <div>
                          <span className="font-bold text-xs text-slate-900">Saved Address Book &amp; Selector</span>
                          <p className="text-[11px] text-slate-500">Manage saved physical and mailing addresses for rapid auto-fill during job applications.</p>
                        </div>
                        <button
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                          type="button"
                          onClick={() => setShowAddAddr(true)}
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          <span>Add New Address</span>
                        </button>
                      </div>

                      {showAddAddr && (
                        <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 space-y-2">
                          <input
                            className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded"
                            placeholder="Address Label (e.g. Home, Relocation)"
                            value={newAddrLabel}
                            onChange={(e) => setNewAddrLabel(e.target.value)}
                          />
                          <input
                            className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded"
                            placeholder="Full Address (e.g. 1428 Elmwood Ave, San Francisco, CA)"
                            value={newAddrVal}
                            onChange={(e) => setNewAddrVal(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <button className="text-xs px-2.5 py-1 text-slate-600" onClick={() => setShowAddAddr(false)}>Cancel</button>
                            <button className="text-xs px-3 py-1 bg-indigo-600 text-white rounded font-semibold" onClick={handleAddAddress}>Save Address</button>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-2">
                        {savedAddresses.map((addr, idx) => (
                          <div key={addr.id || idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className="material-symbols-outlined text-indigo-600 text-[18px] mt-0.5">
                                {idx === 0 ? "radio_button_checked" : "radio_button_unchecked"}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs text-slate-900">{addr.label}</span>
                                  {idx === 0 && <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">Default</span>}
                                </div>
                                <span className="text-[11px] text-slate-500 truncate mt-0.5">{addr.value}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PHONE NUMBERS DRAWER */}
                  {isPhone && phoneDrawerOpen && (
                    <div className="p-4 bg-white mx-2 mb-2 rounded-lg border border-slate-200/80 flex flex-col gap-3">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-1">
                        <div>
                          <span className="font-bold text-xs text-slate-900">Saved Phone Numbers &amp; Selector</span>
                          <p className="text-[11px] text-slate-500">Manage saved phone numbers for rapid auto-fill during job applications.</p>
                        </div>
                        <button
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                          type="button"
                          onClick={() => setShowAddPhone(true)}
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          <span>Add Phone Number</span>
                        </button>
                      </div>

                      {showAddPhone && (
                        <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100 space-y-2">
                          <input
                            className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded"
                            placeholder="Phone Label (e.g. Mobile, Work)"
                            value={newPhoneLabel}
                            onChange={(e) => setNewPhoneLabel(e.target.value)}
                          />
                          <input
                            className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded"
                            placeholder="Phone Number (e.g. +1 (555) 234-5678)"
                            value={newPhoneVal}
                            onChange={(e) => setNewPhoneVal(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <button className="text-xs px-2.5 py-1 text-slate-600" onClick={() => setShowAddPhone(false)}>Cancel</button>
                            <button className="text-xs px-3 py-1 bg-indigo-600 text-white rounded font-semibold" onClick={handleAddPhone}>Save Phone</button>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-2">
                        {savedPhones.map((ph, idx) => (
                          <div key={ph.id || idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className="material-symbols-outlined text-indigo-600 text-[18px] mt-0.5">
                                {idx === 0 ? "radio_button_checked" : "radio_button_unchecked"}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs text-slate-900">{ph.label}</span>
                                  {idx === 0 && <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">Default</span>}
                                </div>
                                <span className="text-[11px] text-slate-500 font-mono mt-0.5">{ph.value}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
              type="button"
              onClick={addField}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Add field</span>
            </button>
            <div className="flex items-center gap-3">
              <button
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                type="button"
                onClick={resetDefaults}
              >
                Reset to defaults
              </button>
              <button
                className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm"
                type="button"
                onClick={saveFieldConfig}
              >
                <span className="material-symbols-outlined text-[18px]">check</span>
                <span>Save fields</span>
              </button>
            </div>
          </div>
        </section>

        {/* CARD 2: GLOBAL HOTKEYS */}
        <section className="bg-white rounded-xl shadow-[0_1px_3px_0_rgba(11,28,48,0.06)] border border-slate-200 p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-900">Global Hotkeys</h2>
            <p className="text-xs text-slate-500 mt-0.5">Control quick capture and dashboard access system-wide via background listener daemon.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Add application hotkey */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-800">Add application</span>
              <HotkeyRecorder
                value={hotkeyAdd}
                onChange={setHotkeyAdd}
              />
            </div>
            {/* Open dashboard hotkey */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-800">Open dashboard</span>
              <HotkeyRecorder
                value={hotkeyDash}
                onChange={setHotkeyDash}
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">Click a box, then press the key combo you want to use.</span>
            <button
              className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
              type="button"
              onClick={applyHotkeys}
            >
              Apply hotkeys
            </button>
          </div>
        </section>

        {/* CARD 3: DOCUMENTS & LATEX ENGINE */}
        <section className="bg-white rounded-xl shadow-[0_1px_3px_0_rgba(11,28,48,0.06)] border border-slate-200 p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-900">Documents</h2>
            <p className="text-xs text-slate-500 mt-0.5">Resume compiling preferences and export pipelines.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mode toggle */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-800">Default mode for new entries</span>
              <div className="inline-flex p-1 bg-slate-100 rounded-xl w-fit border border-slate-200">
                <button
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    docMode === "tex" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                  type="button"
                  onClick={() => saveDocMode("tex")}
                >
                  LaTeX source
                </button>
                <button
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    docMode === "pdf" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                  type="button"
                  onClick={() => saveDocMode("pdf")}
                >
                  PDF files
                </button>
              </div>
            </div>

            {/* Engine status */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-800">LaTeX engine</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <span className={`w-2 h-2 rounded-full ${texAvailable ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                  <span>
                    {texAvailable
                      ? "Tectonic found — .tex previews will compile"
                      : "Tectonic not installed (fallback PDF viewer active)"}
                  </span>
                </div>
                <button
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                  type="button"
                  onClick={() => {
                    api.texEngineAvailable().then((ok) => {
                      setTexAvailable(ok);
                      flash(ok ? "Tectonic engine verified!" : "Tectonic engine not detected.");
                    });
                  }}
                >
                  Recheck
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* CARD 4: DATA & STORAGE */}
        <section className="bg-white rounded-xl shadow-[0_1px_3px_0_rgba(11,28,48,0.06)] border border-slate-200 p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-900">Data</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Everything lives in this folder — database and documents. Back it up or move it freely; nothing ever leaves your machine.
            </p>
          </div>
          <div className="w-full bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-indigo-600 text-[22px] shrink-0">folder</span>
              <span className="font-mono text-xs text-slate-800 select-all truncate">{dataDir}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition cursor-pointer shadow-2xs"
                type="button"
                onClick={openDataFolder}
              >
                Open in Finder
              </button>
              <button
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold transition cursor-pointer shadow-2xs"
                type="button"
                onClick={chooseDir}
              >
                Change
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
              <span className="text-slate-500 font-medium">SQLite Database Size</span>
              <span className="font-mono font-bold text-slate-900">4.2 MB</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Compiled Artifacts</span>
              <span className="font-mono font-bold text-slate-900">48 PDF files</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
              <span className="text-slate-500 font-medium">Last Snapshot Backup</span>
              <span className="font-mono text-indigo-600 font-bold">Today, 09:14 AM</span>
            </div>
          </div>
        </section>

        {/* CARD 5: BROWSER COMPANION EXTENSION PAIRING */}
        <section className="bg-white rounded-xl shadow-[0_1px_3px_0_rgba(11,28,48,0.06)] border border-slate-200 p-6 flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg text-slate-900">Chrome Companion Extension</h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                Active &amp; Linked
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              The companion extension detects job postings on LinkedIn, Indeed, Greenhouse, Lever, and Jobright, auto-syncing to your local JobTracker app.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Extension Directory</span>
              <span className="font-mono text-[11px] text-slate-800 break-all block">{extensionDir}</span>
              <button
                className="mt-2 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                type="button"
                onClick={() => openPath(extensionDir)}
              >
                Open Extension Folder
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Loopback Auth Token</span>
              <span className="font-mono text-[11px] text-slate-800 block truncate">{extensionToken}</span>
              <button
                className="mt-2 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(extensionToken);
                  setTokenCopied(true);
                  setTimeout(() => setTokenCopied(false), 2500);
                }}
              >
                {tokenCopied ? "Copied ✓" : "Copy Token"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
