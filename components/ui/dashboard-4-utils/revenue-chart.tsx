"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MonthPoint } from "./types";

const config = { revenue: { label: "Revenue (₹)", color: "var(--chart-1)" } } satisfies ChartConfig;

const compact = (n: number) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${n}`);

export function RevenueChart({ months }: { months: MonthPoint[] }) {
  const [range, setRange] = useState("12");
  const data = months.slice(-Number(range));
  const total = data.reduce((a, m) => a + m.revenue, 0);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg">Member revenue</CardTitle>
          <CardDescription>
            <span className="font-medium text-foreground tabular-nums">₹{total.toLocaleString("en-IN")}</span> from loyalty members
          </CardDescription>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="h-9 w-[150px]" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 months</SelectItem>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={compact} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
