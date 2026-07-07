import { requireAdmin, getAccessibleCompanyIds } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { HealthCategory } from "@prisma/client";
import { HealthBadge } from "@/components/health-badge";
import { RecalcHealthButton } from "../RecalcHealthButton";
import { RecalcOneButton } from "./RecalcOneButton";
import { Activity } from "lucide-react";
import Link from "next/link";
import { FilterBar, FilterChip } from "@/components/admin/FilterBar";
import { EmptyState } from "@/components/admin/EmptyState";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const CATEGORY_ORDER: HealthCategory[] = ["CRITICAL", "AT_RISK", "HEALTHY", "THRIVING"];
const CATEGORY_LABEL: Record<HealthCategory, string> = {
  CRITICAL: "Crítico", AT_RISK: "Em Risco", HEALTHY: "Saudável", THRIVING: "Excelente",
};

export default async function AdminSaudePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const admin = await requireAdmin();
  // Escopo: admin restrito só vê saúde das empresas do seu escopo (null = irrestrito).
  const accessible = await getAccessibleCompanyIds(admin.id);
  const scopeWhere = accessible === null ? {} : { id: { in: accessible } };
  const params = await searchParams;
  const filterCategory =
    params.category && CATEGORY_ORDER.includes(params.category as HealthCategory)
      ? (params.category as HealthCategory)
      : null;

  // Empresas com health calculado, piores primeiro. Lê o cache na Company.
  const companies = await prisma.company.findMany({
    where: {
      ...scopeWhere,
      healthScore: { not: null },
      ...(filterCategory ? { healthCategory: filterCategory } : {}),
    },
    orderBy: [{ healthScore: "asc" }],
    take: 500, // cap de segurança; piores primeiro já priorizam o que importa
    select: {
      id: true,
      name: true,
      healthScore: true,
      healthCategory: true,
      healthUpdatedAt: true,
      healthScores: {
        orderBy: { calculatedAt: "desc" },
        take: 1,
        select: {
          usageScore: true, billingScore: true, engagementScore: true,
          supportScore: true, riskFactors: true,
        },
      },
    },
  });

  // Contagem por categoria (para os filtros).
  const counts = await prisma.company.groupBy({
    by: ["healthCategory"],
    where: { ...scopeWhere, healthScore: { not: null } },
    _count: true,
  });
  const countByCat = (cat: HealthCategory) =>
    counts.find((c) => c.healthCategory === cat)?._count ?? 0;
  const totalScored = counts.reduce((s, c) => s + c._count, 0);

  return (
    <div className="p-6 text-foreground">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Saúde dos Clientes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalScored} cliente{totalScored !== 1 ? "s" : ""} com saúde calculada · piores primeiro
          </p>
        </div>
        <RecalcHealthButton />
      </div>

      {/* Filtros por categoria */}
      <FilterBar>
        <FilterChip href="/admin/saude" active={!filterCategory}>
          Todos <span className="text-muted-foreground/70">({totalScored})</span>
        </FilterChip>
        {CATEGORY_ORDER.map((cat) => (
          <FilterChip
            key={cat}
            href={`/admin/saude?category=${cat}`}
            active={filterCategory === cat}
          >
            {CATEGORY_LABEL[cat]} <span className="text-muted-foreground/70">({countByCat(cat)})</span>
          </FilterChip>
        ))}
      </FilterBar>

      {companies.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Activity}
            message={
              totalScored === 0 ? "Nenhuma saúde calculada ainda" : "Nenhum cliente nesta categoria"
            }
            action={
              <p className="text-sm text-muted-foreground">
                {totalScored === 0
                  ? 'Clique em "Recalcular saúde" para gerar os scores.'
                  : "Tente outro filtro."}
              </p>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ResponsiveTable minWidth={900}>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Saúde</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Engaj.</TableHead>
                <TableHead>Suporte</TableHead>
                <TableHead>Fatores de risco</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => {
                const sub = c.healthScores[0];
                // riskFactors é Json? — narrow de verdade (só strings), não cast cego.
                const rawRisks = sub?.riskFactors;
                const risks = Array.isArray(rawRisks)
                  ? rawRisks.filter((r): r is string => typeof r === "string")
                  : [];
                return (
                  <TableRow key={c.id} className="align-top">
                    <TableCell>
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-foreground hover:text-primary">{c.name}</Link>
                      {c.healthUpdatedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(c.healthUpdatedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.healthScore != null && c.healthCategory && (
                        <HealthBadge score={c.healthScore} category={c.healthCategory} size="sm" />
                      )}
                    </TableCell>
                    <SubCell value={sub?.usageScore} />
                    <SubCell value={sub?.billingScore} />
                    <SubCell value={sub?.engagementScore} />
                    <SubCell value={sub?.supportScore} />
                    <TableCell className="max-w-xs">
                      {risks.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {risks.slice(0, 3).map((r, i) => <li key={i}>• {r}</li>)}
                          {risks.length > 3 && <li className="text-muted-foreground/70">+{risks.length - 3} mais</li>}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell><RecalcOneButton companyId={c.id} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}
    </div>
  );
}

function SubCell({ value }: { value?: number | null }) {
  if (value == null) return <TableCell className="text-muted-foreground text-xs">—</TableCell>;
  // Tom semântico via token (theme-aware): saudável→success, risco→warning, crítico→destructive.
  const color = value >= 70 ? "text-success" : value >= 40 ? "text-warning" : "text-destructive";
  return <TableCell className={`text-xs font-medium ${color}`}>{value}</TableCell>;
}
