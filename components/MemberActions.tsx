"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { removeMemberAction, setCouponExpiryAction, updateMemberAction } from "@/app/actions";
import { ActionForm, Submit, showToast } from "./forms";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface EditableMember {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: "female" | "male" | "other" | null;
  birthday: string | null;
  pan: string | null;
  is_business: boolean;
  whatsapp_opt_in: boolean;
}

export interface MemberCoupon {
  id: string;
  code: string;
  label: string;
  status: "active" | "redeemed" | "expired";
  expiresOn: string; // YYYY-MM-DD (India time)
  expiresText: string;
  daysLeft: number;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const plusDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
};

function CouponRow({ c }: { c: MemberCoupon }) {
  const [date, setDate] = useState(c.expiresOn);
  const base = c.status === "active" && c.expiresOn > today() ? c.expiresOn : today();
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold tracking-wide">{c.code}</p>
          <p className="text-sm text-muted-foreground">{c.label}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            c.status === "redeemed" ? "bg-muted text-muted-foreground" : c.status === "expired" ? "bg-red-50 text-red-700" : c.daysLeft <= 3 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700",
          )}
        >
          {c.status === "redeemed" ? "Redeemed" : c.status === "expired" ? `Expired ${c.expiresText}` : `Expires ${c.expiresText} · ${c.daysLeft <= 0 ? "today" : `${c.daysLeft}d left`}`}
        </span>
      </div>
      {c.status !== "redeemed" && (
        <ActionForm action={setCouponExpiryAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="coupon_id" value={c.id} />
          <div className="field">
            <label htmlFor={`exp-${c.id}`} className="text-xs">New expiry date</label>
            <input id={`exp-${c.id}`} name="expires_on" type="date" className="input" value={date} min={today()} onChange={(e) => setDate(e.target.value)} required />
          </div>
          {[7, 30].map((n) => (
            <button key={n} type="button" className="btn sm" onClick={() => setDate(plusDays(base, n))}>
              +{n} days
            </button>
          ))}
          <Submit className="btn sm primary">Save expiry</Submit>
        </ActionForm>
      )}
    </li>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-2xl rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="rounded-md p-2 hover:bg-accent" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function MemberActions({ member, coupons }: { member: EditableMember; coupons: MemberCoupon[] }) {
  const [open, setOpen] = useState<null | "details" | "coupons">(null);
  const [pending, start] = useTransition();
  const live = coupons.filter((c) => c.status === "active").length;

  const remove = () => {
    if (!window.confirm(`Remove ${member.name} permanently?\n\nTheir visits, points, coupons and messages are deleted. This can't be undone.`)) return;
    start(async () => {
      const r = await removeMemberAction(member.id);
      showToast(r);
      if (r?.ok) setOpen(null);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10" aria-label={`Actions for ${member.name}`} disabled={pending}>
            <MoreHorizontal className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{member.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="py-2.5 text-[15px]" onSelect={() => setOpen("details")}>
            <Pencil className="mr-2 size-4" /> Edit details
          </DropdownMenuItem>
          <DropdownMenuItem className="py-2.5 text-[15px]" onSelect={() => setOpen("coupons")}>
            <CalendarClock className="mr-2 size-4" /> Coupons &amp; expiry {live > 0 && <span className="ml-auto text-xs text-muted-foreground">{live} live</span>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="py-2.5 text-[15px] text-red-600 focus:bg-red-50 focus:text-red-700" onSelect={remove}>
            <Trash2 className="mr-2 size-4" /> Remove member
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {open && (
        <Dialog title={member.name} onClose={() => setOpen(null)}>
          <div className="tabs mb-5">
            <a href="#" className={open === "details" ? "on" : ""} onClick={(e) => { e.preventDefault(); setOpen("details"); }}>Details</a>
            <a href="#" className={open === "coupons" ? "on" : ""} onClick={(e) => { e.preventDefault(); setOpen("coupons"); }}>Coupons ({coupons.length})</a>
          </div>

          {open === "details" ? (
            <ActionForm action={updateMemberAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={member.id} />
              <div className="field"><label htmlFor="ed-name">Full name</label><input id="ed-name" name="name" className="input" defaultValue={member.name} required /></div>
              <div className="field"><label htmlFor="ed-phone">Mobile (WhatsApp)</label><input id="ed-phone" name="phone" className="input" inputMode="tel" defaultValue={`+${member.phone}`} required /></div>
              <div className="field"><label htmlFor="ed-email">Email</label><input id="ed-email" name="email" type="email" className="input" defaultValue={member.email ?? ""} /></div>
              <div className="field"><label htmlFor="ed-bday">Birthday</label><input id="ed-bday" name="birthday" type="date" className="input" defaultValue={member.birthday ?? ""} /></div>
              <div className="field">
                <label htmlFor="ed-gender">Gender</label>
                <select id="ed-gender" name="gender" className="select" defaultValue={member.gender ?? ""}>
                  <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
                </select>
              </div>
              <div className="field"><label htmlFor="ed-pan">PAN</label><input id="ed-pan" name="pan" className="input" defaultValue={member.pan ?? ""} style={{ textTransform: "uppercase" }} placeholder="AAAAA9999A" /></div>
              <div className="flex flex-col justify-end gap-2 text-[15px]">
                <label className="flex items-center gap-2"><input type="checkbox" name="whatsapp_opt_in" defaultChecked={member.whatsapp_opt_in} /> Agrees to WhatsApp messages</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="is_business" defaultChecked={member.is_business} /> Business member</label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 sm:col-span-2">
                <button type="button" className="btn ghost text-red-600" onClick={remove} disabled={pending}>
                  <Trash2 className="mr-2 size-4" /> Remove member
                </button>
                <Submit>Save changes</Submit>
              </div>
            </ActionForm>
          ) : coupons.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No coupons yet. Issue one from “Redeem points for a reward”.</p>
          ) : (
            <ul className="space-y-3">
              {coupons.map((c) => <CouponRow key={c.id} c={c} />)}
            </ul>
          )}
        </Dialog>
      )}
    </>
  );
}
