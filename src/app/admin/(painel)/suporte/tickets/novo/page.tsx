import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { NewTicketForm } from "./new-ticket-form";
import { PageHeader } from "@/components/admin/PageHeader";
import { getProductContext } from "@/lib/admin-product-context";
import { buildDashboardFilters } from "../../../dashboard-filters";

export default async function NovoTicketPage() {
  await requireAdmin();

  // Picker de empresa segue o produto ativo (o ticket criado tem guard de produto
  // no detalhe; sem isto, criar para o outro produto cairia em 404 depois).
  const product = await getProductContext();
  const pf = buildDashboardFilters(product);

  const [companies, admins] = await Promise.all([
    prisma.company.findMany({
      where: pf.company,
      select: { id: true, name: true, tradeName: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.adminUser.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title="Novo Ticket"
        subtitle="Criar ticket de suporte para uma empresa"
      />
      <NewTicketForm companies={companies} admins={admins} />
    </div>
  );
}
