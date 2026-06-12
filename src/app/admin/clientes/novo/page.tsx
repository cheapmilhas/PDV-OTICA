import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { NewClientForm } from "./new-client-form";
import { PageHeader } from "@/components/admin/PageHeader";
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
    <div className="p-6 text-foreground">
      <div className="mb-6">
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para clientes
        </Link>
      </div>

      <PageHeader
        title="Cadastrar Novo Cliente"
        subtitle="Preencha os dados da ótica para criar a conta"
      />

      <NewClientForm plans={plans} networks={networks} />
    </div>
  );
}
