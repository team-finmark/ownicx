import Link from "next/link";
import { ChevronRight, FlaskConical, KeyRound, MessageCircle, Plug, Receipt, Shield, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { saveCertEvidence, toggleCertification } from "@/app/actions";
import { ActionForm, LiveSwitch, Submit } from "@/components/forms";
import { CERTS, certState } from "@/lib/certs";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";
import { getConnection } from "@/lib/whatsapp";

export default async function Settings() {
  const [wa, settings] = await Promise.all([getConnection(), db.getSettings()]);
  const waBadge =
    wa.status === "connected" && wa.mode === "cloud_api"
      ? { text: "Automatic · connected", variant: "default" as const }
      : wa.status === "error"
        ? { text: "Needs attention", variant: "destructive" as const }
        : wa.phone_confirmed
          ? { text: "Tap-to-send · ready", variant: "secondary" as const }
          : { text: "Not set up", variant: "outline" as const };

  const rows = [
    { href: "/settings/whatsapp", icon: MessageCircle, title: "WhatsApp", description: wa.phone ? `+${wa.phone} · connect your number and choose how messages are sent` : "Connect your salon's WhatsApp number", badge: waBadge },
    { href: "/program", icon: SlidersHorizontal, title: "Salon profile & guardrails", description: "Salon name, booking link, margin goal and reward budget" },
    { href: "/account", icon: KeyRound, title: "My account", description: "Change your sign-in password" },
    { href: "/experiments", icon: FlaskConical, title: "P&L and A/B tests", description: "Loyalty cost vs margin goal, and offer experiments" },
    { href: "/compliance", icon: Receipt, title: "194R & TDS", description: "Benefit ledger for business members and the 26Q export" },
    { href: "/integrations", icon: Plug, title: "API & integrations", description: "Connect your POS, CRM or website" },
    { href: "/security", icon: Shield, title: "Security", description: "Controls and certification status" },
  ];

  return (
    <>
      <div className="mb-6 space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Everything a manager can change without touching code.</p>
      </div>
      <Card>
        <CardContent className="p-3">
          <ItemGroup>
            {rows.map((r, i) => (
              <div key={r.href}>
                {i > 0 && <ItemSeparator />}
                <Item asChild className="px-3 hover:bg-accent/60">
                  <Link href={r.href}>
                    <ItemMedia variant="icon" className="size-11 rounded-md">
                      <r.icon className="size-5" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-base">{r.title}</ItemTitle>
                      <ItemDescription>{r.description}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {r.badge && <Badge variant={r.badge.variant}>{r.badge.text}</Badge>}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Link>
                </Item>
              </div>
            ))}
          </ItemGroup>
        </CardContent>
      </Card>

      <Card className="mt-6" id="certifications">
        <CardHeader>
          <CardTitle className="text-lg">Certifications &amp; trust badges</CardTitle>
          <CardDescription className="text-sm">
            Switch on what your business actually holds. Each one shows as a badge on the Security page. Only switch a badge on when you have the certificate or test report, because customers and partners will rely on it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {CERTS.map((c, i) => {
            const st = certState(settings.certifications, c.key);
            return (
              <div key={c.key} className={`flex flex-wrap items-center gap-4 px-6 py-5 ${i > 0 ? "border-t" : ""}`}>
                <LiveSwitch
                  checked={st.on}
                  label={`Show ${c.name} as ${c.onLabel.toLowerCase()}`}
                  onToggle={toggleCertification.bind(null, c.key)}
                  confirmOn={`Show "${c.name} — ${c.onLabel}" on the Security page?

Only continue if your business holds this certificate or report.`}
                />
                <div className="min-w-[200px] flex-1">
                  <p className="font-medium">
                    {c.name} {st.on && <Badge className="ml-2 align-middle">{c.onLabel}</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {c.what}
                    {st.updated_at ? ` · changed ${formatDate(st.updated_at)}` : ""}
                  </p>
                </div>
                <ActionForm action={saveCertEvidence} className="flex w-full items-center gap-2 md:w-auto">
                  <input type="hidden" name="key" value={c.key} />
                  <input
                    name="evidence"
                    className="input md:w-[300px]"
                    defaultValue={st.evidence ?? ""}
                    placeholder="Certificate no. or link to report"
                    aria-label={`${c.name} evidence`}
                  />
                  <Submit className="btn">Save</Submit>
                </ActionForm>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
