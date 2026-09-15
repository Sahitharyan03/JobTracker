/**
 * First-run setup: welcome, data-folder choice, document mode, hotkeys.
 * Everything is collected up front and committed at the end (the database
 * can only store settings once the data folder exists).
 */

import { useState } from "react";
import { safeOpenDialog as open } from "../lib/tauriBridge";
import { api } from "../api";
import HotkeyRecorder from "../components/HotkeyRecorder";
import ThemeToggle from "../components/ThemeToggle";
import type { DocKind } from "../types";
import "./SetupWizard.css";

const DEFAULT_ADD = "Alt+Shift+J";
const DEFAULT_DASH = "Alt+Shift+D";

interface Props {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [docMode, setDocMode] = useState<DocKind>("tex");
  const [hotkeyAdd, setHotkeyAdd] = useState(DEFAULT_ADD);
  const [hotkeyDash, setHotkeyDash] = useState(DEFAULT_DASH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chooseFolder = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") setDataDir(picked);
  };

  const finish = async () => {
    if (!dataDir) return;
    setBusy(true);
    setError("");
    try {
      await api.setDataDir(dataDir);
      await api.setSetting("doc_mode", docMode);
      await api.setSetting("hotkey_add", hotkeyAdd);
      await api.setSetting("hotkey_dashboard", hotkeyDash);
      await api.applyHotkeys(hotkeyAdd, hotkeyDash);
      onComplete();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <div className="setup-theme-toggle">
        <ThemeToggle />
      </div>
      <div className="setup-card">
        {step === 0 && (
          <>
            <h1 className="setup-title">Job Tracker</h1>
            <p className="setup-byline">Created by MJKR</p>
            <p className="setup-lead">
              Every application you send, remembered: the details you gave,
              the exact resume you used, and analytics over your whole search
              — all stored locally, on your machine, in a folder you choose.
            </p>
            <button className="primary" onClick={() => setStep(1)}>
              Get started
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Where should your data live?</h2>
            <p className="setup-help">
              Job Tracker keeps everything — database and documents — in one
              folder. Move the folder, and your data moves with it.
            </p>
            <div className="setup-folder-row">
              <button onClick={chooseFolder}>Choose folder…</button>
              {dataDir && <code className="setup-folder-path">{dataDir}</code>}
            </div>
            <div className="setup-nav">
              <button onClick={() => setStep(0)}>Back</button>
              <button
                className="primary"
                disabled={!dataDir}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>How do you keep your resumes?</h2>
            <p className="setup-help">
              You can switch modes any time, and choose per document too.
            </p>
            <div className="setup-choice-grid">
              <button
                className={`setup-choice ${docMode === "tex" ? "selected" : ""}`}
                onClick={() => setDocMode("tex")}
              >
                <strong>LaTeX source</strong>
                <span>
                  Paste your .tex — kilobytes per entry, compiled to PDF only
                  when you need to see it. Best for space.
                </span>
              </button>
              <button
                className={`setup-choice ${docMode === "pdf" ? "selected" : ""}`}
                onClick={() => setDocMode("pdf")}
              >
                <strong>PDF files</strong>
                <span>
                  Attach the finished PDF — stored in your data folder with a
                  clean, dated filename.
                </span>
              </button>
            </div>
            <div className="setup-nav">
              <button onClick={() => setStep(1)}>Back</button>
              <button className="primary" onClick={() => setStep(3)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Global hotkeys</h2>
            <p className="setup-help">
              Click a box, then press the key combo you want. These work
              from anywhere, even while the app is in the background — and
              you can change them later in Settings.
            </p>
            <div className="setup-hotkeys">
              <div>
                <label>Add application</label>
                <HotkeyRecorder value={hotkeyAdd} onChange={setHotkeyAdd} />
              </div>
              <div>
                <label>Open dashboard</label>
                <HotkeyRecorder value={hotkeyDash} onChange={setHotkeyDash} />
              </div>
            </div>
            {error && <p className="setup-error">{error}</p>}
            <div className="setup-nav">
              <button onClick={() => setStep(2)}>Back</button>
              <button className="primary" disabled={busy} onClick={finish}>
                {busy ? "Setting up…" : "Finish"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
