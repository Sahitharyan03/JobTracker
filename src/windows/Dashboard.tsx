/**
 * The main window shell based on stitch_applicant_tracking_kanban_dashboard
 * and stitch_job_application_tracker_dashboard reference designs.
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
    <div className="bg-background text-slate-900 min-h-screen flex flex-col font-sans antialiased selection:bg-indigo-100 selection:text-indigo-600">
      {/* Top Navigation matching requirement */}
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-30" data-tauri-drag-region>
        <div className="max-w-[1720px] mx-auto px-6 h-16 flex items-center justify-between" data-tauri-drag-region>
          <div className="flex items-center gap-8">
            {/* Logo */}
            <div
              className="flex items-center gap-2.5 group cursor-pointer"
              onClick={() => setTab("insights")}
            >
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                JT
              </div>
              <span className="font-bold text-[17px] tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                Job Tracker
              </span>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1.5 text-[14px]">
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
                  className={`px-3.5 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
                    tab === key
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-4">
            <button
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm active:scale-[0.98] cursor-pointer"
              type="button"
              onClick={() => api.openPopup()}
              title="Add a new application (Shortcut: Cmd/Ctrl+Shift+J)"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>New Application</span>
            </button>

            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase hidden sm:inline-block">
              BY MJKR
            </span>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Container Viewport */}
      <div className="flex-1 flex flex-col w-full">
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
