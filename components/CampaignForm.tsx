"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { createCampaign } from "@/app/actions";
import { ActionForm, Submit } from "./forms";
import { cn } from "@/lib/utils";

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

export interface PickableMember {
  id: string;
  name: string;
  phone: string;
  tier: string;
  optIn: boolean;
}

export interface AudienceOption {
  value: string;
  label: string;
  n: number;
}

/** Searchable multi-select dropdown of members. Selected ids are submitted as `member_ids`. */
function MemberPicker({ members, selected, onChange }: { members: PickableMember[]; selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const needle = q.trim().toLowerCase().replace(/^\+/, "");
  const shown = useMemo(
    () => members.filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.phone.includes(needle) || m.tier.toLowerCase().includes(needle)),
    [members, needle],
  );
  const pickable = shown.filter((m) => m.optIn);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const chosen = members.filter((m) => selected.has(m.id));

  return (
    <div className="relative" ref={box}>
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="member_ids" value={id} />
      ))}
      <button
        type="button"
        className="select flex items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={cn("truncate", !selected.size && "text-muted-foreground")}>
          {selected.size ? `${selected.size} member${selected.size > 1 ? "s" : ""} selected` : "Choose members…"}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </button>

      {chosen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chosen.slice(0, 8).map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-[13px]">
              {m.name}
              <button type="button" onClick={() => toggle(m.id)} aria-label={`Remove ${m.name}`} className="rounded-full p-0.5 hover:bg-background">
                <X className="size-3" />
              </button>
            </span>
          ))}
          {chosen.length > 8 && <span className="px-1 py-1 text-[13px] text-muted-foreground">+{chosen.length - 8} more</span>}
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-lg border bg-popover shadow-lg" role="listbox" aria-multiselectable>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone or tier"
              className="h-11 w-full bg-transparent text-[15px] outline-none"
              aria-label="Search members"
            />
          </div>
          <div className="flex items-center justify-between border-b px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">
              {pickable.length} of {shown.length} can be messaged
            </span>
            <span className="flex gap-3">
              <button type="button" className="font-medium hover:underline" onClick={() => onChange(new Set([...selected, ...pickable.map((m) => m.id)]))}>
                Select all shown
              </button>
              <button type="button" className="font-medium hover:underline" onClick={() => onChange(new Set())}>
                Clear
              </button>
            </span>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No members match “{q}”.</li>}
            {shown.map((m) => {
              const on = selected.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    disabled={!m.optIn}
                    onClick={() => toggle(m.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded border", on && "border-primary bg-primary text-primary-foreground")}>
                      {on && <Check className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{m.name}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        +{m.phone} · {m.tier}
                        {!m.optIn && " · no WhatsApp consent"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end border-t p-2">
            <button type="button" className="btn sm primary" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CampaignForm({ audience, members }: { audience: AudienceOption[]; members: PickableMember[] }) {
  const [segment, setSegment] = useState(audience[0]?.value ?? "all");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  return (
    <ActionForm action={createCampaign} resetOnSuccess onSuccess={() => setPicked(new Set())} className="stack" style={{ gap: 12 }}>
      <div className="field"><label htmlFor="cm-n">Name</label><input id="cm-n" name="name" className="input" required placeholder="Diwali glow-up week" /></div>
      <div className="field">
        <label htmlFor="cm-s">Audience</label>
        <select id="cm-s" name="segment" className="select" value={segment} onChange={(e) => setSegment(e.target.value)}>
          <option value="members">Choose members…</option>
          {audience.map((a) => <option key={a.value} value={a.value}>{a.label} ({a.n})</option>)}
        </select>
      </div>
      {segment === "members" && (
        <div className="field">
          <span className="lbl">Members</span>
          <MemberPicker members={members} selected={picked} onChange={setPicked} />
          <span className="hint">Only members who agreed to WhatsApp messages can be picked.</span>
        </div>
      )}
      <div className="field">
        <label htmlFor="cm-o">Offer</label>
        <input id="cm-o" name="offer" className="input" required placeholder="Facial + hair spa at ₹2,499 and 2× points" />
        <span className="hint">Sent as: “Hi Sam ✨ &lt;offer&gt; at your salon, just for you. Book: …”</span>
      </div>
      <div className="grid g-2" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="cm-d">Runs for (days)</label><input id="cm-d" name="days" type="number" min={1} max={90} className="input" defaultValue={7} /></div>
        <div className="field">
          <label htmlFor="cm-cost">Reward cost ₹ <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="cm-cost" name="cost" type="number" min={0} className="input" placeholder="For ROI" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cm-h">Control group</label>
        <select id="cm-h" name="holdout_pct" className="select" defaultValue="0">
          <option value="0">None: message everyone</option>
          <option value="10">Hold back 10% (measure real lift)</option>
          <option value="20">Hold back 20% (more precise lift)</option>
        </select>
        <span className="hint">Held-back members get no message. Comparing their visits shows what the campaign really caused (needs 10+ members).</span>
      </div>
      <TemplateFields idPrefix="cm" vars="first_name, offer, salon, booking_link" />
      <span className="hint">Sent on WhatsApp.</span>
      <Submit disabled={segment === "members" && picked.size === 0}>
        {segment === "members" && picked.size ? `Create draft for ${picked.size} member${picked.size > 1 ? "s" : ""}` : "Create draft"}
      </Submit>
    </ActionForm>
  );
}
