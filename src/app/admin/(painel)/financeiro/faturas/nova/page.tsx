import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { NewInvoiceForm } from "./new-invoice-form";
import { PageHeader } from "@/components/admin/PageHeader";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "../../../dashboard-filters";

export default async function NovaFaturaPage() {
  await requireAdmin();

  // Picker de empresa segue o produto ativo — senão o operador cobra uma empresa
  // do outro produto e o detalhe da fatura gerada cai no guard de produto (404).
  const product = await getProductContext();
  const pf = buildDashboardFilters(product);

  // Buscar empresas com assinatura ativa ou trial
  const companies = await prisma.company.findMany({
    where: {
      AND: [
        pf.company,
        {
          subscriptions: {
            some: {
              status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] },
            },
          },
        },
      ],
    },
    include: {
      subscriptions: {
        where: { status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
        include: { plan: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 text-foreground max-w-2xl">
      <PageHeader title="Nova Cobrança" />
      <NewInvoiceForm companies={companies} />
    </div>
  );
}
