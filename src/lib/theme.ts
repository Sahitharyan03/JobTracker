/**
 * Theme handling: "light" | "dark" | "system", persisted in localStorage
 * (shared by both windows) and applied as a `data-theme` attribute on the
 * root element. With no attribute, CSS falls back to the OS preference.
 */

export type Theme = "light" | "dark" | "system";

const KEY = "jobtracker-theme";

export function storedTheme(): Theme {
  const value = localStorage.getItem(KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const body = document.body;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (theme === "system") {
    delete root.dataset.theme;
    localStorage.removeItem(KEY);
  } else {
    root.dataset.theme = theme;
    root.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }

  if (isDark) {
    root.classList.add("dark");
    root.classList.remove("light");
    root.setAttribute("data-theme", "dark");
    if (body) {
      body.classList.add("dark");
      body.classList.remove("light");
      body.setAttribute("data-theme", "dark");
    }
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
    root.setAttribute("data-theme", "light");
    if (body) {
      body.classList.remove("dark");
      body.classList.add("light");
      body.setAttribute("data-theme", "light");
    }
  }
}

/** Resolve what's actually on screen right now. */
export function effectiveTheme(): "light" | "dark" {
  const stored = storedTheme();
  if (stored !== "system") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Apply on module load so windows never flash the wrong theme. */
export function initTheme() {
  applyTheme(storedTheme());
  // Keep every window in sync when the toggle is used in another one.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) applyTheme(storedTheme());
  });
}

