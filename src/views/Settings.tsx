/**
 * Settings View matching stitch_job_form_field_builder reference.
 * Manages form field builder, reusable addresses & phone numbers,
 * browser extension pairing token, hotkeys, documents, and data paths.
 */

import { useEffect, useState } from "react";
import { api } from "../api";
import HotkeyRecorder from "../components/HotkeyRecorder";
import {
  parseOptions,
  type DocKind,
  type FieldDefinition,
  type FieldType,
  type ReusableValue,
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
  const [savedHotkeyAdd, setSavedHotkeyAdd] = useState("");
  const [savedHotkeyDash, setSavedHotkeyDash] = useState("");
  const [docMode, setDocMode] = useState<DocKind>("tex");
  const [dataDir, setDataDir] = useState("");
  const [texAvailable, setTexAvailable] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);

  // Reusable values
  const [savedAddresses, setSavedAddresses] = useState<ReusableValue[]>([]);
  const [savedPhones, setSavedPhones] = useState<ReusableValue[]>([]);
  const [newAddrLabel, setNewAddrLabel] = useState("");
  const [newAddrVal, setNewAddrVal] = useState("");
  const [newPhoneLabel, setNewPhoneLabel] = useState("");
  const [newPhoneVal, setNewPhoneVal] = useState("");

  // Extension token & folder
  const [extensionToken, setExtensionToken] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [extensionDir, setExtensionDir] = useState("");
  const [openingFolder, setOpeningFolder] = useState(false);

  const loadReusable = () => {
    api.listReusableValues("address").then(setSavedAddresses).catch(() => {});
    api.listReusableValues("phone").then(setSavedPhones).catch(() => {});
  };

  useEffect(() => {
    api.listFields().then(setFields).catch(() => {});
    api.getSetupState().then((s) => setDataDir(s.data_dir ?? "")).catch(() => {});
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
        setSavedHotkeyAdd(add);
        setSavedHotkeyDash(dash);
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
    setDirty(true);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setFields(next.map((f, i) => ({ ...f, sort_order: i })));
    setDirty(true);
  };

  const removeField = (index: number) => {
    const field = fields[index];
    if (field.builtin) return;
    if (
      !window.confirm(
        `Remove "${field.label}" from the form? Existing data for this field is preserved.`,
      )
    )
      return;
    setFields(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, sort_order: i })));
    setDirty(true);
  };

  const addField = () => {
    const label = window.prompt("Name for the new field:");
    if (!label?.trim()) return;
    const key = slugify(label);
    if (fields.some((f) => f.key === key)) {
      flash("A field with that name already exists.");
      return;
    }
    setFields([
      ...fields,
      {
        id: null,
        key,
        label: label.trim(),
        field_type: "text",
        options: null,
        required: false,
        sort_order: fields.length,
        visible: true,
        builtin: false,
      },
    ]);
    setDirty(true);
  };

  const saveFieldConfig = async () => {
    try {
      await api.saveFields(fields.map((f, i) => ({ ...f, sort_order: i })));
      setDirty(false);
      flash("Field configuration saved.");
    } catch (e) {
      flash(String(e));
    }
  };

  const saveHotkeys = async () => {
    try {
      await api.applyHotkeys(hotkeyAdd, hotkeyDash);
      await api.setSetting("hotkey_add", hotkeyAdd);
      await api.setSetting("hotkey_dashboard", hotkeyDash);
      setSavedHotkeyAdd(hotkeyAdd);
      setSavedHotkeyDash(hotkeyDash);
      flash("Hotkeys updated.");
    } catch (e) {
      flash(String(e));
    }
  };

  const resetHotkeys = () => {
    setHotkeyAdd(savedHotkeyAdd);
    setHotkeyDash(savedHotkeyDash);
  };

  const hotkeysDirty =
    hotkeyAdd !== savedHotkeyAdd || hotkeyDash !== savedHotkeyDash;

  const saveDocMode = async (mode: DocKind) => {
    setDocMode(mode);
    await api.setSetting("doc_mode", mode);
    flash(`Default document mode: ${mode === "tex" ? "LaTeX" : "PDF"}.`);
  };

  const handleAddAddress = async () => {
    if (!newAddrVal.trim()) return;
    try {
      await api.saveReusableValue({
        category: "address",
        label: newAddrLabel.trim() || "Home",
        value: newAddrVal.trim(),
        is_default: savedAddresses.length === 0,
      });
      setNewAddrLabel("");
      setNewAddrVal("");
      loadReusable();
      flash("Saved new address preset.");
    } catch (e) {
      flash(String(e));
    }
  };

  const handleDeleteReusable = async (id: number | null) => {
    if (id == null) return;
    try {
      await api.deleteReusableValue(id);
      loadReusable();
      flash("Preset removed.");
    } catch (e) {
      flash(String(e));
    }
  };

  const handleAddPhone = async () => {
    if (!newPhoneVal.trim()) return;
    try {
      await api.saveReusableValue({
        category: "phone",
        label: newPhoneLabel.trim() || "Mobile",
        value: newPhoneVal.trim(),
        is_default: savedPhones.length === 0,
      });
      setNewPhoneLabel("");
      setNewPhoneVal("");
      loadReusable();
      flash("Saved new phone preset.");
    } catch (e) {
      flash(String(e));
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(extensionToken);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2500);
  };

  const generateToken = async () => {
    if (!window.confirm("Generate a new security token? You will need to re-pair your browser extension.")) return;
    try {
      const newToken = await api.generateNewExtensionToken();
      setExtensionToken(newToken);
      flash("Generated new extension token.");
    } catch (e) {
      flash(String(e));
    }
  };

  const handleOpenExtensionFolder = async () => {
    try {
      setOpeningFolder(true);
      const folder = await api.openExtensionFolder();
      setExtensionDir(folder);
      flash(`Opened extension directory: ${folder}`);
    } catch (e) {
      flash(String(e));
    } finally {
      setOpeningFolder(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        {/* Top Section Header */}
        <div className="settings-header-row">
          <div>
            <div className="settings-pretitle">
              <span>Configuration</span>
              <span>•</span>
              <span className="version-tag">v2.0.0</span>
            </div>
            <h1 className="settings-main-title">Preferences &amp; Workflow</h1>
          </div>
          <div className="settings-header-actions">
            <button
              type="button"
              className="btn-header-action"
              onClick={() => api.openPopup()}
            >
              <span className="material-symbols-outlined">visibility</span>
              Preview Add-Entry Modal
            </button>
          </div>
        </div>

        {notice && <div className="settings-flash-banner">{notice}</div>}

        {/* CARD 1: FORM FIELDS BUILDER */}
        <section className="settings-card">
          <div className="card-header-split">
            <div>
              <div className="card-title-group">
                <h2 className="card-title">Form Fields Builder</h2>
                <span className="card-badge">{fields.length} fields</span>
              </div>
              <p className="card-desc">
                Customize which questions the quick popup asks. Drag to reorder, toggle visibility, or add custom fields.
              </p>
            </div>
            <div className="card-header-right">
              <button type="button" className="btn-secondary" onClick={addField}>
                <span className="material-symbols-outlined">add</span>
                Add Custom Field
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!dirty}
                onClick={saveFieldConfig}
              >
                Save Fields
              </button>
            </div>
          </div>

          <div className="field-rows-container">
            {fields.map((field, i) => (
              <div className="field-builder-row" key={field.key}>
                <div className="reorder-col">
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    title="Move Up"
                  >
                    <span className="material-symbols-outlined">keyboard_arrow_up</span>
                  </button>
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === fields.length - 1}
                    title="Move Down"
                  >
                    <span className="material-symbols-outlined">keyboard_arrow_down</span>
                  </button>
                </div>

                <div className="field-label-col">
                  <input
                    type="text"
                    className="field-name-input"
                    value={field.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                  />
                  <span className="field-key-hint">{field.key}</span>
                </div>

                <div className="field-type-col">
                  <select
                    className="field-type-select"
                    value={field.field_type}
                    disabled={field.builtin}
                    onChange={(e) =>
                      updateField(i, { field_type: e.target.value as FieldType })
                    }
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {field.field_type === "select" && (
                  <div className="field-options-col">
                    <input
                      type="text"
                      className="field-options-input"
                      placeholder="Choices, comma-separated"
                      value={parseOptions(field).join(", ")}
                      onChange={(e) =>
                        updateField(i, {
                          options: JSON.stringify(
                            e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          ),
                        })
                      }
                    />
                  </div>
                )}

                <div className="field-toggles-col">
                  <label className="field-checkbox-label">
                    <input
                      type="checkbox"
                      checked={field.visible}
                      onChange={(e) => updateField(i, { visible: e.target.checked })}
                    />
                    <span>shown</span>
                  </label>
                  <label className="field-checkbox-label">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                    />
                    <span>required</span>
                  </label>
                </div>

                {!field.builtin && (
                  <button
                    type="button"
                    className="field-delete-btn"
                    onClick={() => removeField(i)}
                    title="Remove custom field"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* CARD 2: REUSABLE VALUES (ADDRESSES & PHONES) */}
        <section className="settings-card">
          <div className="card-header-split">
            <div>
              <div className="card-title-group">
                <h2 className="card-title">Saved Reusable Values</h2>
                <span className="card-badge">Addresses &amp; Phones</span>
              </div>
              <p className="card-desc">
                Save multiple home addresses and phone numbers for instant 1-click selection in the application form.
              </p>
            </div>
          </div>

          <div className="reusable-grid">
            {/* Addresses */}
            <div className="reusable-column">
              <h3 className="reusable-sub-title">Saved Addresses</h3>
              <div className="reusable-list">
                {savedAddresses.map((sa) => (
                  <div className="reusable-item" key={sa.id}>
                    <div className="reusable-text-group">
                      <span className="reusable-label">{sa.label}</span>
                      <span className="reusable-val">{sa.value}</span>
                    </div>
                    <button
                      type="button"
                      className="reusable-del-btn"
                      onClick={() => handleDeleteReusable(sa.id)}
                      title="Remove"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                ))}
                {savedAddresses.length === 0 && (
                  <span className="reusable-empty">No addresses saved yet</span>
                )}
              </div>

              <div className="reusable-add-form">
                <input
                  type="text"
                  placeholder="Label (e.g. Primary, Boston)"
                  className="reusable-input-sm"
                  value={newAddrLabel}
                  onChange={(e) => setNewAddrLabel(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Full Address or City"
                  className="reusable-input"
                  value={newAddrVal}
                  onChange={(e) => setNewAddrVal(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-reusable-add"
                  onClick={handleAddAddress}
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Phone Numbers */}
            <div className="reusable-column">
              <h3 className="reusable-sub-title">Saved Phone Numbers</h3>
              <div className="reusable-list">
                {savedPhones.map((sp) => (
                  <div className="reusable-item" key={sp.id}>
                    <div className="reusable-text-group">
                      <span className="reusable-label">{sp.label}</span>
                      <span className="reusable-val">{sp.value}</span>
                    </div>
                    <button
                      type="button"
                      className="reusable-del-btn"
                      onClick={() => handleDeleteReusable(sp.id)}
                      title="Remove"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                ))}
                {savedPhones.length === 0 && (
                  <span className="reusable-empty">No phone numbers saved yet</span>
                )}
              </div>

              <div className="reusable-add-form">
                <input
                  type="text"
                  placeholder="Label (e.g. Mobile, Home)"
                  className="reusable-input-sm"
                  value={newPhoneLabel}
                  onChange={(e) => setNewPhoneLabel(e.target.value)}
                />
                <input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  className="reusable-input"
                  value={newPhoneVal}
                  onChange={(e) => setNewPhoneVal(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-reusable-add"
                  onClick={handleAddPhone}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* CARD 3: BROWSER EXTENSION COMPANION */}
        <section className="settings-card">
          <div className="card-header-split">
            <div>
              <div className="card-title-group">
                <h2 className="card-title">Browser Extension Companion</h2>
                <span className="card-badge pill-emerald">Local Port 41724 Active</span>
              </div>
              <p className="card-desc">
                Connect the Chrome / Brave extension to automatically detect job postings and prefill your applications.
              </p>
            </div>
          </div>

          <div className="extension-token-box">
            <div className="token-info-left">
              <label className="token-label">Security Pairing Token</label>
              <div className="token-display-row">
                <input
                  type="password"
                  className="token-input"
                  readOnly
                  value={extensionToken}
                />
                <button
                  type="button"
                  className="btn-copy-token"
                  onClick={copyToken}
                >
                  <span className="material-symbols-outlined">content_copy</span>
                  {tokenCopied ? "Copied!" : "Copy Token"}
                </button>
                <button
                  type="button"
                  className="btn-gen-token"
                  onClick={generateToken}
                  title="Generate a fresh token"
                >
                  Regenerate
                </button>
              </div>
              <span className="token-hint">
                Paste this into the JobTracker Chrome extension popup under Settings &amp; Pairing.
              </span>
            </div>
          </div>

          <div className="extension-folder-box">
            <div className="folder-info">
              <div className="folder-title-row">
                <span className="material-symbols-outlined folder-icon">extension</span>
                <span className="folder-title">Pre-packaged Chrome Extension Included</span>
              </div>
              <p className="folder-desc">
                JobTracker automatically bundles the production Chrome extension ready-to-load with the app. No command line or building required!
              </p>
              {extensionDir && (
                <div className="folder-path-display">
                  <span className="path-label">Location:</span>
                  <code className="path-code">{extensionDir}</code>
                </div>
              )}
            </div>
            <div className="folder-actions">
              <button
                type="button"
                className="btn-reveal-folder"
                onClick={handleOpenExtensionFolder}
                disabled={openingFolder}
              >
                <span className="material-symbols-outlined">folder_open</span>
                {openingFolder ? "Opening Folder..." : "Reveal Extension Folder"}
              </button>
            </div>
          </div>
        </section>

        {/* CARD 4: GLOBAL HOTKEYS */}
        <section className="settings-card">
          <div className="card-header-split">
            <div>
              <div className="card-title-group">
                <h2 className="card-title">Global Hotkeys</h2>
              </div>
              <p className="card-desc">
                Summon the quick add modal or toggle the dashboard from any app on your system.
              </p>
            </div>
            <div className="card-header-right">
              {hotkeysDirty && (
                <button type="button" className="btn-secondary" onClick={resetHotkeys}>
                  Reset
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                disabled={!hotkeysDirty}
                onClick={saveHotkeys}
              >
                Apply Hotkeys
              </button>
            </div>
          </div>

          <div className="hotkeys-grid">
            <div className="hotkey-item">
              <label>Add Application (Quick Popup)</label>
              <HotkeyRecorder value={hotkeyAdd} onChange={setHotkeyAdd} />
            </div>
            <div className="hotkey-item">
              <label>Open / Toggle Dashboard</label>
              <HotkeyRecorder value={hotkeyDash} onChange={setHotkeyDash} />
            </div>
          </div>
        </section>

        {/* CARD 5: DOCUMENTS & LATEX */}
        <section className="settings-card">
          <div className="card-header-split">
            <div>
              <h2 className="card-title">Documents &amp; Previews</h2>
              <p className="card-desc">
                Choose your default format for attached resumes and cover letters.
              </p>
            </div>
          </div>

          <div className="docs-settings-grid">
            <div className="doc-setting-item">
              <label>Default Document Format</label>
              <div className="doc-mode-selector">
                <button
                  type="button"
                  className={`doc-mode-btn ${docMode === "tex" ? "active" : ""}`}
                  onClick={() => saveDocMode("tex")}
                >
                  .tex (LaTeX Source)
                </button>
                <button
                  type="button"
                  className={`doc-mode-btn ${docMode === "pdf" ? "active" : ""}`}
                  onClick={() => saveDocMode("pdf")}
                >
                  .pdf (Standard PDF)
                </button>
              </div>
            </div>

            <div className="doc-setting-item">
              <label>LaTeX Compilation Engine</label>
              <div className="tectonic-status-row">
                <span className="tectonic-desc">
                  {texAvailable == null
                    ? "Checking Tectonic status…"
                    : texAvailable
                    ? "✓ Tectonic engine found — .tex documents will compile automatically."
                    : "⚠️ Tectonic not found. Install Tectonic to preview compiled .tex documents."}
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => api.texEngineAvailable().then(setTexAvailable)}
                >
                  Recheck
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* CARD 6: LOCAL STORAGE & DATA */}
        <section className="settings-card">
          <div className="card-header-split">
            <div>
              <h2 className="card-title">Local-First Storage</h2>
              <p className="card-desc">
                All database records, captured jobs, and attached documents are stored 100% locally on your machine.
              </p>
            </div>
          </div>
          <div className="data-dir-box">
            <span className="material-symbols-outlined folder-icon">folder</span>
            <code className="data-path-text">{dataDir}</code>
          </div>
        </section>
      </div>
    </div>
  );
}
