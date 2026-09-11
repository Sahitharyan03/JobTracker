/**
 * Always-available Help/FAQ — works with no Ollama connection required,
 * so anyone can get unstuck without opening the GitHub repo.
 */

import { useState } from "react";
import "./Help.css";

interface Entry {
  q: string;
  a: string;
}

const ENTRIES: Entry[] = [
  {
    q: "How do I log a new application?",
    a: "Press your global hotkey from anywhere (default Option/Alt+Shift+J), or click '+ New Application' in the dashboard. Fill in the popup and save with Cmd/Ctrl+Enter.",
  },
  {
    q: "How does the Chrome Extension companion work?",
    a: "The JobTracker Capture Companion automatically detects job postings when you browse LinkedIn, Indeed, Greenhouse, Lever, Ashby, Workday, and standard job boards. When you press the global hotkey (or click New Application), the job details are prefilled instantly. The extension communicates only locally with JobTracker on 127.0.0.1:41724 with zero cloud storage.",
  },
  {
    q: "How do I change my hotkeys?",
    a: "Settings > Global Hotkeys. Click a hotkey box, then press the key combo you want — it fills in automatically, no typing required.",
  },
  {
    q: "Can I add or remove fields in the form?",
    a: "Yes. Settings > Form Fields lets you add, rename, reorder, hide, or require any field. Removing or hiding a field never deletes data you already saved — it just stops asking for it going forward. You can always see everything via CSV/Excel export.",
  },
  {
    q: "How do I bring in job applications I tracked before using this app?",
    a: "Go to the Applications tab and click Import. Upload your old spreadsheet (CSV or Excel), match its columns to Job Tracker's fields — including which column has the date — and review before importing. You'll be asked about anything that looks like it might already exist.",
  },
  {
    q: "Should I store my resume as LaTeX or PDF?",
    a: "Either works, and you can mix both per document. LaTeX source is a few KB and compiles to PDF only when you view it — much lighter if you apply to hundreds of jobs. PDF is simpler if you don't use LaTeX. Set your default in Settings, override any entry individually.",
  },
  {
    q: "Why can't I preview my LaTeX resume?",
    a: "You need Tectonic installed (a small LaTeX engine). Run 'brew install tectonic' on macOS or 'winget install TectonicProject.Tectonic' on Windows, then click Recheck in Settings — no need to restart the app.",
  },
  {
    q: "How do I change an application's status?",
    a: "Click the colored status badge on its row in the Applications table and pick a new status. Every change is timestamped automatically for your funnel and response-rate analytics.",
  },
  {
    q: "Can I customize the dashboard?",
    a: "Yes. Insights > Customize lets you drag charts to reorder them, hide any you don't want, and build your own with '+ Add chart' — bar, pie, donut, line, area, histogram, box plot, or density (KDE) — over any field, including your own custom ones. The headline stats and calendar stay fixed.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Everything lives in one local database in the folder you chose during setup. There are no accounts, no cloud sync, and no telemetry. If you connect the optional AI assistant, questions go only to the Ollama instance you configure — normally on your own machine.",
  },
  {
    q: "How do I back up or move my data?",
    a: "Your entire data folder (chosen during setup) is portable — copy it anywhere. You can also export to CSV or Excel any time from the Applications tab for a spreadsheet copy.",
  },
  {
    q: "How do I uninstall Job Tracker completely?",
    a: "Remove three things: the app itself, your data folder (back it up first if you want to keep it), and the small preferences file at ~/Library/Application Support/JobTracker (macOS) or %APPDATA%\\JobTracker (Windows).",
  },
  {
    q: "What does the AI assistant actually do?",
    a: "It's optional. Connect your own Ollama instance in the Assistant tab, and you can ask questions about your application data or how to use the app in plain language. It's restricted to those two topics by a fixed prompt it can't be talked out of, and it never sends anything anywhere except to the Ollama URL you configure.",
  },
];

export default function Help() {
  const [query, setQuery] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const filtered = ENTRIES.filter((e) =>
    (e.q + e.a).toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="help-view">
      <h1>Help</h1>
      <p className="help-lead">
        Answers to common questions — no internet connection or GitHub visit
        needed. For anything else, the{" "}
        <a
          href="https://github.com/manojkumarsanam/JobTracker/issues"
          target="_blank"
          rel="noreferrer"
        >
          issue tracker
        </a>{" "}
        is open, or ask the AI assistant if you've connected one.
      </p>
      <input
        className="help-search"
        placeholder="Search help topics…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="help-list">
        {filtered.map((entry, i) => {
          const open = openIndex === i;
          return (
            <div className="help-entry" key={entry.q}>
              <button
                className="help-question"
                onClick={() => setOpenIndex(open ? null : i)}
              >
                <span className={`help-chevron ${open ? "open" : ""}`}>›</span>
                {entry.q}
              </button>
              {open && <p className="help-answer">{entry.a}</p>}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="insight-empty">No help topics match "{query}".</p>
        )}
      </div>
    </div>
  );
}
