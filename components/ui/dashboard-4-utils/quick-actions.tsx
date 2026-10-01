"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChevronRight, Megaphone, Scissors, Send, Ticket, UserPlus, Zap } from "lucide-react";
import { runAutomationsNow } from "@/app/actions";
import { safely, Toast } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import type { QuickAction } from "./types";

const ICONS = { scissors: Scissors, "user-plus": UserPlus, send: Send, ticket: Ticket, zap: Zap, megaphone: Megaphone };

function Row({ a }: { a: QuickAction }) {
  const Icon = ICONS[a.icon];
  const body = (
    <>
      <ItemMedia variant="icon" className="size-10 rounded-md">
        <Icon className="size-5" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-base">{a.title}</ItemTitle>
        <ItemDescription>{a.description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        {a.badge && <Badge variant="secondary">{a.badge}</Badge>}
        <ChevronRight className="size-4 text-muted-foreground" />
      </ItemActions>
    </>
  );
  return (
    <Item asChild className="px-3 hover:bg-accent/60">
      <Link href={a.href!}>{body}</Link>
    </Item>
  );
}

function RunRow({ a }: { a: QuickAction }) {
  const [state, action, pending] = useActionState((s: Parameters<typeof runAutomationsNow>[0]) => safely(() => runAutomationsNow(s)), null);
  const Icon = ICONS[a.icon];
  return (
    <form action={action}>
      <Item asChild className="w-full cursor-pointer px-3 text-left hover:bg-accent/60">
        <button type="submit" disabled={pending}>
          <ItemMedia variant="icon" className="size-10 rounded-md bg-primary text-primary-foreground">
            <Icon className="size-5" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-base">{pending ? "Running…" : a.title}</ItemTitle>
            <ItemDescription>{a.description}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {a.badge && <Badge>{a.badge}</Badge>}
            <ChevronRight className="size-4 text-muted-foreground" />
          </ItemActions>
        </button>
      </Item>
      <Toast state={state} />
    </form>
  );
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quick actions</CardTitle>
        <CardDescription>Everyday front-desk jobs</CardDescription>
      </CardHeader>
      <CardContent className="px-3">
        <ItemGroup>
          {actions.map((a, i) => (
            <div key={a.title}>
              {i > 0 && <ItemSeparator />}
              {a.run ? <RunRow a={a} /> : <Row a={a} />}
            </div>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
