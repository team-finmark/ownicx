"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import type { CampaignSummary, ChurnRow, TopMember } from "./types";

const initials = (n: string) => n.split(" ").map((p) => p[0]).slice(0, 2).join("");

function Person({ name }: { name: string }) {
  return (
    <Avatar className="size-10">
      <AvatarFallback className="text-sm font-semibold">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function ChurnList({ rows }: { rows: ChurnRow[] }) {
  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Churn signals</CardTitle>
          <CardDescription>High-value guests 30+ days past their usual cycle</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/automations">Automations</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-3">
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No one is slipping away right now.</p>
        ) : (
          <ItemGroup>
            {rows.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <ItemSeparator />}
                <Item className="px-3">
                  <ItemMedia>
                    <Person name={r.name} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="text-base">{r.name}</ItemTitle>
                    <ItemDescription>
                      Last visit {r.lastVisit} · usual cycle {r.cycle} · {r.spend} spent
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={r.high ? "destructive" : "secondary"}>{r.high ? "High risk" : "Rising"}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${r.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{r.name}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/customers?q=${encodeURIComponent(r.name)}`}>View member</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/customers#record">Record a visit</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/outbox">Open outbox</Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

export function TopMembers({ members }: { members: TopMember[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Top members</CardTitle>
          <CardDescription>By lifetime points</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/leaderboard">All</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3">
            <span className="w-4 text-sm tabular-nums text-muted-foreground">{i + 1}</span>
            <Person name={m.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground tabular-nums">
                <span>{m.points} pts</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: m.tierColor }} />
                  {m.tier}
                </span>
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CampaignReturn({ c }: { c: CampaignSummary }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Campaign return</CardTitle>
          <CardDescription>All engagements to date</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums">{c.roi}</p>
          <p className="text-sm text-muted-foreground">
            {c.revenue} revenue on {c.cost} reward spend
          </p>
        </div>
        <div className="space-y-3 border-t pt-4">
          {c.live.map((l) => (
            <div key={l.name} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="text-sm text-muted-foreground">{l.detail}</p>
              </div>
              <Badge variant={l.status === "live" ? "default" : "secondary"}>{l.status}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
