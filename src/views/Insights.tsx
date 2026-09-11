/**
 * The analytics dashboard. The headline stats and monthly calendar are
 * pinned; every other chart lives in a customizable grid — hide, reorder
 * (drag while in Customize mode), and add user-built charts over any
 * field with common chart types.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import {
  countsByDay,
  currentStreak,
  dailySeries,
  dayKey,
} from "../lib/analytics";
import {
  BUILTIN_CHARTS,
  loadLayout,
  saveLayout,
  type CustomChartDef,
  type DashboardLayout,
} from "../lib/dashboard";
import type { AnomalyNote, Application, FieldDefinition } from "../types";
import AnomalyPanel from "../components/insights/AnomalyPanel";
import ChartBuilder from "../components/insights/ChartBuilder";
import CustomChart from "../components/insights/CustomChart";
import ForecastCard from "../components/insights/ForecastCard";
import FunnelChart from "../components/insights/FunnelChart";
import GeoMap from "../components/insights/GeoMap";
import HourHeatmap from "../components/insights/HourHeatmap";
import MomentumChart from "../components/insights/MomentumChart";
import MonthGrid from "../components/insights/MonthGrid";
import PortalTable from "../components/insights/PortalTable";
import SalaryChart from "../components/insights/SalaryChart";
import WeekBars from "../components/insights/WeekBars";
import "./Insights.css";

/** Builtin charts that span both grid columns. */
const WIDE_IDS = new Set(["momentum", "heatmap", "map"]);

export default function Insights() {
  const [apps, setApps] = useState<Application[]>([]);
  const [notes, setNotes] = useState<AnomalyNote[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [goalCount, setGoalCount] = useState<number | null | undefined>(
    undefined,
  );
  const [goalDeadline, setGoalDeadline] = useState<string | null>(null);
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const dragId = useRef<string | null>(null);

  const load = useCallback(() => {
    api.listApplications().then(setApps).catch(() => {});
    api.listAnomalyNotes().then(setNotes).catch(() => {});
    api.listFields().then(setFields).catch(() => {});
    loadLayout().then(setLayout);
    api
      .getSettings()
      .then((s) => {
        const count = parseInt(s.goal_count ?? "", 10);
        setGoalCount(Number.isFinite(count) && count > 0 ? count : null);
        setGoalDeadline(s.goal_deadline || null);
      })
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const counts = useMemo(() => countsByDay(apps), [apps]);
  const series = useMemo(() => dailySeries(apps), [apps]);
  const today = counts.get(dayKey(new Date())) ?? 0;
  const streak = useMemo(() => currentStreak(series), [series]);
  const interviewCount = useMemo(
    () => apps.filter((a) => a.status === "interview" || a.status === "screening").length,
    [apps],
  );
  const offerCount = useMemo(
    () => apps.filter((a) => a.status === "offer").length,
    [apps],
  );
  const conversionRate = useMemo(() => {
    if (apps.length === 0) return "0%";
    return `${Math.round((interviewCount / apps.length) * 100)}%`;
  }, [apps.length, interviewCount]);

  const saveGoal = async (count: number, deadline: string | null) => {
    await api.setSetting("goal_count", String(count));
    await api.setSetting("goal_deadline", deadline ?? "");
    setGoalCount(count);
    setGoalDeadline(deadline);
  };

  const saveAnomalyNote = async (
    day: string,
    direction: string,
    note: string,
  ) => {
    await api.saveAnomalyNote(day, "day", direction, note);
    api.listAnomalyNotes().then(setNotes).catch(() => {});
  };

  const applyLayout = (next: DashboardLayout) => {
    setLayout(next);
    saveLayout(next).catch(() => {});
  };

  const hideChart = (id: string) => {
    if (!layout) return;
    applyLayout({
      order: layout.order.filter((x) => x !== id),
      custom: layout.custom.filter((c) => c.id !== id || !id.startsWith("custom-")),
    });
  };

  const addBuiltin = (id: string) => {
    if (!layout || layout.order.includes(id)) return;
    applyLayout({ ...layout, order: [...layout.order, id] });
  };

  const addCustom = (def: CustomChartDef) => {
    if (!layout) return;
    applyLayout({
      order: [...layout.order, def.id],
      custom: [...layout.custom, def],
    });
  };

  const reorder = (fromId: string, toId: string) => {
    if (!layout || fromId === toId) return;
    const order = [...layout.order];
    const from = order.indexOf(fromId);
    const to = order.indexOf(toId);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, fromId);
    applyLayout({ ...layout, order });
  };

  const builtinRenderers: Record<string, () => ReactNode> = {
    week: () => <WeekBars counts={counts} />,
    forecast: () => (
      <ForecastCard
        series={series}
        total={apps.length}
        goalCount={goalCount}
        goalDeadline={goalDeadline}
        onSaveGoal={saveGoal}
      />
    ),
    funnel: () => <FunnelChart apps={apps} />,
    momentum: () => <MomentumChart series={series} />,
    heatmap: () => <HourHeatmap apps={apps} />,
    portals: () => <PortalTable apps={apps} />,
    salary: () => <SalaryChart apps={apps} />,
    map: () => <GeoMap apps={apps} />,
    anomalies: () => (
      <AnomalyPanel series={series} notes={notes} onSaveNote={saveAnomalyNote} />
    ),
  };

  if (apps.length === 0) {
    return (
      <div className="insights-empty">
        <h2>No data yet</h2>
        <p>
          Log your first application with the global hotkey or the New
          Application button, and this page comes alive.
        </p>
      </div>
    );
  }

  if (!layout) return null;

  const hiddenBuiltins = BUILTIN_CHARTS.map((c) => c.id).filter(
    (id) => !layout.order.includes(id),
  );

  const renderSlot = (id: string) => {
    const custom = layout.custom.find((c) => c.id === id);
    const content = custom ? (
      <CustomChart
        def={custom}
        apps={apps}
        fieldLabel={
          custom.field
            ? (fields.find((f) => f.key === custom.field)?.label ??
              (custom.field === "status" ? "Status" : custom.field))
            : "All applications by day"
        }
      />
    ) : (
      builtinRenderers[id]?.()
    );
    if (!content) return null;

    const wide = WIDE_IDS.has(id);
    return (
      <div
        key={id}
        className={`chart-slot ${wide ? "wide" : ""} ${editMode ? "editing" : ""}`}
        draggable={editMode}
        onDragStart={() => {
          dragId.current = id;
        }}
        onDragOver={(e) => {
          if (editMode) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId.current) reorder(dragId.current, id);
          dragId.current = null;
        }}
      >
        {editMode && (
          <div className="chart-slot-controls">
            <span className="chart-slot-grip" title="Drag to reorder">
              ⠿
            </span>
            <button
              className="chart-slot-hide"
              title="Remove from dashboard"
              onClick={() => hideChart(id)}
            >
              ×
            </button>
          </div>
        )}
        {content}
      </div>
    );
  };

  return (
    <div className="insights-bento-view">
      {/* 4 BENTO STAT METRICS */}
      <div className="insights-stats-bento">
        {/* Total Applications */}
        <div className="bento-stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Applications</span>
            <span className="stat-icon-wrapper icon-indigo">
              <span className="material-symbols-outlined">send</span>
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-val">{apps.length}</span>
            <span className="stat-card-pill pill-indigo">Active pipeline</span>
          </div>
        </div>

        {/* Interviews & Screening */}
        <div className="bento-stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Interviews &amp; Screenings</span>
            <span className="stat-icon-wrapper icon-amber">
              <span className="material-symbols-outlined">forum</span>
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-val">{interviewCount}</span>
            <span className="stat-card-pill pill-amber">{conversionRate} response rate</span>
          </div>
        </div>

        {/* Offers */}
        <div className="bento-stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Offers Received</span>
            <span className="stat-icon-wrapper icon-emerald">
              <span className="material-symbols-outlined">verified</span>
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-val">{offerCount}</span>
            <span className="stat-card-pill pill-emerald">
              {offerCount > 0 ? "🎉 Congratulations!" : "Targeting offers"}
            </span>
          </div>
        </div>

        {/* Activity & Streak */}
        <div className="bento-stat-card">
          <div className="stat-card-header">
            <span className="stat-card-label">Activity Streak</span>
            <span className="stat-icon-wrapper icon-purple">
              <span className="material-symbols-outlined">local_fire_department</span>
            </span>
          </div>
          <div className="stat-card-body">
            <span className="stat-card-val">{streak} <span className="stat-val-unit">days</span></span>
            <span className="stat-card-pill pill-purple">{today} applied today</span>
          </div>
        </div>
      </div>

      <div className="insights-toolbar">
        <span className="insights-toolbar-hint">
          {editMode
            ? "Drag cards to reorder · × to remove · changes save automatically"
            : "Customizable Analytics Grid"}
        </span>
        <div className="insights-toolbar-actions">
          {editMode && (
            <button
              type="button"
              className="btn-add-chart"
              onClick={() => setShowBuilder(true)}
            >
              <span className="material-symbols-outlined">add</span>
              Add chart
            </button>
          )}
          <button
            type="button"
            className={`btn-customize ${editMode ? "primary" : ""}`}
            onClick={() => setEditMode(!editMode)}
          >
            <span className="material-symbols-outlined">
              {editMode ? "check" : "tune"}
            </span>
            {editMode ? "Done" : "Customize"}
          </button>
        </div>
      </div>

      <div className="insights-grid">
        <div className="chart-slot">
          <MonthGrid counts={counts} />
        </div>
        {layout.order.map(renderSlot)}
      </div>

      {showBuilder && (
        <ChartBuilder
          hiddenBuiltins={hiddenBuiltins}
          fields={fields.filter((f) => f.visible)}
          onAddBuiltin={(id) => {
            addBuiltin(id);
            setShowBuilder(false);
          }}
          onAddCustom={addCustom}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </div>
  );
}
