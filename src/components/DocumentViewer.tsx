/**
 * Modal PDF preview for a stored document. LaTeX sources are compiled on
 * demand (Tectonic); PDFs are read from the data folder. Download opens
 * the native save dialog with a `Date_Company_Role.pdf` default name.
 */

import { useEffect, useRef, useState } from "react";
import { safeSaveDialog as save } from "../lib/tauriBridge";
import { api } from "../api";
import type { Application } from "../types";
import "./DocumentViewer.css";

export type DocSlot = "resume" | "cover";

interface Props {
  app: Application;
  slot: DocSlot;
  onClose: () => void;
}

function defaultFileName(app: Application, slot: DocSlot): string {
  const date = app.created_at.slice(0, 10);
  const clean = (s: string) =>
    s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "untitled";
  const type = slot === "resume" ? "Resume" : "CoverLetter";
  return `${date}_${clean(app.company)}_${clean(app.role)}_${type}.pdf`;
}

export default function DocumentViewer({ app, slot, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const bytesRef = useRef<number[] | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const kind = slot === "resume" ? app.resume_kind : app.cover_kind;
        const tex = slot === "resume" ? app.resume_tex : app.cover_tex;
        const path = slot === "resume" ? app.resume_path : app.cover_path;

        let bytes: number[];
        if (kind === "tex" && tex) {
          bytes = await api.compileTex(tex);
        } else if (kind === "pdf" && path) {
          bytes = await api.readDocument(path);
        } else {
          throw new Error("No document attached.");
        }
        if (cancelled) return;
        bytesRef.current = bytes;
        const blob = new Blob([new Uint8Array(bytes)], {
          type: "application/pdf",
        });
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [app, slot]);

  const download = async () => {
    if (!bytesRef.current) return;
    const path = await save({
      defaultPath: defaultFileName(app, slot),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (path) await api.savePdfAs(path, bytesRef.current);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="viewer-panel" onClick={(e) => e.stopPropagation()}>
        <header className="viewer-header">
          <span className="viewer-title">
            {slot === "resume" ? "Resume" : "Cover Letter"} — {app.company} ·{" "}
            {app.role}
          </span>
          <div className="viewer-actions">
            <button onClick={download} disabled={!url}>
              Download…
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </header>
        <div className="viewer-body">
          {loading && <div className="viewer-status">Compiling…</div>}
          {error && <pre className="viewer-error">{error}</pre>}
          {url && <iframe className="viewer-frame" src={url} title="PDF preview" />}
        </div>
      </div>
    </div>
  );
}
