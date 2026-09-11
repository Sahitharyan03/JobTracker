/**
 * The main window shell.
 * All colours via CSS variables → dark mode works automatically via data-theme="dark".
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
  const [tab, setTab] = useState<Tab>("applications");

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
      {/* Top Navigation */}
      <header className="dash-header" data-tauri-drag-region>
        <div className="dash-header-inner" data-tauri-drag-region>
          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            {/* Logo */}
            <div
              className="dash-logo"
              onClick={() => setTab("insights")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setTab("insights")}
            >
              <div className="dash-logo-badge">JT</div>
              <span className="dash-logo-name">Job Tracker</span>
            </div>

            {/* Navigation Pills */}
            <nav className="dash-nav">
              {(
                [
                  ["insights", "Insights"],
                  ["applications", "Applications"],
                  ["assistant", "Assistant"],
                  ["help", "Help"],
                  ["settings", "Settings"],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`dash-nav-pill${tab === key ? " active" : ""}`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right Actions */}
          <div className="dash-actions">
            <button
              className="dash-new-btn"
              type="button"
              onClick={() => api.openPopup()}
              title="Add a new application"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              <span>New Application</span>
            </button>

            <span className="dash-byline hidden sm:inline-block">BY MJKR</span>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", width: "100%" }}>
        {tab === "insights" && <Insights />}
        {tab === "applications" && (
          <Applications onNewApplication={() => api.openPopup()} />
        )}
        {tab === "assistant" && <Assistant />}
        {tab === "help" && <Help />}
        {tab === "settings" && <Settings />}
      </div>
    </div>
  );
}
