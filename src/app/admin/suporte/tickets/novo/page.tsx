import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { NewTicketForm } from "./new-ticket-form";

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
    <div className="p-6 text-white max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Novo Ticket</h1>
        <p className="text-sm text-gray-400 mt-0.5">Criar ticket de suporte para uma empresa</p>
      </div>
      <NewTicketForm companies={companies} admins={admins} />
    </div>
  );
}
