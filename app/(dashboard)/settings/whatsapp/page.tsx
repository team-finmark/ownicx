import { headers } from "next/headers";
import Link from "next/link";
import { CheckCircle2, CircleAlert, ExternalLink, MessageCircle, Trash2, Zap } from "lucide-react";
import { confirmNumber, connectManual, disconnect, recheckConnection, regenerateVerifyToken, removeNumber, saveNumber, sendTest, setMode } from "@/app/whatsapp-actions";
import { FacebookConnect } from "@/components/FacebookConnect";
import { ActionButton, ActionForm, CopyButton, Submit } from "@/components/forms";
import { DemoBanner } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as db from "@/lib/db";
import { formatDate } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { embeddedSignupConfig, getConnection } from "@/lib/whatsapp";

function Step({ n, done, title, description, children }: { n: number; done: boolean; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold", done && "border-primary bg-primary text-primary-foreground")}>
          {done ? <CheckCircle2 className="size-5" /> : n}
        </span>
        <div className="space-y-1.5">
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pl-[4.75rem]">{children}</CardContent>
    </Card>
  );
}

const btn = (variant: "default" | "outline" | "ghost" | "destructive" = "default") => cn(buttonVariants({ variant, size: "lg" }), "h-11 text-[15px]");

export default async function WhatsAppSettings() {
  const wa = await getConnection();
  const fb = embeddedSignupConfig();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const webhookUrl = `${origin}/api/whatsapp/webhook`;
  const automatic = wa.mode === "cloud_api";
  const connected = wa.status === "connected";

  return (
    <>
      <DemoBanner demo={db.isDemo()} />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            <Link href="/settings" className="hover:underline">Settings</Link> / WhatsApp
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Connect WhatsApp</h1>
          <p className="max-w-2xl text-muted-foreground">Set up the salon&apos;s WhatsApp number yourself. No developer needed. Reminders and offers go out from this number.</p>
        </div>
        <Badge variant={connected && automatic ? "default" : wa.status === "error" ? "destructive" : "secondary"} className="h-8 px-3 text-sm">
          {connected && automatic ? "Automatic sending on" : wa.status === "error" ? "Needs attention" : "Tap-to-send (free)"}
        </Badge>
      </div>

      <div className="space-y-4">
        <Step n={1} done={wa.phone_confirmed} title="Your WhatsApp number" description="The number guests see messages from and send JOIN to.">
          <ActionForm action={saveNumber} className="flex flex-wrap items-end gap-3">
            <div className="field min-w-[260px] flex-1">
              <label htmlFor="wa-phone">WhatsApp number (with country code)</label>
              <input id="wa-phone" name="phone" inputMode="tel" className="input" defaultValue={wa.phone ? `+${wa.phone}` : ""} placeholder="+91 98xxx xxxxx" required />
            </div>
            <Submit className={btn()}>Save number</Submit>
          </ActionForm>
          {wa.phone && (
            <div className="flex flex-wrap items-center gap-3">
              <a className={btn("outline")} href={`https://wa.me/${wa.phone}`} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 size-4" /> Open chat to check
              </a>
              {wa.phone_confirmed ? (
                <span className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="size-4" /> {connected ? "Verified by Meta" : "Confirmed by you"}
                </span>
              ) : (
                <ActionButton className={btn()} action={confirmNumber}>Yes, this is our number</ActionButton>
              )}
              <ActionButton
                className={cn(btn("ghost"), "ml-auto text-red-600 hover:bg-red-50 hover:text-red-700")}
                action={removeNumber}
                confirm={[
                  `Remove +${wa.phone}?`,
                  connected ? "Automatic sending will be disconnected and saved Meta tokens deleted." : null,
                  "The join QR code stops working until you add a number again.",
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              >
                <Trash2 className="mr-2 size-4" /> Remove number
              </ActionButton>
            </div>
          )}
        </Step>

        <Step n={2} done={!!wa.phone} title="How messages are sent" description="You can switch any time.">
          <div className="grid gap-3 md:grid-cols-2">
            {([
              { mode: "click_to_chat", icon: MessageCircle, title: "Tap-to-send", price: "Free", text: "Messages wait in the Outbox. Staff tap Send, WhatsApp opens with the text ready." },
              { mode: "cloud_api", icon: Zap, title: "Automatic", price: "Meta charges per message", text: "Messages send by themselves from your number. Needs step 3." },
            ] as const).map((o) => {
              const on = wa.mode === o.mode;
              return (
                <div key={o.mode} className={cn("rounded-lg border p-4", on && "border-primary ring-1 ring-primary")}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold"><o.icon className="size-4" /> {o.title}</span>
                    <Badge variant="outline">{o.price}</Badge>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">{o.text}</p>
                  {on ? (
                    <span className="text-sm font-medium">✓ Selected</span>
                  ) : (
                    <ActionButton className={btn("outline")} action={setMode.bind(null, o.mode)}>Use {o.title.toLowerCase()}</ActionButton>
                  )}
                </div>
              );
            })}
          </div>
        </Step>

        {automatic && (
          <Step n={3} done={connected} title="Connect for automatic sending" description="Sign in with the Facebook account that manages your WhatsApp Business number. We check with Meta that the number is really yours.">
            {connected ? (
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5 text-green-700" /> {wa.verified_name} · {wa.display_phone}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connected {wa.connected_via === "facebook" ? "with Facebook" : "manually"}{wa.connected_at ? ` on ${formatDate(wa.connected_at)}` : ""}.
                </p>
              </div>
            ) : wa.status === "error" && wa.last_error ? (
              <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><CircleAlert className="mt-0.5 size-4 shrink-0" /> {wa.last_error}</p>
            ) : null}

            {fb ? (
              <FacebookConnect appId={fb.appId} configId={fb.configId} connected={connected} />
            ) : (
              <p className="text-sm text-muted-foreground">
                <b className="text-foreground">Continue with Facebook</b> appears here once Osiq Solutions&apos; Meta app is approved. Until then, connect with the details from your own Meta app below.
              </p>
            )}

            <details className="rounded-lg border p-4" open={!fb && !connected}>
              <summary className="cursor-pointer font-medium">Connect manually with Meta details</summary>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Open <a className="underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">Meta for Developers <ExternalLink className="inline size-3" /></a> → your app → WhatsApp → API Setup.</li>
                <li>Copy the <b>Phone Number ID</b>, then create a permanent token (Business settings → System users) with <i>whatsapp_business_messaging</i>.</li>
                <li>Copy the <b>App secret</b> from App settings → Basic.</li>
              </ol>
              <ActionForm action={connectManual} className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="field"><label htmlFor="pnid">Phone Number ID</label><input id="pnid" name="phone_number_id" className="input" inputMode="numeric" required defaultValue={wa.phone_number_id ?? ""} /></div>
                <div className="field"><label htmlFor="waba">WhatsApp Business Account ID <span className="font-normal text-muted-foreground">(optional)</span></label><input id="waba" name="waba_id" className="input" inputMode="numeric" defaultValue={wa.waba_id ?? ""} /></div>
                <div className="field"><label htmlFor="tok">Permanent access token</label><input id="tok" name="access_token" type="password" className="input" autoComplete="off" required placeholder={connected ? "•••••••• (saved, paste to replace)" : ""} /></div>
                <div className="field"><label htmlFor="sec">App secret</label><input id="sec" name="app_secret" type="password" className="input" autoComplete="off" required placeholder={connected ? "•••••••• (saved, paste to replace)" : ""} /></div>
                <div className="md:col-span-2"><Submit className={btn()}>Verify with Meta &amp; connect</Submit></div>
              </ActionForm>
              <p className="mt-3 text-xs text-muted-foreground">Tokens are encrypted before they&apos;re saved and are never shown again.</p>
            </details>

            <div className="rounded-lg border p-4">
              <p className="font-medium">Webhook (for JOIN, POINTS and STOP replies)</p>
              <p className="mb-3 text-sm text-muted-foreground">{wa.connected_via === "facebook" ? "Set up automatically by Facebook sign-in." : "In Meta → WhatsApp → Configuration, paste these two values and subscribe to “messages”."}</p>
              <div className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="w-28 text-muted-foreground">Callback URL</span><code className="mono rounded bg-muted px-2 py-1">{webhookUrl}</code><CopyButton text={webhookUrl} /></div>
                <div className="flex flex-wrap items-center gap-2"><span className="w-28 text-muted-foreground">Verify token</span><code className="mono rounded bg-muted px-2 py-1">{wa.webhook_verify_token}</code><CopyButton text={wa.webhook_verify_token} /><ActionButton className="btn ghost sm" action={regenerateVerifyToken} confirm="Make a new verify token? You'll need to paste it into Meta again.">New token</ActionButton></div>
              </div>
            </div>

            {connected && (
              <div className="flex flex-wrap items-end gap-3">
                <ActionForm action={sendTest} className="flex flex-wrap items-end gap-3">
                  <div className="field min-w-[240px]">
                    <label htmlFor="test-to">Send a test to your own phone</label>
                    <input id="test-to" name="to" inputMode="tel" className="input" placeholder="+91 98xxx xxxxx" required />
                  </div>
                  <Submit className={btn("outline")}>Send test</Submit>
                </ActionForm>
                <ActionForm action={recheckConnection}>
                  <Submit className={btn("outline")}>Check connection</Submit>
                </ActionForm>
                <ActionButton className={btn("destructive")} action={disconnect} confirm="Disconnect automatic sending? Saved Meta tokens are deleted and the Outbox goes back to tap-to-send.">
                  Disconnect
                </ActionButton>
              </div>
            )}
          </Step>
        )}
      </div>
    </>
  );
}
