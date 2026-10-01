import Link from "next/link";
import { ChevronRight, KeyRound, MessageCircle, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { getConnection } from "@/lib/whatsapp";

export default async function Settings() {
  const wa = await getConnection();
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

    </>
  );
}
