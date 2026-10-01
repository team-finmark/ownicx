"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, Check, CheckCheck, Play, RotateCcw, ShieldCheck, Sparkles, Wand2, X, Zap } from "lucide-react";
import { renderTemplate } from "@/lib/engine";
import { cn } from "@/lib/utils";
import "@/app/simulator.css";

export interface SimMember {
  id: string;
  name: string;
  phone: string;
  points: number;
  tier: string;
  optIn: boolean;
  lastService: string | null;
  daysSince: number | null;
}

export interface SimRule {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  template: string;
  config: Record<string, unknown>;
  serviceName: string | null;
}

const CAMPAIGN_TEMPLATE = "Hi {{first_name}} ✨ {{offer}} at {{salon}} — just for you. Book: {{booking_link}}";
const DAY = 86_400_000;
const fmtDate = (ms: number) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(ms);
const clock = () => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(Date.now());

/** A stable sample coupon code per member, so replays look the same. */
function sampleCode(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "OWN";
  for (let i = 0; i < 6; i++) out += abc[(h >>> (i * 5)) % abc.length];
  return out;
}

/** Same variables the automation engine fills, built from the member and rule. */
function personalise(m: SimMember, rule: SimRule | null, offerText: string, salon: string, bookingLink: string) {
  const now = Date.now();
  const cfg = rule?.config ?? {};
  const num = (k: string, d: number) => (typeof cfg[k] === "number" ? (cfg[k] as number) : d);
  const vars: Record<string, string | number> = {
    first_name: m.name.split(" ")[0],
    salon,
    points: m.points,
    tier: m.tier,
    booking_link: bookingLink,
  };
  let trigger = "";
  const template = rule ? rule.template : CAMPAIGN_TEMPLATE;
  switch (rule?.type ?? "campaign") {
    case "revisit_reminder": {
      const after = num("days_after", 60);
      const days = m.daysSince !== null && m.daysSince >= after ? m.daysSince : after + 1;
      vars.service = rule?.serviceName ?? m.lastService ?? "visit";
      vars.days = days;
      trigger = m.daysSince !== null && m.daysSince >= after
        ? `Last ${vars.service} was ${days} days ago — this rule fires at ${after} days.`
        : `Simulated: last ${vars.service} ${days} days ago (rule fires at ${after} days).`;
      break;
    }
    case "milestone_offer": {
      const threshold = num("points_threshold", 150);
      vars.offer = num("discount_value", 150);
      vars.code = sampleCode(m.id);
      vars.expiry = fmtDate(now + num("validity_days", 14) * DAY);
      vars.offer_label = `₹${vars.offer} off any service`;
      vars.points = Math.max(m.points, threshold);
      trigger = m.points >= threshold ? `${m.points} points — the ₹${vars.offer} offer unlocks at ${threshold}.` : `Simulated: ${m.name.split(" ")[0]} reaches ${threshold} points on the next visit.`;
      break;
    }
    case "expiry_nudge": {
      vars.code = sampleCode(m.id);
      vars.offer = 150;
      vars.offer_label = "₹150 off any service";
      vars.days_left = 3;
      vars.expiry = fmtDate(now + 3 * DAY);
      trigger = `Coupon ${vars.code} expires in 3 days — the countdown nudge fires.`;
      break;
    }
    case "winback": {
      const inactive = num("inactive_days", 120);
      vars.bonus = num("bonus_points", 20);
      vars.days = m.daysSince !== null && m.daysSince >= inactive ? m.daysSince : inactive + 5;
      vars.points = m.points + Number(vars.bonus);
      trigger = `No visit for ${vars.days} days (rule: ${inactive}) — ${vars.bonus} bonus points added.`;
      break;
    }
    case "birthday": {
      vars.offer = num("discount_value", 200);
      vars.code = sampleCode(m.id);
      vars.expiry = fmtDate(now + num("validity_days", 7) * DAY);
      trigger = "Simulated: it's their birthday today.";
      break;
    }
    default: {
      vars.offer = offerText.trim() || "Free hair spa with any haircut";
      trigger = "Campaign launched to an audience that includes this member.";
    }
  }
  return { template, vars, text: renderTemplate(template, vars), trigger };
}

/** Template with {{variables}} shown as chips that flip to the member's values. */
function TemplateFlip({ template, vars, filled }: { template: string; vars: Record<string, string | number>; filled: boolean }) {
  const parts = template.split(/(\{\{\s*\w+\s*\}\})/g);
  return (
    <p className="sim-template">
      {parts.map((p, i) => {
        const m = p.match(/^\{\{\s*(\w+)\s*\}\}$/);
        if (!m) return <span key={i}>{p}</span>;
        const v = m[1] in vars ? String(vars[m[1]]) : p;
        return (
          <span key={i} className={cn("sim-var", filled && "is-filled")} style={{ transitionDelay: `${i * 45}ms` }}>
            <span className="sim-var-name">{`{{${m[1]}}}`}</span>
            <span className="sim-var-value">{v}</span>
          </span>
        );
      })}
    </p>
  );
}

/** Customer face: neutral → delighted, with blush and floating hearts. */
function Face({ happy, name }: { happy: boolean; name: string }) {
  return (
    <div className={cn("sim-face", happy && "is-happy")} aria-label={happy ? `${name} is happy` : `${name}`}>
      <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden>
        <circle cx="60" cy="60" r="54" fill="#ffd56b" stroke="#e9b23c" strokeWidth="3" />
        {/* eyes */}
        <g className="eyes-open">
          <ellipse cx="42" cy="50" rx="6" ry="8" fill="#3b2a1e" />
          <ellipse cx="78" cy="50" rx="6" ry="8" fill="#3b2a1e" />
        </g>
        <g className="eyes-happy" fill="none" stroke="#3b2a1e" strokeWidth="5" strokeLinecap="round">
          <path d="M34 52 Q42 42 50 52" />
          <path d="M70 52 Q78 42 86 52" />
        </g>
        {/* cheeks */}
        <g className="cheeks" fill="#ff8a80">
          <ellipse cx="30" cy="70" rx="9" ry="6" />
          <ellipse cx="90" cy="70" rx="9" ry="6" />
        </g>
        {/* mouths */}
        <path className="mouth-flat" d="M44 80 L76 80" stroke="#3b2a1e" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path className="mouth-smile" d="M38 74 Q60 104 82 74 Z" fill="#7a2e1d" stroke="#3b2a1e" strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <span className="sim-heart h1">❤️</span>
      <span className="sim-heart h2">💖</span>
      <span className="sim-heart h3">✨</span>
      <span className="sim-heart h4">💚</span>
    </div>
  );
}

const STEPS = [
  { key: "trigger", label: "Trigger", icon: Zap, ms: 1000 },
  { key: "personalise", label: "Personalise", icon: Wand2, ms: 1900 },
  { key: "consent", label: "Consent check", icon: ShieldCheck, ms: 800 },
  { key: "send", label: "Send", icon: BellRing, ms: 1300 },
  { key: "delivered", label: "Delivered", icon: Check, ms: 1100 },
  { key: "read", label: "Read", icon: CheckCheck, ms: 1400 },
] as const;

export function WhatsAppSimulator({
  members,
  rules,
  salon,
  bookingLink,
  connection,
}: {
  members: SimMember[];
  rules: SimRule[];
  salon: string;
  bookingLink: string;
  connection: { automatic: boolean; phone: string | null; name: string };
}) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [ruleId, setRuleId] = useState(rules.find((r) => r.enabled)?.id ?? "campaign");
  const [offer, setOffer] = useState("Free hair spa with any haircut");
  const [phase, setPhase] = useState(-1); // -1 idle · 0..5 steps · 6 done
  const [blocked, setBlocked] = useState(false);
  const [time, setTime] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const member = members.find((m) => m.id === memberId) ?? members[0];
  const rule = rules.find((r) => r.id === ruleId) ?? null;
  const sim = useMemo(() => (member ? personalise(member, rule, offer, salon, bookingLink) : null), [member, rule, offer, salon, bookingLink]);

  useEffect(() => setTime(clock()), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase(-1);
    setBlocked(false);
  };

  const run = () => {
    if (!member) return;
    reset();
    setTime(clock());
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0;
    STEPS.forEach((s, i) => {
      timers.current.push(
        setTimeout(() => {
          setPhase(i);
          // Consent is a real gate: a member who hasn't opted in never gets the message.
          if (s.key === "consent" && !member.optIn) {
            setBlocked(true);
            timers.current.forEach(clearTimeout);
          }
        }, t),
      );
      t += reduce ? 150 : s.ms;
    });
    timers.current.push(setTimeout(() => setPhase(6), t));
  };

  if (!member || !sim) return <div className="card empty">Add a member first to use the simulator.</div>;

  const first = member.name.split(" ")[0];
  const sending = phase >= 3 && !blocked;
  const delivered = phase >= 4 && !blocked;
  const read = phase >= 5 && !blocked;
  const done = phase >= 6 && !blocked;
  const stepState = (i: number) => (blocked && STEPS[i].key === "consent" ? "blocked" : phase > i || done ? "done" : phase === i ? "active" : "todo");

  return (
    <div className="sim-grid">
      {/* ---------- Controls + process ---------- */}
      <div className="stack">
        <div className="card">
          <div className="grid g-2" style={{ gap: 12 }}>
            <div className="field">
              <label htmlFor="sim-m">Member</label>
              <select id="sim-m" className="select" value={memberId} onChange={(e) => { setMemberId(e.target.value); reset(); }}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.optIn ? "" : " · no WhatsApp consent"}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sim-r">Message</label>
              <select id="sim-r" className="select" value={ruleId} onChange={(e) => { setRuleId(e.target.value); reset(); }}>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.enabled ? "" : " (paused)"}</option>
                ))}
                <option value="campaign">Campaign offer…</option>
              </select>
            </div>
          </div>
          {ruleId === "campaign" && (
            <div className="field mt-16">
              <label htmlFor="sim-o">Campaign offer</label>
              <input id="sim-o" className="input" value={offer} maxLength={120} onChange={(e) => { setOffer(e.target.value); reset(); }} />
            </div>
          )}
          <div className="row mt-16 wrap">
            <button type="button" className="btn primary btn-lg" onClick={run} disabled={phase >= 0 && phase < 6 && !blocked}>
              {phase === -1 ? <><Play className="size-4" /> Send simulation</> : phase < 6 && !blocked ? "Sending…" : <><RotateCcw className="size-4" /> Replay</>}
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              {connection.automatic ? `Automatic sending from ${connection.phone ?? "your number"}` : "Tap-to-send mode (free)"} · simulation only, nothing is sent
            </span>
          </div>
        </div>

        <ol className="sim-steps" aria-live="polite">
          {STEPS.map((s, i) => {
            const st = stepState(i);
            return (
              <li key={s.key} className={cn("sim-step", `is-${st}`)}>
                <span className="sim-step-dot">{st === "done" ? <Check className="size-4" /> : st === "blocked" ? <X className="size-4" /> : <s.icon className="size-4" />}</span>
                <div className="sim-step-body">
                  <p className="sim-step-title">{s.label}</p>
                  {s.key === "trigger" && st !== "todo" && <p className="sim-step-text">{sim.trigger}</p>}
                  {s.key === "personalise" && st !== "todo" && (
                    <>
                      <p className="sim-step-text">Variables fill in from {first}&apos;s profile:</p>
                      <TemplateFlip template={sim.template} vars={sim.vars} filled={phase >= 1} />
                    </>
                  )}
                  {s.key === "consent" && st !== "todo" && (
                    <p className="sim-step-text">
                      {member.optIn ? `✓ ${first} agreed to WhatsApp messages. Duplicate check passed — one message per trigger.` : `✗ ${first} hasn't agreed to WhatsApp messages, so a real send stops here. Pick an opted-in member.`}
                    </p>
                  )}
                  {s.key === "send" && st !== "todo" && (
                    <p className="sim-step-text">
                      {connection.automatic
                        ? `Sent automatically from ${connection.name} ${connection.phone ?? ""} through the WhatsApp Cloud API to +${member.phone}.`
                        : `Queued in the Outbox — the front desk taps “Send on WhatsApp” and it goes to +${member.phone}.`}
                    </p>
                  )}
                  {s.key === "delivered" && st !== "todo" && <p className="sim-step-text">Arrived on {first}&apos;s phone ✓✓</p>}
                  {s.key === "read" && st !== "todo" && <p className="sim-step-text">{first} opened it — blue ticks ✓✓</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ---------- Phone ---------- */}
      <div className="sim-stage">
        <div className={cn("sim-phone", (phase >= 3 || blocked) && "is-awake")}>
          <div className="sim-island" />
          <div className="sim-status">
            <span>{time}</span>
            <span className="sim-status-icons">▂▄▆ ◔</span>
          </div>

          {/* Lock screen with notification */}
          <div className={cn("sim-lock", delivered && "is-hidden")}>
            <p className="sim-lock-time">{time}</p>
            <p className="sim-lock-date">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(Date.now())}</p>
            {sending && (
              <div className="sim-notif">
                <span className="sim-notif-app">
                  <span className="sim-wa-dot">✆</span> WhatsApp · now
                </span>
                <b>{salon}</b>
                <span className="sim-notif-text">{sim.text}</span>
              </div>
            )}
            {blocked && <div className="sim-notif is-blocked">No message — {first} hasn&apos;t opted in.</div>}
          </div>

          {/* Chat */}
          <div className={cn("sim-chat", delivered && "is-open")}>
            <div className="sim-chat-head">
              <span className="sim-chat-back">‹</span>
              <span className="sim-chat-avatar">{salon.slice(0, 1)}</span>
              <div>
                <b>{salon}</b>
                <span>{connection.automatic ? "Business account" : "online"}</span>
              </div>
            </div>
            <div className="sim-chat-body">
              <span className="sim-day">Today</span>
              {delivered && (
                <div className="sim-bubble in">
                  {sim.text}
                  <span className="sim-bubble-time">{time}</span>
                </div>
              )}
              {read && !done && (
                <div className="sim-typing" aria-label={`${first} is typing`}>
                  <i /><i /><i />
                </div>
              )}
              {done && (
                <div className="sim-bubble out">
                  {ruleId === "campaign" || rule?.type === "revisit_reminder" ? "Yes please! Booking a slot now 😍" : "Wow, thank you so much! 🎉 See you soon 😊"}
                  <span className="sim-bubble-time">
                    {time} <CheckCheck className="inline size-3.5" style={{ color: "#53bdeb" }} />
                  </span>
                </div>
              )}
            </div>
            <div className="sim-chat-input">
              <span>Message</span>
            </div>
          </div>
        </div>

        <div className={cn("sim-reaction", delivered && "is-visible")}>
          <Face happy={read} name={first} />
          <p>
            <b>{first}</b>
            <span>{done ? "is delighted — and replied! 🎉" : read ? "loves it! 😊" : delivered ? "is reading your message…" : ""}</span>
          </p>
        </div>
        {done && (
          <p className="sim-done">
            <Sparkles className="size-4" /> Personalised, consented, delivered and read.
          </p>
        )}
      </div>
    </div>
  );
}
