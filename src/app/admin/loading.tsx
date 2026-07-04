/**
 * Loading skeleton do segmento /admin (A2). Antes não havia loading.tsx em toda a
 * árvore admin — o dashboard faz ~17 queries e a navegação congelava sem feedback.
 * Skeleton genérico (header + KPIs + linhas de tabela) cobre a maioria das telas.
 */
export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-56 rounded bg-muted" />
        <div className="h-4 w-80 rounded bg-muted/70" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-border bg-card" />
        ))}
      </div>

      {/* Linhas de tabela */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
