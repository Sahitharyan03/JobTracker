/**
 * Intelligence & Analytics Bento Dashboard
 * All data is live from the SQLite database via api.listApplications().
 * All colours via CSS variables → dark mode works automatically.
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import { api } from "../api";
import {
  countsByDay,
  currentStreak,
  dailySeries,
  dayKey,
  hourMatrix,
  portalStats,
  salarySeries,
  forecast,
} from "../lib/analytics";
import type { Application } from "../types";
import "./Insights.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS_SHOWN = [8, 10, 12, 14, 16, 18, 20];

function heatColor(n: number, max: number): string {
  if (n === 0) return "";
  const pct = n / max;
  if (pct >= 0.8) return "peak";
  if (pct >= 0.5) return "high";
  if (pct >= 0.2) return "mid";
  return "low";
}

function funnelColor(stage: string): string {
  const map: Record<string, string> = {
    applied: "var(--accent)",
    screening: "var(--warning)",
    interview: "#a855f7",
    offer: "var(--success)",
  };
  return map[stage] ?? "var(--border)";
}

export default function Insights() {
  const [apps, setApps] = useState<Application[]>([]);
  const [geoFilter, setGeoFilter] = useState<"all" | "remote" | "onsite">("all");
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const load = useCallback(() => {
    api.listApplications().then(setApps).catch(() => {});
  }, []);

  useEffect(load, [load]);

  // ── Core analytics ──────────────────────────────────────────────────────────
  const counts = useMemo(() => countsByDay(apps), [apps]);
  const series = useMemo(() => dailySeries(apps), [apps]);
  const todayCount = useMemo(() => counts.get(dayKey(new Date())) ?? 0, [counts]);
  const totalVolume = apps.length;
  const streak = useMemo(() => currentStreak(series), [series]);

  const funnelData = useMemo(() => {
    const applied = apps.length;
    const screening = apps.filter((a) => ["screening", "interview", "offer"].includes(a.status)).length;
    const interview = apps.filter((a) => ["interview", "offer"].includes(a.status)).length;
    const offer = apps.filter((a) => a.status === "offer").length;
    const responseCount = screening;
    const responseRate = applied > 0 ? ((responseCount / applied) * 100).toFixed(1) : "0.0";
    return { applied, screening, interview, offer, responseCount, responseRate };
  }, [apps]);

  const portals = useMemo(() => portalStats(apps).slice(0, 8), [apps]);
  const salaryPts = useMemo(() => salarySeries(apps), [apps]);
  const medianSalary = useMemo(() => {
    if (salaryPts.length === 0) return null;
    const sorted = [...salaryPts].sort((a, b) => a.amount - b.amount);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1].amount + sorted[mid].amount) / 2
      : sorted[mid].amount;
  }, [salaryPts]);

  const matrix = useMemo(() => hourMatrix(apps), [apps]);
  const matrixMax = useMemo(() => Math.max(1, ...matrix.flat()), [matrix]);

  const forecastData = useMemo(() => forecast(series, totalVolume, 1000, null), [series, totalVolume]);

  // ── Calendar heatmap helpers ─────────────────────────────────────────────────
  const calendarCells = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Monday=0
    const cells: Array<{ day: number | null; count: number }> = [];
    for (let i = 0; i < startDow; i++) cells.push({ day: null, count: 0 });
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, count: counts.get(key) ?? 0 });
    }
    return cells;
  }, [viewMonth, counts]);

  const calMax = useMemo(() => Math.max(1, ...calendarCells.map((c) => c.count)), [calendarCells]);

  const monthLabel = new Date(viewMonth.year, viewMonth.month).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  // ── Weekly pace (last 7 days) ─────────────────────────────────────────────────
  const weeklyBars = useMemo(() => {
    const bars: Array<{ label: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      bars.push({
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        count: counts.get(key) ?? 0,
      });
    }
    return bars;
  }, [counts]);
  const weekMax = useMemo(() => Math.max(1, ...weeklyBars.map((b) => b.count)), [weeklyBars]);

  // ── Geo breakdown ─────────────────────────────────────────────────────────────
  const geoData = useMemo(() => {
    const filtered =
      geoFilter === "all"
        ? apps
        : apps.filter((a) => {
            const isRemote =
              a.work_type === "Remote" ||
              (a.location?.toLowerCase().includes("remote") ?? false);
            return geoFilter === "remote" ? isRemote : !isRemote;
          });

    const locMap = new Map<string, number>();
    for (const a of filtered) {
      if (!a.location) continue;
      const key = a.location.split(",")[0].trim();
      locMap.set(key, (locMap.get(key) ?? 0) + 1);
    }
    return Array.from(locMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [apps, geoFilter]);

  // ── Streak dots (last 7 days) ──────────────────────────────────────────────────
  const streakDots = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return (counts.get(dayKey(d)) ?? 0) > 0;
    });
  }, [counts]);

  const activeDays = streakDots.filter(Boolean).length;

  return (
    <div className="bento-view-root">
      <div className="bento-main">

        {/* ── Page Header ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
          <div className="bento-page-header">
            <h1 className="bento-page-title">
              Intelligence &amp; Analytics
              <span className="live-badge">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", display: "inline-block", animation: "pulse 2s infinite" }} />
                Live Sync
              </span>
            </h1>
            <p className="bento-page-sub">
              Comprehensive tracking of pipeline velocity, response signals, and search distribution.
            </p>
          </div>
          <button className="apps-btn" type="button" onClick={load} title="Refresh analytics">
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>refresh</span>
            Refresh
          </button>
        </div>

        {/* ── Metric Cards (4-up) ───────────────────────────────────────── */}
        <div className="bento-metrics-grid">
          {/* Today */}
          <div className="metric-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="metric-label">TODAY</span>
              <span className={`metric-badge ${todayCount > 0 ? "success" : "neutral"}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  {todayCount > 0 ? "trending_up" : "trending_flat"}
                </span>
                {todayCount > 0 ? `+${todayCount} today` : "none yet"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0.25rem 0" }}>
              <span className="metric-value">{todayCount}</span>
              <span className="metric-sub">apps sent</span>
            </div>
            {/* Sparkline: last 8 hours */}
            <div className="sparkline-bars">
              {weeklyBars.map((b, i) => (
                <div
                  key={i}
                  className={`spark-bar${b.count === weekMax ? " peak" : ""}`}
                  style={{ height: `${Math.max(4, (b.count / weekMax) * 100)}%` }}
                  title={`${b.label}: ${b.count}`}
                />
              ))}
            </div>
          </div>

          {/* Total Volume */}
          <div className="metric-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="metric-label">TOTAL VOLUME</span>
              <span className="metric-badge neutral">Target 1,000</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0.25rem 0" }}>
              <span className="metric-value">{totalVolume}</span>
              <span className="metric-sub">/ 1,000 sent</span>
            </div>
            <div className="metric-divider" />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
              <span>Progress to Milestone</span>
              <span style={{ color: "var(--accent)" }}>{Math.min(100, ((totalVolume / 1000) * 100)).toFixed(1)}%</span>
            </div>
            <div className="metric-progress-track">
              <div
                className="metric-progress-fill"
                style={{ width: `${Math.min(100, (totalVolume / 1000) * 100)}%` }}
              />
            </div>
          </div>

          {/* Streak */}
          <div className="metric-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="metric-label">DAY STREAK</span>
              <span className={`metric-badge ${streak > 0 ? "warning" : "neutral"}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>local_fire_department</span>
                {streak > 0 ? "Active" : "Inactive"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0.25rem 0" }}>
              <span className="metric-value">{streak}</span>
              <span className="metric-sub">consecutive days</span>
            </div>
            <div className="metric-divider" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="streak-dots">
                {streakDots.map((active, i) => (
                  <span key={i} className={`streak-dot${active ? " active" : ""}`} />
                ))}
              </div>
              <span style={{ fontSize: "0.625rem", color: "var(--success)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {activeDays} of 7
              </span>
            </div>
          </div>

          {/* Response Ratio */}
          <div className="metric-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="metric-label">RESPONSE RATIO</span>
              <span className={`metric-badge ${parseFloat(funnelData.responseRate) > 10 ? "success" : "danger"}`}>
                {parseFloat(funnelData.responseRate) > 10 ? "On Track" : "Needs Follow-up"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0.25rem 0" }}>
              <span className="metric-value">{funnelData.responseRate}%</span>
              <span className="metric-sub">response rate</span>
            </div>
            <div className="metric-divider" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.6875rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>
                {totalVolume} sent · {funnelData.responseCount} replies
              </span>
              <span style={{ color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}>
                Follow-up cue →
              </span>
            </div>
          </div>
        </div>

        {/* ── Bento Grid ───────────────────────────────────────────────── */}
        <div className="bento-grid">

          {/* TILE A: Activity Heatmap + Weekly Pace ──────────────────── */}
          <div className="bento-tile span-7">
            <div className="tile-header">
              <div>
                <div className="tile-title">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--accent)" }}>calendar_view_month</span>
                  Activity Heatmap &amp; Velocity
                </div>
                <div className="tile-sub">{monthLabel} · {totalVolume} applications recorded</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  className="month-nav-btn"
                  type="button"
                  onClick={() => setViewMonth((m) => {
                    const d = new Date(m.year, m.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                </button>
                <span className="month-label">{monthLabel}</span>
                <button
                  className="month-nav-btn"
                  type="button"
                  onClick={() => setViewMonth((m) => {
                    const d = new Date(m.year, m.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              {/* Heatmap */}
              <div>
                {/* Day headers */}
                <div className="heatmap-grid" style={{ marginBottom: 6 }}>
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                    <div key={i} className="heatmap-day-header">{d}</div>
                  ))}
                </div>
                {/* Cells */}
                <div className="heatmap-grid">
                  {calendarCells.map((cell, i) => (
                    <div
                      key={i}
                      className={`heatmap-cell${cell.day === null ? " empty" : " " + heatColor(cell.count, calMax)}`}
                      title={cell.day ? `${monthLabel.split(" ")[0]} ${cell.day}: ${cell.count} app${cell.count !== 1 ? "s" : ""}` : ""}
                    >
                      {cell.day}
                    </div>
                  ))}
                </div>
                {/* Legend */}
                <div className="heatmap-legend">
                  <span>Density</span>
                  <div className="legend-swatches">
                    <span>Less</span>
                    {["var(--bg-inset)", "color-mix(in srgb, var(--success) 20%, var(--bg-card))", "color-mix(in srgb, var(--success) 45%, var(--bg-card))", "color-mix(in srgb, var(--success) 75%, var(--bg-card))", "var(--success)"].map((bg, i) => (
                      <span key={i} className="legend-swatch" style={{ background: bg }} />
                    ))}
                    <span>More</span>
                  </div>
                </div>
              </div>

              {/* Weekly Pace bar chart */}
              <div className="weekly-chart-wrap">
                <div className="weekly-chart-header">
                  <div>
                    <div className="weekly-chart-title">Weekly Pace</div>
                    <div className="weekly-chart-sub">Last 7 days</div>
                  </div>
                  <span className="metric-badge accent">{weeklyBars.reduce((s, b) => s + b.count, 0)} Apps</span>
                </div>
                <svg width="100%" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
                  {/* Grid lines */}
                  {[0, 33, 66, 100].map((y, i) => (
                    <line key={i} x1="24" x2="196" y1={y * 0.72 + 8} y2={y * 0.72 + 8} className="dashed-grid" />
                  ))}
                  {/* Bars */}
                  {weeklyBars.map((b, i) => {
                    const barH = weekMax > 0 ? (b.count / weekMax) * 72 : 0;
                    const x = 28 + i * 25;
                    return (
                      <g key={i}>
                        <rect
                          x={x}
                          y={80 - barH}
                          width={16}
                          height={Math.max(2, barH)}
                          rx={3}
                          fill={b.count === weekMax ? "var(--accent)" : "var(--accent-soft)"}
                        />
                        <text x={x + 8} y={96} textAnchor="middle" className="dashed-grid-text">
                          {b.label[0]}
                        </text>
                        {b.count > 0 && (
                          <text x={x + 8} y={77 - barH} textAnchor="middle" className="dashed-grid-text" style={{ fill: "var(--accent)", fontWeight: 700 }}>
                            {b.count}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          {/* TILE B: Forecast & Pipeline ──────────────────────────────── */}
          <div className="bento-tile span-5">
            <div className="tile-header">
              <div>
                <div className="tile-title">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--warning)" }}>monitoring</span>
                  Forecast &amp; Pipeline
                </div>
                <div className="tile-sub">Current funnel conversion</div>
              </div>
            </div>

            {/* Forecast alert */}
            {forecastData.dailyRate > 0 && (
              <div className="forecast-alert">
                <span className="material-symbols-outlined forecast-alert-icon">info</span>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>
                    Pace: {forecastData.dailyRate.toFixed(1)} apps/day
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                    {forecastData.projectedDate
                      ? `Projected to hit 1,000 by ${forecastData.projectedDate}`
                      : "Keep applying to hit your goal!"}
                  </div>
                </div>
              </div>
            )}

            {/* Funnel */}
            {[
              { label: "Applied", count: funnelData.applied, pct: 100 },
              { label: "Screening", count: funnelData.screening, pct: funnelData.applied > 0 ? (funnelData.screening / funnelData.applied) * 100 : 0 },
              { label: "Interview", count: funnelData.interview, pct: funnelData.applied > 0 ? (funnelData.interview / funnelData.applied) * 100 : 0 },
              { label: "Offer", count: funnelData.offer, pct: funnelData.applied > 0 ? (funnelData.offer / funnelData.applied) * 100 : 0 },
            ].map(({ label, count, pct }) => (
              <div key={label} className="funnel-row">
                <div className="funnel-label-row">
                  <span className="funnel-label">{label}</span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                    {count} · <span className="funnel-pct">{pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="funnel-track">
                  <div
                    className="funnel-fill"
                    style={{
                      width: `${pct}%`,
                      background: funnelColor(label.toLowerCase()),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* TILE C: Geographic Footprint ────────────────────────────── */}
          <div className="bento-tile span-5">
            <div className="tile-header">
              <div>
                <div className="tile-title">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--info)" }}>map</span>
                  Geographic Footprint
                </div>
                <div className="tile-sub">
                  {apps.filter((a) => a.work_type === "Remote" || a.location?.toLowerCase().includes("remote")).length} remote ·{" "}
                  {apps.length - apps.filter((a) => a.work_type === "Remote" || a.location?.toLowerCase().includes("remote")).length} on-site
                </div>
              </div>
              <div className="geo-filter-group">
                {(["all", "remote", "onsite"] as const).map((f) => (
                  <button
                    key={f}
                    className={`geo-filter-pill${geoFilter === f ? " active" : ""}`}
                    type="button"
                    onClick={() => setGeoFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {geoData.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {geoData.map(([city, count], i) => {
                  const pct = totalVolume > 0 ? (count / totalVolume) * 100 : 0;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: "7rem", fontSize: "0.75rem", color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {city}
                      </div>
                      <div className="funnel-track" style={{ flex: 1 }}>
                        <div className="funnel-fill" style={{ width: `${pct}%`, background: "var(--info)" }} />
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 700, width: "2rem", textAlign: "right" }}>
                        {count}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-faint)", fontSize: "0.75rem" }}>
                {apps.length === 0 ? "Add applications to see geographic data" : "No location data available"}
              </div>
            )}
          </div>

          {/* TILE D: Portal Effectiveness ───────────────────────────── */}
          <div className="bento-tile span-7">
            <div className="tile-header">
              <div>
                <div className="tile-title">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--success)" }}>hub</span>
                  Portal Effectiveness
                </div>
                <div className="tile-sub">Response rate by submission channel</div>
              </div>
            </div>

            {portals.length > 0 ? (
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Sent</th>
                    <th>Share</th>
                    <th style={{ width: "8rem" }}>Response Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {portals.map((p, i) => {
                    const share = totalVolume > 0 ? ((p.total / totalVolume) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={i}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div className="portal-badge">{p.portal.slice(0, 2).toUpperCase()}</div>
                            <span style={{ fontWeight: 600, color: "var(--text)" }}>{p.portal}</span>
                          </div>
                        </td>
                        <td style={{ color: "var(--text-secondary)", fontWeight: 700 }}>{p.total}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{share}%</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div className="velocity-bar-wrap">
                              <div
                                className="velocity-bar-fill"
                                style={{
                                  width: `${(p.responseRate * 100).toFixed(0)}%`,
                                  background: p.responseRate >= 0.2 ? "var(--success)" : "var(--accent)",
                                }}
                              />
                            </div>
                            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                              {(p.responseRate * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-faint)", fontSize: "0.75rem" }}>
                {apps.length === 0 ? "Add applications to see portal breakdown" : "No portal data available"}
              </div>
            )}
          </div>

          {/* TILE E: Salary Expectations ─────────────────────────────── */}
          <div className="bento-tile span-6">
            <div className="tile-header">
              <div>
                <div className="tile-title">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#a855f7" }}>payments</span>
                  Salary Expectations
                </div>
                <div className="tile-sub">
                  {salaryPts.length} data points · Median:{" "}
                  {medianSalary ? `$${(medianSalary / 1000).toFixed(0)}k` : "—"}
                </div>
              </div>
            </div>

            {salaryPts.length > 0 ? (
              <div className="salary-scatter-wrap">
                <svg width="100%" viewBox="0 0 300 120" preserveAspectRatio="xMidYMid meet">
                  {/* Axes */}
                  <line x1="30" x2="295" y1="100" y2="100" className="dashed-grid" />
                  <line x1="30" x2="30" y1="10" y2="100" className="dashed-grid" />
                  {/* Median line */}
                  {medianSalary && (() => {
                    const mn = Math.min(...salaryPts.map((p) => p.amount));
                    const mx = Math.max(...salaryPts.map((p) => p.amount));
                    const y = 100 - ((medianSalary - mn) / Math.max(1, mx - mn)) * 85;
                    return (
                      <line x1="30" x2="295" y1={y} y2={y} stroke="var(--warning)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
                    );
                  })()}
                  {/* Dots */}
                  {salaryPts.map((p, i) => {
                    const mn = Math.min(...salaryPts.map((q) => q.amount));
                    const mx = Math.max(...salaryPts.map((q) => q.amount));
                    const xRange = salaryPts.length > 1 ? salaryPts.length - 1 : 1;
                    const x = 34 + (i / xRange) * 255;
                    const y = 100 - ((p.amount - mn) / Math.max(1, mx - mn)) * 85;
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r={4}
                        fill="var(--accent)"
                        fillOpacity="0.75"
                        stroke="var(--accent)"
                        strokeWidth="1"
                      >
                        <title>${(p.amount / 1000).toFixed(0)}k — {p.day}</title>
                      </circle>
                    );
                  })}
                </svg>
                {medianSalary && (
                  <div className="salary-median-banner">
                    <span>Median Ask</span>
                    <span style={{ fontSize: "1rem", fontWeight: 800 }}>
                      ${(medianSalary / 1000).toFixed(0)}k / yr
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-faint)", fontSize: "0.75rem" }}>
                Add salary expectations to applications to see this chart
              </div>
            )}
          </div>

          {/* TILE F: Application Schedule & Timing ──────────────────── */}
          <div className="bento-tile span-6">
            <div className="tile-header">
              <div>
                <div className="tile-title">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--warning)" }}>schedule</span>
                  Application Timing Rhythm
                </div>
                <div className="tile-sub">Hour × Day heat (your actual submission times)</div>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="timing-matrix">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Day</th>
                    {HOURS_SHOWN.map((h) => (
                      <th key={h}>{h < 12 ? `${h}am` : h === 12 ? "12p" : `${h - 12}pm`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day, dow) => (
                    <tr key={dow}>
                      <td style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-secondary)", paddingRight: 8, whiteSpace: "nowrap" }}>
                        {day}
                      </td>
                      {HOURS_SHOWN.map((h) => {
                        const val = matrix[dow][h] ?? 0;
                        const cls = heatColor(val, matrixMax);
                        return (
                          <td key={h}>
                            <div
                              className={`timing-cell${cls ? " " + cls : ""}`}
                              title={`${day} ${h < 12 ? `${h}am` : `${h - 12}pm`}: ${val} app${val !== 1 ? "s" : ""}`}
                            >
                              {val > 0 ? val : ""}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {apps.length === 0 && (
              <div style={{ textAlign: "center", paddingTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-faint)" }}>
                Add applications to see your timing patterns
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
