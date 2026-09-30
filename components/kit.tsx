import type { ReactNode } from "react";

export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
export const compactInr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${(n / 1e3).toFixed(1)}k` : inr(n);
export const num = (n: number) => Math.round(n).toLocaleString("en-IN");
export const pct = (n: number, d = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(d)}%`;

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </header>
  );
}

export function Card({ title, sub, action, children, className = "", id }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, delta, tone }: { label: string; value: ReactNode; delta?: ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta && <div className={`delta ${tone ?? ""}`}>{delta}</div>}
    </div>
  );
}

export function Badge({ tone, children }: { tone?: "good" | "warn" | "bad" | "accent" | "violet" | "outline"; children: ReactNode }) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
}

const AVATAR_BG = ["#c9803f", "#5b6bd8", "#2f9c7a", "#b4568a", "#7a6a58", "#d0663a", "#4b86b4", "#8a63c9"];
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className="avatar" style={{ background: AVATAR_BG[h % AVATAR_BG.length], width: size, height: size, fontSize: size * 0.37 }} aria-hidden>
      {initials}
    </span>
  );
}

export function Person({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <div className="person">
      <Avatar name={name} />
      <div style={{ minWidth: 0 }}>
        <div className="n">{name}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
    </div>
  );
}

export function TierBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="badge outline">
      <span className="dot" style={{ color }} />
      {name}
    </span>
  );
}

export function DemoBanner({ demo }: { demo: boolean }) {
  if (!demo) return null;
  return (
    <div className="demo-banner" role="note">
      <span>🧪</span>
      <span>
        Running on demo data. Changes last until the server restarts. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to <code>.env</code> to connect your database.
      </span>
    </div>
  );
}

/** Stamp-track progress bar from the reference design: stops at each milestone, knob at current value. */
export function Track({ value, stops, max }: { value: number; stops: number[]; max?: number }) {
  const top = max ?? Math.max(...stops, value);
  const at = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  return (
    <div>
      <div className="track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={top}>
        <div className="track-fill" style={{ width: at(value) }} />
        {stops.map((s) => (
          <span key={s} className="track-stop" style={{ left: at(s), background: s <= value ? "#fff" : "#fff" }} />
        ))}
        <span className="track-knob" style={{ left: at(value) }} />
      </div>
      <div className="track-labels">
        {stops.map((s) => (
          <span key={s} style={{ left: at(s) }}>
            {num(s)}
          </span>
        ))}
      </div>
    </div>
  );
}
