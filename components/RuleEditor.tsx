"use client";

import { useMemo, useRef, useState } from "react";
import { deleteRule, saveRule, toggleRule } from "@/app/actions";
import { ActionButton, ActionForm, LiveSwitch, Submit } from "./forms";
import type { AutomationRule, BirthdayConfig, ExpiryConfig, MilestoneConfig, RevisitConfig, Service, WinbackConfig } from "@/lib/types";

const META: Record<AutomationRule["type"], { icon: string; label: string; bg: string }> = {
  revisit_reminder: { icon: "✂️", label: "Revisit reminder", bg: "#fff1e4" },
  milestone_offer: { icon: "🎉", label: "Points milestone offer", bg: "#e7f6ee" },
  expiry_nudge: { icon: "⏳", label: "Expiry urgency", bg: "#fdecea" },
  winback: { icon: "💛", label: "Win-back", bg: "#fff5dc" },
  birthday: { icon: "🎂", label: "Birthday", bg: "#efebff" },
};

const VARS = ["first_name", "salon", "service", "days", "points", "offer", "offer_label", "code", "expiry", "days_left", "bonus", "tier", "booking_link"];

function sample(rule: AutomationRule, salon: string, link: string, services: Service[]) {
  const c = rule.config as unknown as Record<string, unknown>;
  const svc = services.find((s) => s.id === c.service_id)?.name ?? "Haircut";
  const exp = new Date(Date.now() + Number(c.validity_days ?? 14) * 86_400_000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return {
    first_name: "Sam",
    salon,
    service: svc,
    days: Number(c.days_after ?? 61),
    points: Number(c.points_threshold ?? 150),
    offer: Number(c.discount_value ?? 150),
    offer_label: `₹${Number(c.discount_value ?? 150)} off any service`,
    code: "OWNK7QX2P",
    expiry: exp,
    days_left: 3,
    bonus: Number(c.bonus_points ?? 20),
    tier: "Gold",
    booking_link: link,
  } as Record<string, string | number>;
}

function TemplateFields({ idPrefix, value, vars }: { idPrefix: string; value?: { name: string; language: string; params: string[] } | null; vars: string }) {
  return (
    <details className="rounded-lg border p-3" open={!!value?.name}>
      <summary className="cursor-pointer text-sm font-medium">Meta template for automatic sending <span className="font-normal text-muted-foreground">(optional)</span></summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Automatic WhatsApp messages outside a guest&apos;s 24-hour reply window must use a template approved in Meta (WhatsApp Manager → Message templates). Tap-to-send ignores this.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="field"><label htmlFor={`${idPrefix}-tn`}>Template name</label><input id={`${idPrefix}-tn`} name="wa_template_name" className="input" defaultValue={value?.name ?? ""} placeholder="haircut_reminder" /></div>
        <div className="field"><label htmlFor={`${idPrefix}-tl`}>Language</label><input id={`${idPrefix}-tl`} name="wa_template_language" className="input" defaultValue={value?.language ?? "en"} placeholder="en" /></div>
        <div className="field"><label htmlFor={`${idPrefix}-tp`}>Fills {"{{1}}, {{2}}…"}</label><input id={`${idPrefix}-tp`} name="wa_template_params" className="input" defaultValue={value?.params.join(", ") ?? ""} placeholder={vars} /></div>
      </div>
    </details>
  );
}

export function RuleEditor({
  rule,
  services,
  audiences,
  salon,
  bookingLink,
  dueCount,
}: {
  rule: AutomationRule;
  services: Service[];
  audiences: { value: string; label: string }[];
  salon: string;
  bookingLink: string;
  dueCount: number;
}) {
  const meta = META[rule.type];
  const [template, setTemplate] = useState(rule.template);
  const [cfg, setCfg] = useState<Record<string, unknown>>(rule.config as unknown as Record<string, unknown>);
  const ta = useRef<HTMLTextAreaElement>(null);
  const vars = useMemo(() => sample({ ...rule, config: cfg as never }, salon, bookingLink, services), [rule, cfg, salon, bookingLink, services]);
  const preview = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{{${k}}}`));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setCfg((c) => ({ ...c, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  const insertVar = (v: string) => {
    const el = ta.current;
    if (!el) return;
    const token = `{{${v}}}`;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = template.slice(0, a) + token + template.slice(b);
    setTemplate(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="rule-card" data-off={!rule.enabled} id={rule.id}>
      <div className="rule-top">
        <div className="rule-icon" style={{ background: meta.bg }}>{meta.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 15 }}>{rule.name}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {meta.label} · sends at {String(rule.send_hour).padStart(2, "0")}:00 · {dueCount > 0 ? <b style={{ color: "var(--hl)" }}>{dueCount} due now</b> : "nobody due now"}
          </div>
        </div>
        <span className="muted" style={{ fontSize: 12.5 }}>{rule.enabled ? "Live" : "Paused"}</span>
        <LiveSwitch checked={rule.enabled} label={`Turn ${rule.name} on or off`} onToggle={(v) => toggleRule(rule.id, v)} />
      </div>

      <ActionForm action={saveRule}>
        <input type="hidden" name="id" value={rule.id} />
        <input type="hidden" name="template" value={template} />
        {rule.enabled && <input type="hidden" name="enabled" value="on" />}
        <div className="rule-body">
          <div className="stack" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor={`${rule.id}-name`}>Rule name</label>
              <input id={`${rule.id}-name`} className="input" name="name" defaultValue={rule.name} />
            </div>

            <div className="sentence">
              {rule.type === "revisit_reminder" && (() => {
                const c = cfg as unknown as RevisitConfig;
                return (
                  <>
                    When a guest&apos;s last
                    <select className="select" name="service_id" value={c.service_id} onChange={set("service_id")} aria-label="Service">
                      <option value="any">visit (any service)</option>
                      {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    was
                    <input className="input" type="number" min={1} name="days_after" value={c.days_after} onChange={set("days_after")} aria-label="Days after" />
                    days ago, send a reminder. If they still haven&apos;t booked, follow up every
                    <input className="input" type="number" min={1} name="cooldown_days" value={c.cooldown_days} onChange={set("cooldown_days")} aria-label="Follow-up days" />
                    days (max 2 follow-ups).
                  </>
                );
              })()}
              {rule.type === "milestone_offer" && (() => {
                const c = cfg as unknown as MilestoneConfig;
                return (
                  <>
                    When a guest reaches
                    <input className="input" type="number" min={1} name="points_threshold" value={c.points_threshold} onChange={set("points_threshold")} aria-label="Points threshold" />
                    points, give them ₹
                    <input className="input" type="number" min={1} name="discount_value" value={c.discount_value} onChange={set("discount_value")} aria-label="Discount" />
                    off any service, valid for
                    <input className="input" type="number" min={1} name="validity_days" value={c.validity_days} onChange={set("validity_days")} aria-label="Validity days" />
                    days.
                    <label className="row" style={{ lineHeight: 1.4, marginTop: 6 }}>
                      <input type="checkbox" name="deduct_points" defaultChecked={c.deduct_points} /> Deduct the points when the offer is issued
                    </label>
                  </>
                );
              })()}
              {rule.type === "expiry_nudge" && (() => {
                const c = cfg as unknown as ExpiryConfig;
                return (
                  <>
                    Remind guests about an unused offer
                    <input
                      className="input"
                      style={{ width: 110 }}
                      name="days_before"
                      defaultValue={c.days_before.join(", ")}
                      aria-label="Days before expiry"
                    />
                    days before it expires. Each countdown step sends once.
                  </>
                );
              })()}
              {rule.type === "winback" && (() => {
                const c = cfg as unknown as WinbackConfig;
                return (
                  <>
                    When a guest hasn&apos;t visited for
                    <input className="input" type="number" min={1} name="inactive_days" value={c.inactive_days} onChange={set("inactive_days")} aria-label="Inactive days" />
                    days, add
                    <input className="input" type="number" min={0} name="bonus_points" value={c.bonus_points} onChange={set("bonus_points")} aria-label="Bonus points" />
                    bonus points and invite them back.
                  </>
                );
              })()}
              {rule.type === "birthday" && (() => {
                const c = cfg as unknown as BirthdayConfig;
                return (
                  <>
                    On a guest&apos;s birthday, give ₹
                    <input className="input" type="number" min={1} name="discount_value" value={c.discount_value} onChange={set("discount_value")} aria-label="Discount" />
                    off, valid for
                    <input className="input" type="number" min={1} name="validity_days" value={c.validity_days} onChange={set("validity_days")} aria-label="Validity days" />
                    days.
                  </>
                );
              })()}
            </div>

            <div className="grid g-2" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor={`${rule.id}-hour`}>Send at</label>
                <select id={`${rule.id}-hour`} className="select" name="send_hour" defaultValue={rule.send_hour}>
                  {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${rule.id}-aud`}>Audience</label>
                <select id={`${rule.id}-aud`} className="select" name="audience" defaultValue={rule.audience}>
                  {audiences.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            </div>
            <div className="row">
              <Submit>Save rule</Submit>
              <ActionButton className="btn ghost sm" confirm={`Delete “${rule.name}”?`} action={() => deleteRule(rule.id)}>Delete</ActionButton>
            </div>
          </div>

          <div className="stack" style={{ gap: 10 }}>
            <div className="field">
              <label htmlFor={`${rule.id}-tpl`}>WhatsApp message</label>
              <textarea id={`${rule.id}-tpl`} ref={ta} className="textarea" value={template} onChange={(e) => setTemplate(e.target.value)} rows={4} />
              <div className="row wrap" style={{ gap: 6 }}>
                {VARS.map((v) => (
                  <button key={v} type="button" className="chip" style={{ height: 24, fontSize: 11.5, padding: "0 8px" }} onClick={() => insertVar(v)}>
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
            <TemplateFields idPrefix={rule.id} value={rule.wa_template} vars={VARS.slice(0, 4).join(", ")} />
            <div className="wa-frame">
              <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>Preview · {salon}</div>
              <div className="bubble">{preview}</div>
            </div>
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
