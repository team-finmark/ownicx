"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { MonthPoint } from "./types";

const config = {
  returning: { label: "Returning guests", color: "var(--chart-1)" },
  fresh: { label: "New guests", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function RetentionChart({ months }: { months: MonthPoint[] }) {
  const last = months[months.length - 1];
  const prev = months[months.length - 2];
  const rate = (m?: MonthPoint) => (m && m.returning + m.fresh ? Math.round((m.returning / (m.returning + m.fresh)) * 100) : 0);
  // The current month is partial; report the last complete one.
  const shown = prev ?? last;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg">Returning vs new guests</CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground tabular-nums">{rate(shown)}%</span> of guests were returning members in {shown?.month ?? "—"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
          <LineChart data={months} margin={{ left: 4, right: 12 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line dataKey="returning" type="monotone" stroke="var(--color-returning)" strokeWidth={2} dot={false} />
            <Line dataKey="fresh" type="monotone" stroke="var(--color-fresh)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
