import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { NewInvoiceForm } from "./new-invoice-form";

export default async function NovaFaturaPage() {
  await requireAdmin();

  // Buscar empresas com assinatura ativa ou trial
  const companies = await prisma.company.findMany({
    where: {
      subscriptions: {
        some: {
          status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] },
        },
      },
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
    <div className="p-6 text-white max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Nova Cobrança</h1>
      <NewInvoiceForm companies={companies} />
    </div>
  );
}
