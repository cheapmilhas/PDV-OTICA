// src/components/admin/KPICard.tsx
import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: { direction: "up" | "down"; label: string };
  sparkline?: React.ReactNode;
}

export function KPICard({ icon: Icon, label, value, trend, sparkline }: KPICardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold text-foreground tracking-tight">{value}</p>
        {sparkline && <div className="h-8 w-20">{sparkline}</div>}
      </div>
      {trend && (
        <div className={cn(
          "mt-2 inline-flex items-center gap-1 text-xs font-medium",
          // exceção consciente: emerald/rose para tendência ↑/↓ (semântica fixa, não-tema)
          trend.direction === "up" ? "text-emerald-600" : "text-rose-600"
        )}>
          {trend.direction === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {trend.label}
        </div>
      )}
    </Card>
  );
}
