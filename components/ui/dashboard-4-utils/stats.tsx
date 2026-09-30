import { TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatItem } from "./types";

export function DashboardStats({ stats }: { stats: StatItem[] }) {
  return (
    <>
      {stats.map((s) => (
        <Card key={s.label} className="flex flex-col justify-between">
          <CardHeader className="space-y-3 pb-3">
            <CardDescription className="text-sm font-medium">{s.label}</CardDescription>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-3xl font-semibold tabular-nums">{s.value}</CardTitle>
              {s.trend && (
                <Badge variant="outline" className={cn("gap-1 font-medium", s.tone === "bad" ? "text-red-600" : s.tone === "good" ? "text-green-700" : "")}>
                  {s.trend.dir === "up" ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {s.trend.text}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">{s.note}</CardFooter>
        </Card>
      ))}
    </>
  );
}
