import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { NewTicketForm } from "./new-ticket-form";
import { PageHeader } from "@/components/admin/PageHeader";

export default async function NovoTicketPage() {
  await requireAdmin();

  const [companies, admins] = await Promise.all([
    prisma.company.findMany({
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
