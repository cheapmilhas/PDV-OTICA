import { Check, X } from "lucide-react";

export interface ComparisonRow {
  feature: string;
  planilha: boolean | string;
  vis: boolean | string;
}

export const comparisonRows: ComparisonRow[] = [
  { feature: "Backup automático dos dados", planilha: false, vis: true },
  { feature: "Acesso por cargo (vendedor/caixa/gerente)", planilha: false, vis: true },
  { feature: "Lucro real automático (DRE, fluxo de caixa)", planilha: false, vis: true },
  { feature: "OS de lente rastreada (status, prazo, laboratório)", planilha: false, vis: true },
  { feature: "Alerta de estoque baixo", planilha: false, vis: true },
  { feature: "Multi-loja num só lugar", planilha: false, vis: true },
  { feature: "Funciona no celular", planilha: "Depende do arquivo", vis: true },
  { feature: "Leitura de receita por IA", planilha: false, vis: true },
  { feature: "Suporte humano quando precisa", planilha: false, vis: true },
];

function YesCell() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold" style={{ color: "var(--brand-success)" }}>
      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
      Sim
    </span>
  );
}

function NoCell() {
  return (
    <span className="inline-flex items-center gap-2" style={{ color: "#DC2626" }}>
      <X className="h-4 w-4 shrink-0" aria-hidden="true" />
      Não
    </span>
  );
}

function PlanilhaValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return (
      <span className="inline-flex items-center gap-2" style={{ color: "var(--lp-muted)" }}>
        <X className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: "#DC2626" }} />
        {value}
      </span>
    );
  }
  return value ? <YesCell /> : <NoCell />;
}

function VisValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return (
      <span className="inline-flex items-center gap-2 font-semibold" style={{ color: "var(--lp-foreground)" }}>
        <Check className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: "var(--brand-success)" }} />
        {value}
      </span>
    );
  }
  return value ? <YesCell /> : <NoCell />;
}

export function ComparisonTable({ rows = comparisonRows }: { rows?: ComparisonRow[] }) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Desktop: tabela */}
      <div className="hidden md:block overflow-hidden rounded-2xl" style={{ border: "1px solid var(--lp-border)" }}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr style={{ background: "var(--lp-surface-hover)" }}>
              <th
                scope="col"
                className="px-6 py-4 font-heading font-bold text-sm"
                style={{ color: "var(--lp-foreground)" }}
              >
                Recurso
              </th>
              <th
                scope="col"
                className="px-6 py-4 font-heading font-bold text-sm"
                style={{ color: "var(--lp-muted)" }}
              >
                Planilha / caderno
              </th>
              <th
                scope="col"
                className="px-6 py-4 font-heading font-bold text-sm"
                style={{ color: "var(--brand-primary)", background: "var(--brand-tint)" }}
              >
                Vis
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.feature}
                style={{
                  background: i % 2 === 1 ? "var(--lp-surface-hover)" : "var(--lp-surface)",
                  borderTop: "1px solid var(--lp-border)",
                }}
              >
                <th
                  scope="row"
                  className="px-6 py-4 font-medium text-sm align-top"
                  style={{ color: "var(--lp-foreground)" }}
                >
                  {row.feature}
                </th>
                <td className="px-6 py-4 text-sm align-top">
                  <PlanilhaValue value={row.planilha} />
                </td>
                <td
                  className="px-6 py-4 text-sm align-top"
                  style={{ background: "rgba(230, 238, 255, 0.45)" }}
                >
                  <VisValue value={row.vis} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: lista de mini-cards */}
      <div className="md:hidden space-y-4">
        {rows.map((row) => (
          <div key={row.feature} className="vis-card p-5">
            <p className="font-heading font-bold text-base mb-3" style={{ color: "var(--lp-foreground)" }}>
              {row.feature}
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="shrink-0 font-semibold" style={{ color: "var(--lp-subtle)" }}>
                  Planilha:
                </span>
                <PlanilhaValue value={row.planilha} />
              </div>
              <div className="flex items-start gap-2">
                <span className="shrink-0 font-semibold" style={{ color: "var(--brand-primary)" }}>
                  Vis:
                </span>
                <VisValue value={row.vis} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
