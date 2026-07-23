import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { Building2, CreditCard, Clock, DollarSign, Layers } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { KPICard } from "@/components/admin/KPICard";
import { Card } from "@/components/ui/card";
import { buildDashboardFilters } from "../dashboard-filters";
import type { PlatformProduct } from "@/lib/admin-product-context";
import type { SubscriptionForMRR } from "@/lib/admin-metrics";
import { buildProductSnapshot, consolidateTotals, type ProductSnapshot } from "./group-metrics";

const PRODUCT_LABEL: Record<PlatformProduct, string> = {
  VIS_APP: "Vis App (Ótica)",
  VIS_MEDICAL: "Vis Medical (Clínica)",
};

const PRODUCTS: PlatformProduct[] = ["VIS_APP", "VIS_MEDICAL"];

function fmtBRL(centavos: number): string {
  return `R$ ${(centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

/**
 * Dashboard "Grupo" — visão consolidada dos DOIS produtos lado a lado.
 *
 * ⚠️ Esta rota IGNORA o toggle de produto de propósito: NÃO chama getProductContext.
 * O cookie admin.product chegaria aqui (path "/"), mas o Grupo é cross-produto —
 * consulta VIS_APP e VIS_MEDICAL separadamente e soma. É "a tela que o dono olha
 * de manhã" (plano-mãe §5.5).
 */
export default async function GrupoPage() {
  await requireAdmin();

  const now = new Date();

  // Um snapshot por produto. Cada consulta usa buildDashboardFilters(produto) —
  // mesma lente das telas, só que fixada por produto em vez de vir do cookie.
  const snapshots: ProductSnapshot[] = await Promise.all(
    PRODUCTS.map(async (product) => {
      const pf = buildDashboardFilters(product);
      const [companies, activeSubs, trialSubs, activeSubRows] = await Promise.all([
        prisma.company.count({ where: pf.company }),
        prisma.subscription.count({ where: { AND: [pf.subscriptionCompany, { status: "ACTIVE" }] } }),
        prisma.subscription.count({ where: { AND: [pf.subscriptionCompany, { status: "TRIAL" }] } }),
        prisma.subscription.findMany({
          where: { AND: [pf.subscriptionCompany, { status: "ACTIVE" }] },
          include: { plan: { select: { priceMonthly: true, priceYearly: true } } },
        }),
      ]);
      const activeSubsForMrr: SubscriptionForMRR[] = activeSubRows.map((s) => ({
        priceMonthly: s.plan.priceMonthly,
        priceYearly: s.plan.priceYearly,
        billingCycle: s.billingCycle,
        discountPercent: s.discountPercent,
        discountExpiresAt: s.discountExpiresAt,
      }));
      return buildProductSnapshot({ product, companies, activeSubs, trialSubs, activeSubsForMrr, now });
    }),
  );

  const totals = consolidateTotals(snapshots);
  const byProduct = (p: PlatformProduct) => snapshots.find((s) => s.product === p)!;

  return (
    <div className="p-6">
      <PageHeader
        title="Grupo"
        subtitle="Visão consolidada dos produtos — não afetada pelo seletor de produto"
      />

      {/* Totais consolidados */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard label="MRR do Grupo" value={fmtBRL(totals.mrrCentavos)} icon={DollarSign} />
        <KPICard label="Empresas" value={String(totals.companies)} icon={Building2} />
        <KPICard label="Assinaturas Ativas" value={String(totals.activeSubs)} icon={CreditCard} />
        <KPICard label="Em Trial" value={String(totals.trialSubs)} icon={Clock} />
      </div>

      {/* Comparativo por produto */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PRODUCTS.map((product) => {
          const s = byProduct(product);
          const mrrShare = totals.mrrCentavos > 0 ? Math.round((s.mrrCentavos / totals.mrrCentavos) * 100) : 0;
          return (
            <Card key={product} className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">{PRODUCT_LABEL[product]}</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="MRR" value={fmtBRL(s.mrrCentavos)} hint={`${mrrShare}% do grupo`} />
                <Metric label="Empresas" value={String(s.companies)} />
                <Metric label="Ativas" value={String(s.activeSubs)} />
                <Metric label="Em trial" value={String(s.trialSubs)} />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
