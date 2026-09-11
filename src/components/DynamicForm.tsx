/**
 * Renders the application form matching stitch_single_page_job_application_form.
 * Built-in fields map to fixed Application columns; custom fields are collected into `extra`.
 * Integrates reusable addresses and phone numbers.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { FormValues } from "../lib/form";
import {
  BUILTIN_KEYS,
  parseOptions,
  type BuiltinKey,
  type FieldDefinition,
  type ReusableValue,
} from "../types";
import "./DynamicForm.css";

interface Props {
  fields: FieldDefinition[];
  values: FormValues;
  onChange: (values: FormValues) => void;
  autoFocus?: boolean;
}

function isBuiltinKey(key: string): key is BuiltinKey {
  return (BUILTIN_KEYS as readonly string[]).includes(key);
}

export default function DynamicForm({
  fields,
  values,
  onChange,
  autoFocus,
}: Props) {
  const visible = useMemo(
    () => fields.filter((f) => f.visible).sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );

  const [customPortal, setCustomPortal] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<ReusableValue[]>([]);
  const [savedPhones, setSavedPhones] = useState<ReusableValue[]>([]);
  const [showDesc, setShowDesc] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    api.listReusableValues("address").then(setSavedAddresses).catch(() => {});
    api.listReusableValues("phone").then(setSavedPhones).catch(() => {});
  }, []);

  const get = (field: FieldDefinition): string => {
    if (isBuiltinKey(field.key)) return values.builtin[field.key] ?? "";
    const v = values.extra[field.key];
    return v == null ? "" : String(v);
  };

  const setByKey = (key: string, value: string | boolean) => {
    if (isBuiltinKey(key)) {
      onChange({
        ...values,
        builtin: { ...values.builtin, [key]: String(value) },
      });
    } else {
      onChange({ ...values, extra: { ...values.extra, [key]: value } });
    }
  };

  const handleSaveCurrentAddress = async () => {
    const val = values.builtin.address_used?.trim();
    if (!val) return;
    setSavingAddress(true);
    try {
      const label = val.split(",")[0] || "Address";
      await api.saveReusableValue({
        category: "address",
        label,
        value: val,
        is_default: false,
      });
      const refreshed = await api.listReusableValues("address");
      setSavedAddresses(refreshed);
    } finally {
      setSavingAddress(false);
    }
  };

  const handleSaveCurrentPhone = async () => {
    const val = values.builtin.phone?.trim();
    if (!val) return;
    setSavingPhone(true);
    try {
      await api.saveReusableValue({
        category: "phone",
        label: "Mobile",
        value: val,
        is_default: false,
      });
      const refreshed = await api.listReusableValues("phone");
      setSavedPhones(refreshed);
    } finally {
      setSavingPhone(false);
    }
  };

  // Group fields into structured sections
  const jobDetailKeys = new Set(["company", "role", "job_id", "portal", "location", "work_type", "job_url"]);
  const contactKeys = new Set(["address", "phone", "salary"]);
  const noteKeys = new Set(["notes", "job_description"]);

  const customFields = visible.filter(
    (f) => !jobDetailKeys.has(f.key) && !contactKeys.has(f.key) && !noteKeys.has(f.key)
  );

  const getField = (key: string) => visible.find((f) => f.key === key);

  return (
    <div className="dynamic-form-v2">
      {/* SECTION 1: JOB DETAILS */}
      <section className="form-section">
        <div className="section-header">
          <span className="section-title">Job Details</span>
        </div>

        <div className="form-grid">
          {/* Company */}
          <div className="form-col full">
            <label htmlFor="field-company">
              Company <span className="req">*</span>
            </label>
            <input
              id="field-company"
              type="text"
              placeholder="e.g. Acme Corp, Google"
              value={values.builtin.company ?? ""}
              onChange={(e) => setByKey("company", e.target.value)}
              autoFocus={autoFocus}
              required
            />
          </div>

          {/* Role */}
          <div className="form-col full">
            <label htmlFor="field-role">
              Role <span className="req">*</span>
            </label>
            <input
              id="field-role"
              type="text"
              placeholder="e.g. Senior Frontend Engineer"
              value={values.builtin.role ?? ""}
              onChange={(e) => setByKey("role", e.target.value)}
              required
            />
          </div>

          {/* Job ID & Portal */}
          <div className="form-col half">
            <label htmlFor="field-job_id">Job ID</label>
            <input
              id="field-job_id"
              type="text"
              placeholder="e.g. REQ-9842"
              value={values.builtin.job_id ?? ""}
              onChange={(e) => setByKey("job_id", e.target.value)}
            />
          </div>

          <div className="form-col half">
            <label htmlFor="field-portal">Portal</label>
            {customPortal ? (
              <div className="input-with-action">
                <input
                  id="field-portal"
                  type="text"
                  placeholder="Type portal name"
                  value={values.builtin.portal ?? ""}
                  onChange={(e) => setByKey("portal", e.target.value)}
                />
                <button
                  type="button"
                  className="small-toggle-btn"
                  onClick={() => setCustomPortal(false)}
                >
                  List
                </button>
              </div>
            ) : (
              <select
                id="field-portal"
                value={values.builtin.portal ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__other__") {
                    setCustomPortal(true);
                    setByKey("portal", "");
                  } else {
                    setByKey("portal", e.target.value);
                  }
                }}
              >
                <option value="">— Select source portal —</option>
                {getField("portal")
                  ? parseOptions(getField("portal")!).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))
                  : [
                      "LinkedIn",
                      "Indeed",
                      "Greenhouse",
                      "Lever",
                      "Ashby",
                      "Workday",
                      "Company Portal",
                      "Referral",
                    ].map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                <option value="__other__">Other…</option>
              </select>
            )}
          </div>

          {/* Location & Work Type */}
          <div className="form-col half">
            <label htmlFor="field-location">Location</label>
            <input
              id="field-location"
              type="text"
              placeholder="e.g. San Francisco, CA"
              value={values.builtin.location ?? ""}
              onChange={(e) => setByKey("location", e.target.value)}
            />
          </div>

          <div className="form-col half">
            <label htmlFor="field-work_type">Work Type</label>
            <select
              id="field-work_type"
              value={values.builtin.work_type ?? "Unknown"}
              onChange={(e) => setByKey("work_type", e.target.value)}
            >
              <option value="Unknown">Unknown</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
              <option value="In-Person">In-Person</option>
            </select>
          </div>
        </div>
      </section>

      {/* SECTION 2: CONTACT & COMPENSATION */}
      <section className="form-section">
        <div className="section-header">
          <span className="section-title">Contact &amp; Compensation</span>
        </div>

        <div className="form-grid">
          {/* Address Used with Reusable Dropdown */}
          <div className="form-col full">
            <div className="label-with-picker">
              <label htmlFor="field-address">Address Used</label>
              {savedAddresses.length > 0 && (
                <select
                  className="saved-picker-select"
                  onChange={(e) => {
                    if (e.target.value) setByKey("address", e.target.value);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Saved Addresses ({savedAddresses.length})
                  </option>
                  {savedAddresses.map((sa) => (
                    <option key={sa.id} value={sa.value}>
                      {sa.label}: {sa.value}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="input-with-save">
              <input
                id="field-address_used"
                type="text"
                placeholder="e.g. Current primary residence or city"
                value={values.builtin.address_used ?? ""}
                onChange={(e) => setByKey("address_used", e.target.value)}
              />
              {values.builtin.address_used &&
                !savedAddresses.some((a) => a.value === values.builtin.address_used) && (
                  <button
                    type="button"
                    className="save-preset-btn"
                    onClick={handleSaveCurrentAddress}
                    disabled={savingAddress}
                    title="Save this address for future 1-click use"
                  >
                    + Save
                  </button>
                )}
            </div>
          </div>

          {/* Phone Number with Reusable Dropdown */}
          <div className="form-col half">
            <div className="label-with-picker">
              <label htmlFor="field-phone">Phone Number</label>
              {savedPhones.length > 0 && (
                <select
                  className="saved-picker-select"
                  onChange={(e) => {
                    if (e.target.value) setByKey("phone", e.target.value);
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Saved ({savedPhones.length})
                  </option>
                  {savedPhones.map((sp) => (
                    <option key={sp.id} value={sp.value}>
                      {sp.label}: {sp.value}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="input-with-save">
              <input
                id="field-phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={values.builtin.phone ?? ""}
                onChange={(e) => setByKey("phone", e.target.value)}
              />
              {values.builtin.phone &&
                !savedPhones.some((p) => p.value === values.builtin.phone) && (
                  <button
                    type="button"
                    className="save-preset-btn"
                    onClick={handleSaveCurrentPhone}
                    disabled={savingPhone}
                    title="Save this phone for future 1-click use"
                  >
                    + Save
                  </button>
                )}
            </div>
          </div>

          {/* Salary */}
          <div className="form-col half">
            <label htmlFor="field-salary_expectation">Salary Expectation</label>
            <input
              id="field-salary_expectation"
              type="text"
              placeholder="e.g. $140,000 - $160,000"
              value={values.builtin.salary_expectation ?? ""}
              onChange={(e) => setByKey("salary_expectation", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* SECTION 3: NOTES & JOB DESCRIPTION */}
      <section className="form-section">
        <div className="section-header">
          <span className="section-title">Application Notes &amp; Description</span>
          {values.builtin.job_description && (
            <button
              type="button"
              className="toggle-desc-btn"
              onClick={() => setShowDesc(!showDesc)}
            >
              {showDesc ? "Hide Job Description" : "View Job Description"}
            </button>
          )}
        </div>

        <div className="form-grid">
          {showDesc && values.builtin.job_description && (
            <div className="form-col full">
              <div className="captured-desc-box">
                <div className="captured-desc-header">
                  <span>Captured Job Description</span>
                  {values.builtin.job_url && (
                    <span className="captured-url-hint">{values.builtin.job_url}</span>
                  )}
                </div>
                <div className="captured-desc-text">
                  {values.builtin.job_description}
                </div>
              </div>
            </div>
          )}

          <div className="form-col full">
            <label htmlFor="field-notes">Notes</label>
            <textarea
              id="field-notes"
              placeholder="Add follow-up reminders, referral contacts, interview timelines, or notes..."
              value={values.builtin.notes ?? ""}
              rows={2}
              onChange={(e) => setByKey("notes", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* SECTION 4: CUSTOM FIELDS (IF CONFIGURED) */}
      {customFields.length > 0 && (
        <section className="form-section">
          <div className="section-header">
            <span className="section-title">Custom Fields</span>
          </div>

          <div className="form-grid">
            {customFields.map((field) => {
              const val = get(field);
              return (
                <div className="form-col half" key={field.key}>
                  <label htmlFor={`field-${field.key}`}>
                    {field.label}
                    {field.required && <span className="req"> *</span>}
                  </label>
                  {field.field_type === "textarea" ? (
                    <textarea
                      id={`field-${field.key}`}
                      value={val}
                      onChange={(e) => setByKey(field.key, e.target.value)}
                    />
                  ) : field.field_type === "select" ? (
                    <select
                      id={`field-${field.key}`}
                      value={val}
                      onChange={(e) => setByKey(field.key, e.target.value)}
                    >
                      <option value="">—</option>
                      {parseOptions(field).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.field_type === "checkbox" ? (
                    <label className="checkbox-row">
                      <input
                        id={`field-${field.key}`}
                        type="checkbox"
                        checked={val === "true"}
                        onChange={(e) => setByKey(field.key, e.target.checked)}
                      />
                      <span>{field.label}</span>
                    </label>
                  ) : (
                    <input
                      id={`field-${field.key}`}
                      type={
                        field.field_type === "number"
                          ? "number"
                          : field.field_type === "date"
                          ? "date"
                          : "text"
                      }
                      value={val}
                      onChange={(e) => setByKey(field.key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
