// src/components/admin/TableSkeleton.tsx
import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  /** Número de linhas de esqueleto (default 6). */
  rows?: number;
  /** Número de colunas (default 4). */
  columns?: number;
  className?: string;
}

/**
 * Placeholder animado para listagens em carregamento (espera > 300ms).
 * Reproduz a estrutura de header + linhas da <Table> para evitar salto de layout
 * quando os dados chegam. Usar como fallback de <Suspense> ou enquanto `loading`.
 */
export function TableSkeleton({ rows = 6, columns = 4, className }: TableSkeletonProps) {
  return (
    <div
      className={cn("rounded-xl border border-border overflow-hidden", className)}
      aria-hidden="true"
    >
      {/* Header */}
      <div className="flex items-center gap-4 bg-muted/30 px-3 h-11 border-b border-border">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-muted-foreground/15 animate-pulse"
            style={{ width: i === 0 ? "28%" : "16%" }}
          />
        ))}
      </div>
      {/* Linhas */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 px-3 py-3.5 border-b border-border last:border-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="h-3.5 rounded bg-muted-foreground/10 animate-pulse"
              style={{ width: c === 0 ? "28%" : "16%" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
