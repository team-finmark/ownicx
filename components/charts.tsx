"use client";

import { useState } from "react";

export interface Series {
  name: string;
  color: string; // CSS var, e.g. "var(--s1)"
  values: number[];
}

export type Fmt = "int" | "inr" | "pct";
const FMT: Record<Fmt, (n: number) => string> = {
  int: (n) => Math.round(n).toLocaleString("en-IN"),
  inr: (n) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(0)}k` : `₹${Math.round(n)}`),
  pct: (n) => `${n.toFixed(0)}%`,
};

const W = 640;
const H = 220;
const PAD = { t: 12, r: 8, b: 26, l: 44 };

function niceMax(v: number) {
  // Top of axis = 4 × a "nice" step (1, 2, 2.5, 5 × 10^n) so every gridline lands on a round number.
  if (v <= 0) return 4;
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw)!;
  return Math.max(4, step * 4);
}

function Axis({ max, fmt }: { max: number; fmt: (n: number) => string }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
          <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end">
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="legend" style={{ marginBottom: 10 }}>
      {series.map((s) => (
        <span key={s.name}>
          <i style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** Grouped vertical bars with per-group hover tooltip. */
export function BarChart({ labels, series, format = "int" }: { labels: string[]; series: Series[]; format?: Fmt }) {
  const fmt = FMT[format];
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const band = plotW / labels.length;
  const gap = 2;
  const barW = Math.min(22, (band * 0.62 - gap * (series.length - 1)) / series.length);
  const groupW = barW * series.length + gap * (series.length - 1);

  return (
    <div className="chart">
      <Legend series={series} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(", ")} onMouseLeave={() => setHover(null)}>
        <Axis max={max} fmt={fmt} />
        {labels.map((l, i) => {
          const x0 = PAD.l + band * i + (band - groupW) / 2;
          return (
            <g key={l}>
              {hover === i && <rect x={PAD.l + band * i + 2} y={PAD.t} width={band - 4} height={plotH} fill="var(--subtle)" rx={6} />}
              {series.map((s, k) => {
                const v = s.values[i] ?? 0;
                const h = (v / max) * plotH;
                const x = x0 + k * (barW + gap);
                const y = PAD.t + plotH - h;
                const r = Math.min(4, barW / 2, h);
                // Rounded top only; flat at the baseline.
                return (
                  <path
                    key={s.name}
                    d={`M${x},${PAD.t + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${PAD.t + plotH} Z`}
                    fill={s.color}
                  />
                );
              })}
              <text x={PAD.l + band * i + band / 2} y={H - 8} textAnchor="middle">
                {l}
              </text>
              <rect x={PAD.l + band * i} y={PAD.t} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${((PAD.l + band * hover + band / 2) / W) * 100}%`, top: `${(PAD.t / H) * 100 + 18}%` }}>
          <div className="muted" style={{ marginBottom: 4 }}>
            {labels[hover]}
          </div>
          {series.map((s) => (
            <div key={s.name} className="row" style={{ gap: 6 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
              {s.name} <b className="num">{fmt(s.values[hover] ?? 0)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Line chart with crosshair + tooltip. */
export function LineChart({ labels, series, format = "int" }: { labels: string[]; series: Series[]; format?: Fmt }) {
  const fmt = FMT[format];
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (labels.length === 1 ? plotW / 2 : (plotW * i) / (labels.length - 1));
  const y = (v: number) => PAD.t + plotH * (1 - v / max);

  return (
    <div className="chart">
      <Legend series={series} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={series.map((s) => s.name).join(", ")}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const i = Math.round(((px - PAD.l) / plotW) * (labels.length - 1));
          setHover(Math.max(0, Math.min(labels.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <Axis max={max} fmt={fmt} />
        {labels.map((l, i) =>
          i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1 ? (
            <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + plotH} stroke="var(--border-strong)" strokeWidth={1} />}
        {series.map((s) => (
          <g key={s.name}>
            <path
              d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(Math.min(...series.map((s) => y(s.values[hover] ?? 0))) / H) * 100}%` }}>
          <div className="muted" style={{ marginBottom: 4 }}>
            {labels[hover]}
          </div>
          {series.map((s) => (
            <div key={s.name} className="row" style={{ gap: 6 }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
              {s.name} <b className="num">{fmt(s.values[hover] ?? 0)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal 100% bar for composition (e.g. members per tier), 2px gaps between segments. */
export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", gap: 2, height: 14, borderRadius: 999, overflow: "hidden" }} onMouseLeave={() => setHover(null)}>
        {parts.map((p, i) => (
          <div
            key={p.label}
            title={`${p.label}: ${p.value}`}
            onMouseEnter={() => setHover(i)}
            style={{ flex: p.value, background: p.color, opacity: hover === null || hover === i ? 1 : 0.45, transition: "opacity .15s", minWidth: p.value ? 4 : 0 }}
          />
        ))}
      </div>
      <div className="legend mt-16" style={{ justifyContent: "space-between" }}>
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <b className="num" style={{ color: "var(--text)" }}>{p.value}</b>
            <span className="muted num">({Math.round((p.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
