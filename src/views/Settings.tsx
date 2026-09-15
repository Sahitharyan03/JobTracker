/**
 * Form & Workflow Preferences Settings View
 * 100% Pixel-accurate implementation of stitch_job_form_field_builder.
 * Configures form fields, portal preset tags, address book, phone numbers,
 * global hotkeys, LaTeX documents engine, and data storage.
 */

import { useEffect, useState } from "react";
import { safeOpenDialog as openDialog, safeOpenPath as openPath } from "../lib/tauriBridge";
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
      setSavedAddresses(addrs);
    }).catch(() => {});

    api.listReusableValues("phone").then((phones) => {
      setSavedPhones(phones);
    }).catch(() => {});
  };

  useEffect(() => {
    api.listFields().then((list) => {
      setFields(list);
      const portalField = list.find((f) => f.key === "portal");
      if (portalField?.options) {
        try {
          const parsed = JSON.parse(portalField.options);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPortalTags(parsed);
          }
        } catch {}
      }
    }).catch(() => {});

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
      const syncedFields = fields.map((f, i) => {
        let options = f.options;
        if (f.key === "portal" && portalTags.length > 0) {
          options = JSON.stringify(portalTags);
        }
        return {
          ...f,
          options,
          sort_order: i,
          key: f.builtin ? f.key : slugify(f.label),
        };
      });
      await api.saveFields(syncedFields);
      setFields(syncedFields);
      flash("✓ Form fields & portal presets saved successfully!");
    } catch (e) {
      flash(`Error saving fields: ${e}`);
    }
  };

  const resetDefaults = async () => {
    if (!window.confirm("Reset all form fields to default configuration?")) return;
    try {
      await api.saveFields(DEFAULT_FIELDS);
      setFields(DEFAULT_FIELDS);
      const portalField = DEFAULT_FIELDS.find((f) => f.key === "portal");
      if (portalField?.options) {
        try {
          setPortalTags(JSON.parse(portalField.options));
        } catch {}
      }
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
      await api.setSetting("hotkey_add", hotkeyAdd);
      await api.setSetting("hotkey_dashboard", hotkeyDash);
      await api.applyHotkeys(hotkeyAdd, hotkeyDash);
      flash("✓ Hotkeys applied and saved successfully!");
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
      flash("✓ Address saved.");
    } catch (e) {
      flash(String(e));
    }
  };

  const handleDeleteAddress = async (id: number | undefined | null) => {
    if (id == null) return;
    try {
      await api.deleteReusableValue(id);
      loadReusable();
      flash("Address removed.");
    } catch (e) {
      flash(String(e));
    }
  };

  const handleSetDefaultAddress = async (addr: ReusableValue) => {
    if (addr.id == null) return;
    try {
      await api.saveReusableValue({
        id: addr.id,
        category: "address",
        label: addr.label,
        value: addr.value,
        is_default: true,
      });
      loadReusable();
      flash(`✓ Default address set to ${addr.label}`);
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
      flash("✓ Phone number saved.");
    } catch (e) {
      flash(String(e));
    }
  };

  const handleDeletePhone = async (id: number | undefined | null) => {
    if (id == null) return;
    try {
      await api.deleteReusableValue(id);
      loadReusable();
      flash("Phone number removed.");
    } catch (e) {
      flash(String(e));
    }
  };

  const handleSetDefaultPhone = async (ph: ReusableValue) => {
    if (ph.id == null) return;
    try {
      await api.saveReusableValue({
        id: ph.id,
        category: "phone",
        label: ph.label,
        value: ph.value,
        is_default: true,
      });
      loadReusable();
      flash(`✓ Default phone set to ${ph.label}`);
    } catch (e) {
      flash(String(e));
    }
  };

  const handleRegenerateToken = async () => {
    try {
      const newToken = await api.generateNewExtensionToken();
      setExtensionToken(newToken);
      flash("✓ New companion token generated.");
    } catch (e) {
      flash(String(e));
    }
  };


  return (
    <div className="settings-root">
      <div className="settings-inner">
        {notice && (
          <div className="settings-notice">
            <span>{notice}</span>
            <button style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit", fontSize: "1rem" }} onClick={() => setNotice("")}>×</button>
          </div>
        )}

        {/* Page Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <div className="settings-page-header">
            <div className="settings-page-eyebrow">
              <span>Configuration</span>
              <span>·</span>
              <span className="version">v2.4.0</span>
            </div>
            <h1 className="settings-page-title">Form &amp; Workflow Preferences</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="settings-btn" type="button" onClick={() => api.openPopup()}>
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>visibility</span>
              Preview Add-Entry Modal
            </button>
            <button className="settings-btn" type="button" onClick={exportSchema}>
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>file_download</span>
              Export Schema
            </button>
          </div>
        </div>

        {/* CARD 1: FORM FIELDS BUILDER */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <div className="settings-card-title">
                Form Fields
                <span className="settings-badge" style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem" }}>{fields.length} fields</span>
              </div>
              <div className="settings-card-subtitle">
                These are the questions the add-entry popup asks. Hidden fields stay in the database and exports.
              </div>
            </div>
            <button className="settings-btn accent-soft" type="button" onClick={addField}>
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>
              Add Custom Field
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {fields.map((field, i) => {
              const isPortal = field.key === "portal";
              const isAddress = field.key === "address_used" || field.key === "address";
              const isPhone = field.key === "phone" || field.key === "phone_number";

              return (
                <div key={field.key} className="settings-field-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 0, padding: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, color: "var(--text-faint)", userSelect: "none" }}>
                      <button
                        style={{ background: "transparent", border: "none", cursor: i === 0 ? "not-allowed" : "pointer", color: "inherit", opacity: i === 0 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                        title="Move Up" type="button" disabled={i === 0} onClick={() => move(i, -1)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>keyboard_arrow_up</span>
                      </button>
                      <button
                        style={{ background: "transparent", border: "none", cursor: i === fields.length - 1 ? "not-allowed" : "pointer", color: "inherit", opacity: i === fields.length - 1 ? 0.3 : 1, padding: 0, lineHeight: 1 }}
                        title="Move Down" type="button" disabled={i === fields.length - 1} onClick={() => move(i, 1)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>keyboard_arrow_down</span>
                      </button>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        className="settings-input"
                        style={{ width: "100%", fontWeight: 600 }}
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(i, { label: e.target.value })}
                      />
                    </div>

                    <select
                      className="settings-select"
                      style={{ flexShrink: 0, cursor: field.builtin ? "not-allowed" : "pointer" }}
                      value={field.field_type}
                      disabled={field.builtin}
                      onChange={(e) => updateField(i, { field_type: e.target.value as FieldType })}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>

                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexShrink: 0, padding: "0 0.5rem" }}>
                      <label className="settings-check-label">
                        <input type="checkbox" checked={field.visible} onChange={(e) => updateField(i, { visible: e.target.checked })} />
                        <span>shown</span>
                      </label>
                      <label className="settings-check-label">
                        <input type="checkbox" checked={field.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                        <span>required</span>
                      </label>
                    </div>

                    {(isPortal || isAddress || isPhone) && (
                      <button
                        className="drawer-icon-btn"
                        style={(isPortal && portalDrawerOpen) || (isAddress && addressDrawerOpen) || (isPhone && phoneDrawerOpen) ? { background: "var(--primary)", color: "var(--on-primary)" } : {}}
                        title="Field Settings"
                        type="button"
                        onClick={() => {
                          if (isPortal) setPortalDrawerOpen(!portalDrawerOpen);
                          else if (isAddress) setAddressDrawerOpen(!addressDrawerOpen);
                          else if (isPhone) setPhoneDrawerOpen(!phoneDrawerOpen);
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 17 }}>tune</span>
                      </button>
                    )}
                  </div>

                  {/* PORTAL PRESET DRAWER */}
                  {isPortal && portalDrawerOpen && (
                    <div style={{ padding: "1rem", background: "var(--bg-elevated)", margin: "0 0.5rem 0.5rem", borderRadius: "0.5rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)" }}>Target Portal Preset Badges</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: 2 }}>Auto-detected ATS systems will pre-select these options.</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                          Auto-detection active
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                        {portalTags.map((tag) => (
                          <span key={tag} className="settings-tag">
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                            {tag}
                            <button type="button" onClick={() => setPortalTags(portalTags.filter((t) => t !== tag))}>×</button>
                          </span>
                        ))}
                        {showAddTag ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <input
                              className="settings-input"
                              style={{ width: "8rem", padding: "0.25rem 0.5rem" }}
                              placeholder="Portal name..."
                              value={newTagInput}
                              onChange={(e) => setNewTagInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter" && newTagInput.trim()) { setPortalTags([...portalTags, newTagInput.trim()]); setNewTagInput(""); setShowAddTag(false); } }}
                              autoFocus
                            />
                            <button className="settings-btn primary" style={{ padding: "0.25rem 0.625rem" }} onClick={() => { if (newTagInput.trim()) { setPortalTags([...portalTags, newTagInput.trim()]); setNewTagInput(""); } setShowAddTag(false); }}>Add</button>
                          </span>
                        ) : (
                          <button className="settings-btn accent-soft" type="button" onClick={() => setShowAddTag(true)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                            Add Portal Tag
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ADDRESS BOOK DRAWER */}
                  {isAddress && addressDrawerOpen && (
                    <div style={{ padding: "1rem", background: "var(--bg-elevated)", margin: "0 0.5rem 0.5rem", borderRadius: "0.5rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)" }}>Saved Address Book</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: 2 }}>Manage saved addresses for rapid auto-fill.</div>
                        </div>
                        <button className="settings-btn accent-soft" type="button" onClick={() => setShowAddAddr(true)}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                          Add Address
                        </button>
                      </div>
                      {showAddAddr && (
                        <div className="settings-add-form">
                          <input className="settings-input" style={{ width: "100%" }} placeholder="Label (e.g. Home, Relocation)" value={newAddrLabel} onChange={(e) => setNewAddrLabel(e.target.value)} />
                          <input className="settings-input" style={{ width: "100%" }} placeholder="Full Address" value={newAddrVal} onChange={(e) => setNewAddrVal(e.target.value)} />
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button className="settings-btn" type="button" onClick={() => setShowAddAddr(false)}>Cancel</button>
                            <button className="settings-btn primary" type="button" onClick={handleAddAddress}>Save Address</button>
                          </div>
                        </div>
                      )}
                      {savedAddresses.length === 0 && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", padding: "0.5rem 0" }}>
                          No saved addresses yet. Click "Add Address" to store your home, permanent, or work addresses for quick auto-fill.
                        </div>
                      )}
                      {savedAddresses.map((addr) => (

                        <div key={addr.id} className="reusable-card">
                          <div
                            style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0, flex: 1, cursor: "pointer" }}
                            onClick={() => handleSetDefaultAddress(addr)}
                            title="Click to make default address"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: addr.is_default ? "var(--accent)" : "var(--text-faint)", marginTop: 2, flexShrink: 0 }}>
                              {addr.is_default ? "radio_button_checked" : "radio_button_unchecked"}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className="label">{addr.label}</span>
                                {addr.is_default && <span className="settings-badge">Default</span>}
                              </div>
                              <div className="value" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{addr.value}</div>
                            </div>
                          </div>
                          <button
                            className="drawer-icon-btn danger"
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteAddress(addr.id); }}
                            title="Delete address"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PHONE NUMBERS DRAWER */}
                  {isPhone && phoneDrawerOpen && (
                    <div style={{ padding: "1rem", background: "var(--bg-elevated)", margin: "0 0.5rem 0.5rem", borderRadius: "0.5rem", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "var(--text)" }}>Saved Phone Numbers</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: 2 }}>Manage saved phone numbers for rapid auto-fill.</div>
                        </div>
                        <button className="settings-btn accent-soft" type="button" onClick={() => setShowAddPhone(true)}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                          Add Phone
                        </button>
                      </div>
                      {showAddPhone && (
                        <div className="settings-add-form">
                          <input className="settings-input" style={{ width: "100%" }} placeholder="Label (e.g. Mobile, Work)" value={newPhoneLabel} onChange={(e) => setNewPhoneLabel(e.target.value)} />
                          <input className="settings-input" style={{ width: "100%" }} placeholder="Phone Number" value={newPhoneVal} onChange={(e) => setNewPhoneVal(e.target.value)} />
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button className="settings-btn" type="button" onClick={() => setShowAddPhone(false)}>Cancel</button>
                            <button className="settings-btn primary" type="button" onClick={handleAddPhone}>Save Phone</button>
                          </div>
                        </div>
                      )}
                      {savedPhones.length === 0 && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", padding: "0.5rem 0" }}>
                          No saved phone numbers yet. Click "Add Phone" to store your primary or secondary contact numbers.
                        </div>
                      )}
                      {savedPhones.map((ph) => (
                        <div key={ph.id} className="reusable-card">
                          <div
                            style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0, flex: 1, cursor: "pointer" }}
                            onClick={() => handleSetDefaultPhone(ph)}
                            title="Click to make default phone"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: ph.is_default ? "var(--accent)" : "var(--text-faint)", marginTop: 2, flexShrink: 0 }}>
                              {ph.is_default ? "radio_button_checked" : "radio_button_unchecked"}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span className="label">{ph.label}</span>
                                {ph.is_default && <span className="settings-badge">Default</span>}
                              </div>
                              <div className="value" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>{ph.value}</div>
                            </div>
                          </div>
                          <button
                            className="drawer-icon-btn danger"
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeletePhone(ph.id); }}
                            title="Delete phone number"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
            <button className="settings-btn" type="button" onClick={addField}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Add field
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                style={{ background: "transparent", border: "none", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", transition: "color 140ms" }}
                type="button" onClick={resetDefaults}
                onMouseOver={(e) => ((e.target as HTMLElement).style.color = "var(--text)")}
                onMouseOut={(e) => ((e.target as HTMLElement).style.color = "var(--text-secondary)")}
              >
                Reset to defaults
              </button>
              <button className="settings-btn primary" type="button" onClick={saveFieldConfig}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>
                Save fields
              </button>
            </div>
          </div>
        </section>

        {/* CARD 2: GLOBAL HOTKEYS */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <div className="settings-card-title">Global Hotkeys</div>
              <div className="settings-card-subtitle">Control quick capture and dashboard access system-wide via background listener daemon.</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>Add application</span>
              <HotkeyRecorder value={hotkeyAdd} onChange={setHotkeyAdd} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>Open dashboard</span>
              <HotkeyRecorder value={hotkeyDash} onChange={setHotkeyDash} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", paddingTop: "0.625rem", borderTop: "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Click a box, then press the key combo you want to use.</span>
            <button className="settings-btn primary" type="button" onClick={applyHotkeys}>Apply hotkeys</button>
          </div>
        </section>

        {/* CARD 3: DOCUMENTS & LATEX ENGINE */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <div className="settings-card-title">Documents</div>
              <div className="settings-card-subtitle">Resume compiling preferences and export pipelines.</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>Default mode for new entries</span>
              <div className="settings-radio-grid">
                <div className={`settings-radio-option${docMode === "tex" ? " selected" : ""}`} onClick={() => saveDocMode("tex")}>
                  <input type="radio" checked={docMode === "tex"} onChange={() => saveDocMode("tex")} style={{ position: "absolute", opacity: 0 }} />
                  <span className="option-label">LaTeX source</span>
                  <span className="option-sub">.tex files compiled with Tectonic</span>
                </div>
                <div className={`settings-radio-option${docMode === "pdf" ? " selected" : ""}`} onClick={() => saveDocMode("pdf")}>
                  <input type="radio" checked={docMode === "pdf"} onChange={() => saveDocMode("pdf")} style={{ position: "absolute", opacity: 0 }} />
                  <span className="option-label">PDF files</span>
                  <span className="option-sub">Upload pre-built PDFs</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text)" }}>LaTeX engine</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: texAvailable ? "var(--success)" : "var(--warning)", display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text)", flex: 1 }}>
                  {texAvailable ? "Tectonic found — .tex previews will compile" : "Tectonic not installed (fallback PDF viewer active)"}
                </span>
                <button className="settings-btn" type="button" onClick={() => { api.texEngineAvailable().then((ok) => { setTexAvailable(ok); flash(ok ? "Tectonic verified!" : "Tectonic not detected."); }); }}>Recheck</button>
              </div>
            </div>
          </div>
        </section>

        {/* CARD 4: DATA & STORAGE */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <div className="settings-card-title">Data</div>
              <div className="settings-card-subtitle">Everything lives in this folder — back it up or move it freely. Nothing ever leaves your machine.</div>
            </div>
          </div>
          <div className="settings-dir-row">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--accent)", flexShrink: 0 }}>folder</span>
            <span className="settings-dir-path" style={{ userSelect: "all" }}>{dataDir || "No directory selected"}</span>
            <button className="settings-btn" type="button" onClick={openDataFolder}>Open in Finder</button>
            <button className="settings-btn" type="button" onClick={chooseDir}>Change</button>
          </div>
        </section>

        {/* CARD 5: BROWSER COMPANION EXTENSION PAIRING */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <div className="settings-card-title">
                Chrome Companion Extension
                <span className="metric-badge success">Active &amp; Linked</span>
              </div>
              <div className="settings-card-subtitle">
                Detects job postings on LinkedIn, Indeed, Greenhouse, Lever, and Jobright, auto-syncing to your local app.
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="settings-token-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Extension Directory</span>
              <span className="settings-token-value" style={{ wordBreak: "break-all", whiteSpace: "normal" }}>{extensionDir || "browser-extension/"}</span>
              <button className="settings-btn accent-soft" type="button" style={{ marginTop: 4 }} onClick={() => api.openExtensionFolder()}>Open Extension Folder</button>
            </div>
            <div className="settings-token-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>Loopback Auth Token</span>
              <span className="settings-token-value">{extensionToken || "Loading token..."}</span>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button className="settings-btn accent-soft" type="button" onClick={() => { navigator.clipboard.writeText(extensionToken); setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2500); }}>
                  {tokenCopied ? "Copied ✓" : "Copy Token"}
                </button>
                <button className="settings-btn" type="button" onClick={handleRegenerateToken} title="Generate new auth token">
                  Regenerate
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* CARD 6: DEMO & SAMPLE DATA */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <div className="settings-card-title">
                Sample Data &amp; Demo Sandbox
                <span className="metric-badge active">Interactive</span>
              </div>
              <div className="settings-card-subtitle">
                Populate realistic job applications, interview pipelines, salary data, and presets matching Stitch mockups.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="settings-btn accent-soft"
              type="button"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
              onClick={async () => {
                await api.seedSampleData();
                flash("Sample applications and presets loaded successfully!");
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>
              Load 14+ Realistic Applications &amp; Presets
            </button>
            <button
              className="settings-btn"
              type="button"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={async () => {
                await api.resetSampleData();
                flash("Demo dataset reset to initial state.");
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
              Reset to Defaults
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

