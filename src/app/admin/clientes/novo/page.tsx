import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { NewClientForm } from "./new-client-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function NewClientPage() {
  await requireAdmin();

  // Buscar planos ativos
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { priceMonthly: "asc" },
  });

  // Buscar redes existentes (para vincular como filial)
  const networks = await prisma.network.findMany({
    include: {
      headquarters: { select: { tradeName: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para clientes
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cadastrar Novo Cliente</h1>
        <p className="text-gray-400 mt-1">Preencha os dados da ótica para criar a conta</p>
      </div>

      <NewClientForm plans={plans} networks={networks} />
    </div>
  );
}
