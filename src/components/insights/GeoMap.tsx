/**
 * Interactive Geographic Footprint Map
 * Rendered offline with d3-geo & topojson-client.
 * Features:
 *  - High-precision USA composite projection (geoAlbersUsa) & Global projection (geoNaturalEarth1)
 *  - 🇺🇸 USA vs 🌍 World quick-toggle + full country selector
 *  - Animated pulse pins with hover tooltips
 *  - Coordinated hover between map pins and top cities list
 *  - Remote role metrics and unmapped location badges
 *  - 100% theme-aware CSS variables for dark / light modes
 */

import { useEffect, useMemo, useState } from "react";
import { geoAlbersUsa, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection } from "geojson";
import { api } from "../../api";
import { geolocate } from "../../lib/geo";
import type { Application } from "../../types";

const WIDTH = 680;
const HEIGHT = 380;
const WORLD = "__world__";
const USA_NAME = "United States of America";

interface Hover {
  x: number;
  y: number;
  label: string;
  count: number;
}

interface Props {
  apps: Application[];
  className?: string;
  hideCardHeader?: boolean;
}

export default function GeoMap({ apps, className = "" }: Props) {
  const [world, setWorld] = useState<FeatureCollection | null>(null);
  const [country, setCountry] = useState<string>(USA_NAME);
  const [hover, setHover] = useState<Hover | null>(null);
  const [highlightedCity, setHighlightedCity] = useState<string | null>(null);

  useEffect(() => {
    import("world-atlas/countries-110m.json").then((topo) => {
      const t = topo.default as unknown as Parameters<typeof feature>[0];
      const countries = (t.objects as Record<string, Parameters<typeof feature>[1]>).countries;
      setWorld(feature(t, countries) as unknown as FeatureCollection);
    });

    api
      .getSettings()
      .then((s) => {
        if (s.geo_country) setCountry(s.geo_country);
      })
      .catch(() => {});
  }, []);

  const countryNames = useMemo(() => {
    if (!world) return [];
    return world.features
      .map((f) => String((f.properties as { name?: string })?.name ?? ""))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [world]);

  const usaFeature = useMemo(() => {
    if (!world) return null;
    return (
      world.features.find(
        (f) =>
          (f.properties as { name?: string })?.name === USA_NAME ||
          (f.properties as { name?: string })?.name === "United States",
      ) ?? null
    );
  }, [world]);

  const selectedFeature: Feature | null = useMemo(() => {
    if (!world || country === WORLD) return null;
    return (
      world.features.find(
        (f) => (f.properties as { name?: string })?.name === country,
      ) ?? null
    );
  }, [world, country]);

  const isUsa = country === USA_NAME || country === "United States";

  const projection = useMemo(() => {
    if (isUsa && usaFeature) {
      const p = geoAlbersUsa();
      try {
        p.fitSize([WIDTH, HEIGHT], usaFeature as Parameters<typeof p.fitSize>[1]);
      } catch {
        p.scale(850).translate([WIDTH / 2, HEIGHT / 2]);
      }
      return p;
    }

    const p = geoNaturalEarth1();
    if (selectedFeature) {
      p.fitExtent(
        [
          [20, 20],
          [WIDTH - 20, HEIGHT - 20],
        ],
        selectedFeature as Parameters<typeof p.fitExtent>[1],
      );
    } else {
      p.fitSize([WIDTH, HEIGHT], { type: "Sphere" });
    }
    return p;
  }, [isUsa, usaFeature, selectedFeature]);

  const path = useMemo(() => geoPath(projection), [projection]);

  const { points, remoteCount, unmatched } = useMemo(
    () => geolocate(apps.map((a) => a.location ?? "")),
    [apps],
  );

  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const totalMapped = points.reduce((sum, p) => sum + p.count, 0);

  const changeCountry = (value: string) => {
    setCountry(value);
    setHover(null);
    setHighlightedCity(null);
    api.setSetting("geo_country", value === WORLD ? "" : value).catch(() => {});
  };

  // Top mapped cities
  const sortedPoints = useMemo(
    () => [...points].sort((a, b) => b.count - a.count),
    [points],
  );

  return (
    <div className={`geo-bento-card ${className}`}>
      {/* ── Top Bar Controls ────────────────────────────────────────── */}
      <div className="geo-header-row">
        <div>
          <div className="geo-card-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--accent)" }}>
              explore
            </span>
            Geographic Footprint &amp; Location Map
          </div>
          <div className="geo-card-sub">
            {totalMapped} mapped {totalMapped === 1 ? "application" : "applications"} · {remoteCount} remote · {points.length} locations
          </div>
        </div>

        <div className="geo-controls-group">
          {/* Quick toggle presets */}
          <div className="geo-presets-pill">
            <button
              type="button"
              className={`geo-preset-btn ${isUsa ? "active" : ""}`}
              onClick={() => changeCountry(USA_NAME)}
            >
              🇺🇸 USA
            </button>
            <button
              type="button"
              className={`geo-preset-btn ${country === WORLD ? "active" : ""}`}
              onClick={() => changeCountry(WORLD)}
            >
              🌍 Global
            </button>
          </div>

          {/* Detailed country dropdown */}
          <select
            className="geo-country-dropdown"
            value={country}
            onChange={(e) => changeCountry(e.target.value)}
            aria-label="Select country projection"
          >
            <option value={USA_NAME}>🇺🇸 United States</option>
            <option value={WORLD}>🌍 Entire World</option>
            <optgroup label="Other Countries">
              {countryNames
                .filter((n) => n !== USA_NAME)
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* ── Main Map Canvas & Side Stats ────────────────────────────── */}
      <div className="geo-layout-body">
        {/* SVG Map Container */}
        <div className="geo-svg-panel">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="geo-interactive-svg"
            role="img"
            aria-label={`Geographic map of ${isUsa ? "United States" : country}`}
          >
            <defs>
              <radialGradient id="geoDotGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </radialGradient>
              <filter id="glowBlur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Land Boundaries */}
            {world && (
              <g className="geo-land-group">
                {(isUsa && usaFeature
                  ? [usaFeature]
                  : selectedFeature
                  ? [selectedFeature]
                  : world.features
                ).map((f, i) => (
                  <path
                    key={i}
                    d={path(f) ?? undefined}
                    className="geo-land-path"
                  />
                ))}
              </g>
            )}

            {/* City Location Pins */}
            {points.map((p) => {
              const pos = projection([p.lon, p.lat]);
              if (!pos) return null;
              const [x, y] = pos;
              if (isNaN(x) || isNaN(y) || x < 0 || x > WIDTH || y < 0 || y > HEIGHT) return null;

              const isCityActive =
                hover?.label === p.label ||
                highlightedCity?.toLowerCase() === p.label.toLowerCase() ||
                highlightedCity?.toLowerCase() === p.label.split(",")[0].toLowerCase();

              const baseRadius = 3.5 + (p.count / maxCount) * 8;
              const r = isCityActive ? baseRadius + 3 : baseRadius;

              return (
                <g
                  key={p.label}
                  className={`geo-pin-group ${isCityActive ? "active" : ""}`}
                  onMouseEnter={() => setHover({ x, y, label: p.label, count: p.count })}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* Radar pulse wave for high activity */}
                  {(p.count >= 2 || isCityActive) && (
                    <circle
                      cx={x}
                      cy={y}
                      r={r + 8}
                      className="geo-pin-pulse"
                    />
                  )}

                  {/* Outer aura */}
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 3}
                    fill="var(--accent-soft)"
                    opacity={isCityActive ? 0.9 : 0.4}
                  />

                  {/* Core dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    className="geo-pin-core"
                  />

                  {/* Label for top cities */}
                  {(p.count >= 2 || isCityActive) && (
                    <text
                      x={x}
                      y={y - r - 4}
                      textAnchor="middle"
                      className="geo-pin-label"
                    >
                      {p.label.split(",")[0]} ({p.count})
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Floating Tooltip */}
          {hover && (
            <div
              className="geo-floating-tooltip"
              style={{
                left: `${(hover.x / WIDTH) * 100}%`,
                top: `${(hover.y / HEIGHT) * 100}%`,
              }}
            >
              <div className="geo-tooltip-city">{hover.label}</div>
              <div className="geo-tooltip-stats">
                <span className="geo-tooltip-count">{hover.count}</span> applications
                {apps.length > 0 && (
                  <span className="geo-tooltip-pct">
                    {" "}({((hover.count / apps.length) * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Zero state banner if no points */}
          {points.length === 0 && (
            <div className="geo-empty-state">
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: "var(--text-faint)" }}>
                location_off
              </span>
              <p>No geographic locations detected in your applications yet.</p>
              <span>Add locations like "San Francisco, CA" or "New York, NY" to see pins on the map.</span>
            </div>
          )}
        </div>

        {/* ── Side Leaderboard: Top Locations ────────────────────── */}
        <div className="geo-side-panel">
          <div className="geo-side-title">Top Application Hubs</div>
          {sortedPoints.length > 0 ? (
            <div className="geo-cities-list">
              {sortedPoints.slice(0, 7).map((p, i) => {
                const pct = apps.length > 0 ? (p.count / apps.length) * 100 : 0;
                const isHovered =
                  hover?.label === p.label ||
                  highlightedCity?.toLowerCase() === p.label.toLowerCase();

                return (
                  <div
                    key={i}
                    className={`geo-city-row ${isHovered ? "hovered" : ""}`}
                    onMouseEnter={() => setHighlightedCity(p.label)}
                    onMouseLeave={() => setHighlightedCity(null)}
                  >
                    <div className="geo-city-info">
                      <span className="geo-city-rank">#{i + 1}</span>
                      <span className="geo-city-name" title={p.label}>
                        {p.label}
                      </span>
                      <span className="geo-city-count">
                        {p.count}
                        <span style={{ fontSize: "0.625rem", color: "var(--text-faint)", fontWeight: 500, marginLeft: 4 }}>
                          ({pct.toFixed(0)}%)
                        </span>
                      </span>
                    </div>
                    <div className="geo-bar-track">
                      <div
                        className="geo-bar-fill"
                        style={{ width: `${Math.max(8, (p.count / maxCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="geo-side-empty">Locations will appear here as you log jobs.</p>
          )}

          {/* Remote & Unmatched Badges */}
          <div className="geo-meta-badges">
            {remoteCount > 0 && (
              <div className="geo-badge remote">
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  wifi
                </span>
                {remoteCount} Remote Role{remoteCount === 1 ? "" : "s"}
              </div>
            )}
            {unmatched.size > 0 && (
              <div className="geo-badge unmatched" title={[...unmatched.keys()].join(", ")}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  help_outline
                </span>
                {unmatched.size} Unrecognized
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
