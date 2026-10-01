import Link from "next/link";
import { onboardAction } from "@/app/actions";
import { ActionForm, CopyButton, Submit } from "@/components/forms";
import { Badge, Card, DemoBanner, PageHeader, Person, Stat, num, pct } from "@/components/kit";
import * as db from "@/lib/db";
import { DAY, formatDate } from "@/lib/engine";

export default async function Onboarding() {
  const [customers, settings] = await Promise.all([db.list("customers"), db.getSettings()]);
  const now = Date.now();
  const recent = [...customers].sort((a, b) => b.joined_at.localeCompare(a.joined_at)).slice(0, 8);
  const byChannel = (["whatsapp", "app", "walk_in", "pos"] as const).map((ch) => ({ ch, n: customers.filter((c) => c.channel === ch).length }));
  const joined30 = customers.filter((c) => now - new Date(c.joined_at).getTime() <= 30 * DAY).length;
  const optIn = customers.filter((c) => c.whatsapp_opt_in).length;
  const joinLink = `https://wa.me/${settings.whatsapp_number}?text=${encodeURIComponent("JOIN")}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(joinLink)}`;

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <PageHeader
        eyebrow="Program"
        title="Onboarding"
        sub="Guests join from the app, the counter or a WhatsApp message."
      />

      <div className="grid g-4">
        <Stat label="Joined · 30 days" value={joined30} />
        <Stat label="Total members" value={num(customers.length)} />
        <Stat label="WhatsApp opt-in" value={pct((optIn / Math.max(1, customers.length)) * 100, 0)} delta="consent captured at signup" />
        <Stat label="Top channel" value={byChannel.sort((a, b) => b.n - a.n)[0].ch.replace("_", "-")} delta={byChannel.map((b) => `${b.ch.replace("_", "-")} ${b.n}`).join(" · ")} />
      </div>

      <div className="grid g-main mt-16">
        <Card id="add" title="Add a member" sub="Walk-in, POS or app signup.">
          <ActionForm action={onboardAction} resetOnSuccess className="grid g-2" style={{ gap: 14 }}>
            <div className="field"><label htmlFor="ob-n">Full name</label><input id="ob-n" name="name" className="input" required /></div>
            <div className="field"><label htmlFor="ob-p">Mobile (WhatsApp)</label><input id="ob-p" name="phone" className="input" required placeholder="98xxxxxxxx" inputMode="tel" /></div>
            <div className="field"><label htmlFor="ob-e">Email</label><input id="ob-e" name="email" type="email" className="input" /></div>
            <div className="field"><label htmlFor="ob-b">Birthday</label><input id="ob-b" name="birthday" type="date" className="input" /></div>
            <div className="field">
              <label htmlFor="ob-g">Gender</label>
              <select id="ob-g" name="gender" className="select" defaultValue="">
                <option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ob-c">Channel</label>
              <select id="ob-c" name="channel" className="select" defaultValue="walk_in">
                <option value="walk_in">Walk-in</option><option value="app">App</option><option value="whatsapp">WhatsApp</option><option value="pos">POS</option>
              </select>
            </div>
            <div className="field"><label htmlFor="ob-r">Referral code</label><input id="ob-r" name="referral_code" className="input" placeholder="Optional" /></div>
            <div className="field"><label htmlFor="ob-pan">PAN</label><input id="ob-pan" name="pan" className="input" placeholder="Optional" style={{ textTransform: "uppercase" }} /></div>
            <label className="row" style={{ gridColumn: "1 / -1" }}><input type="checkbox" name="whatsapp_opt_in" defaultChecked /> Guest agrees to receive reminders and offers on WhatsApp</label>
            <label className="row" style={{ gridColumn: "1 / -1" }}><input type="checkbox" name="is_business" /> Business member (stylist partner, influencer or corporate)</label>
            <div style={{ gridColumn: "1 / -1" }}><Submit>Onboard member</Submit></div>
          </ActionForm>
        </Card>

        <div className="stack">
          <Card title="Join on WhatsApp" sub="Put this QR at the counter and on mirrors">
            {!settings.whatsapp_number ? (
              <div className="stack" style={{ gap: 10 }}>
                <p className="text-2" style={{ fontSize: 14 }}>No WhatsApp number is connected yet, so there&apos;s no join QR code.</p>
                <Link className="btn primary" href="/settings/whatsapp">Connect WhatsApp</Link>
              </div>
            ) : (
            <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} width={120} height={120} alt="QR code that opens WhatsApp with JOIN" style={{ borderRadius: 12, border: "1px solid var(--border)", padding: 6, background: "#fff" }} />
              <div className="stack" style={{ gap: 8 }}>
                <p className="text-2" style={{ fontSize: 13 }}>Guest scans → sends “JOIN” → the webhook replies asking for their name → member created with opt-in recorded.</p>
                <CopyButton text={joinLink} label="Copy join link" />
              </div>
            </div>
            )}
          </Card>
          <Card title="Recently joined">
            <div className="list">
              {recent.map((c) => (
                <div className="list-item" key={c.id}>
                  <Person name={c.name} sub={formatDate(c.joined_at)} />
                  <Badge>{c.channel.replace("_", "-")}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
