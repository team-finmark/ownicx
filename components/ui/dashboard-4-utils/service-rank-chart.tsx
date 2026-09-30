import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ServiceRank } from "./types";

/** Services ranked by member revenue — the salon's "category rank". */
export function ServiceRankChart({ services }: { services: ServiceRank[] }) {
  const top = services.slice(0, 7);
  const max = top[0]?.revenue || 1;
  const total = services.reduce((a, s) => a + s.revenue, 0) || 1;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg">Top services</CardTitle>
        <CardDescription>Ranked by member revenue, last 90 days</CardDescription>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No visits in the last 90 days.</p>
        ) : (
          <ol className="space-y-5">
            {top.map((s, i) => (
              <li key={s.name} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-baseline gap-3 font-medium">
                    <span className="w-4 tabular-nums text-muted-foreground">{i + 1}</span>
                    {s.name}
                  </span>
                  <span className="tabular-nums">
                    <span className="font-semibold">₹{s.revenue.toLocaleString("en-IN")}</span>
                    <span className="ml-2 text-muted-foreground">
                      {Math.round((s.revenue / total) * 100)}% · {s.visits} visits
                    </span>
                  </span>
                </div>
                <div className="ml-7 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${(s.revenue / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
