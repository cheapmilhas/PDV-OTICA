"use client";
// src/components/admin/AiCostTrendChart.tsx
// Tendência de custo × lucro de IA (Central de IA — aba "Visão Geral").
// Mesmo padrão visual do MrrChart, mas com DUAS séries (custo real e lucro).
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface AiCostTrendPoint {
  month: string;
  costBrl: number;
  profitBrl: number;
}

interface AiCostTrendChartProps {
  data: AiCostTrendPoint[];
}

const COST = "hsl(var(--muted-foreground))";
const PROFIT = "hsl(var(--primary))";

function formatBRL(value: number | undefined): string {
  const n = typeof value === "number" ? value : 0;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LABELS: Record<string, string> = { costBrl: "Custo real", profitBrl: "Lucro" };

export function AiCostTrendChart({ data }: AiCostTrendChartProps) {
  const rawId = useId();
  const suffix = rawId.replace(/:/g, "");
  const costGradient = `ai-cost-${suffix}`;
  const profitGradient = `ai-profit-${suffix}`;

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={1}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={costGradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COST} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COST} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={profitGradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PROFIT} stopOpacity={0.25} />
            <stop offset="100%" stopColor={PROFIT} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} stroke="hsl(var(--foreground))" strokeOpacity={0.06} />

        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
        />
        <YAxis hide />

        <Tooltip
          cursor={{ stroke: PROFIT, strokeOpacity: 0.2 }}
          formatter={(value, name) => [
            formatBRL(value as number | undefined),
            LABELS[name as string] ?? (name as string),
          ]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
        />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="plainline"
          formatter={(value) => (
            <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
              {LABELS[value as string] ?? value}
            </span>
          )}
        />

        <Area
          type="monotone"
          dataKey="costBrl"
          stroke={COST}
          strokeWidth={2}
          fill={`url(#${costGradient})`}
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="profitBrl"
          stroke={PROFIT}
          strokeWidth={2}
          fill={`url(#${profitGradient})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
