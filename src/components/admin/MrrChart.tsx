"use client";
// src/components/admin/MrrChart.tsx
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface MrrChartProps {
  data: { month: string; mrr: number }[];
  /** Compact mode: no axes/grid/tooltip — for use as a small sparkline. */
  compact?: boolean;
}

const ACCENT = "hsl(var(--primary))";

function formatBRL(value: number | undefined): string {
  const n = typeof value === "number" ? value : 0;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function MrrChart({ data, compact = false }: MrrChartProps) {
  // useId garante um id de gradiente único por instância (evita colisão de <defs>).
  const rawId = useId();
  const gradientId = `mrr-gradient-${rawId.replace(/:/g, "")}`;

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={1}>
      <AreaChart
        data={data}
        margin={
          compact
            ? { top: 0, right: 0, bottom: 0, left: 0 }
            : { top: 8, right: 8, bottom: 0, left: 0 }
        }
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.25} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {!compact && (
          <CartesianGrid
            vertical={false}
            stroke="hsl(var(--foreground))"
            strokeOpacity={0.06}
          />
        )}

        {!compact && (
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
        )}

        {!compact && <YAxis hide />}

        {!compact && (
          <Tooltip
            cursor={{ stroke: ACCENT, strokeOpacity: 0.2 }}
            formatter={(value) => [formatBRL(value as number | undefined), "MRR"]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          />
        )}

        <Area
          type="monotone"
          dataKey="mrr"
          stroke={ACCENT}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          isAnimationActive={!compact}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
