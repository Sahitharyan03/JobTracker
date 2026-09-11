/**
 * The main window shell based on stitch_job_application_tracker_dashboard
 * and stitch_applicant_tracking_kanban_dashboard reference designs.
 * Preserves all views, setup flow, data, and routes.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import SetupWizard from "../views/SetupWizard";
import ThemeToggle from "../components/ThemeToggle";
import Applications from "../views/Applications";
import Assistant from "../views/Assistant";
import Help from "../views/Help";
import Insights from "../views/Insights";
import Settings from "../views/Settings";
import "./Dashboard.css";

type Tab = "insights" | "applications" | "assistant" | "help" | "settings";

export default function Dashboard() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("insights");

  const refresh = useCallback(() => {
    api
      .getSetupState()
      .then((s) => setReady(s.ready))
      .catch(() => setReady(false));
  }, []);

  useEffect(refresh, [refresh]);

  if (ready === null) return null;
  if (!ready) return <SetupWizard onComplete={refresh} />;

  return (
    <div className="dashboard-shell">
      <header className="dashboard-top-nav" data-tauri-drag-region>
        <div className="nav-inner" data-tauri-drag-region>
          {/* Brand & Tabs */}
          <div className="nav-left">
            <div className="brand-group" onClick={() => setTab("insights")}>
              <div className="brand-badge">
                <span>JT</span>
              </div>
              <div className="brand-text">
                <span className="brand-name">Job Tracker</span>
                <span className="brand-sub">Analytics Pro</span>
              </div>
            </div>

            {/* Navigation Pills */}
            <nav className="nav-pills-container">
              {(
                [
                  ["insights", "Insights", "insights"],
                  ["applications", "Applications", "view_kanban"],
                  ["assistant", "Assistant", "smart_toy"],
                  ["help", "Help", "help_outline"],
                  ["settings", "Settings", "settings"],
                ] as [Tab, string, string][]
              ).map(([key, label, icon]) => (
                <button
                  key={key}
                  type="button"
                  className={`nav-pill-btn ${tab === key ? "active" : ""}`}
                  onClick={() => setTab(key)}
                >
                  <span className="material-symbols-outlined nav-pill-icon">
                    {icon}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Right Header Actions */}
          <div className="nav-right">
            <button
              type="button"
              className="btn-new-application"
              onClick={() => api.openPopup()}
              title="Add a new application (Shortcut: Cmd/Ctrl+Shift+J)"
            >
              <span className="material-symbols-outlined">add</span>
              <span>New Application</span>
            </button>

            <div className="version-pill">
              <span>BY MJKR</span>
            </div>

            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="dashboard-viewport">
        {tab === "insights" && <Insights />}
        {tab === "applications" && <Applications onNewApplication={() => api.openPopup()} />}
        {tab === "assistant" && <Assistant />}
        {tab === "help" && <Help />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}
