import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CreditCard, ExternalLink } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo", TRIAL: "Trial", PAST_DUE: "Inadimplente",
  SUSPENDED: "Suspenso", CANCELED: "Cancelado", TRIAL_EXPIRED: "Trial Expirado",
};
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-900/50 text-green-400 border border-green-800",
  TRIAL: "bg-blue-900/50 text-blue-400 border border-blue-800",
  PAST_DUE: "bg-red-900/50 text-red-400 border border-red-800",
  SUSPENDED: "bg-red-900/50 text-red-400 border border-red-800",
  CANCELED: "bg-gray-800 text-gray-400 border border-gray-700",
  TRIAL_EXPIRED: "bg-orange-900/50 text-orange-400 border border-orange-800",
};

export default async function AssinaturasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const statusFilter = params.status;

  const [subscriptions, statusCounts] = await Promise.all([
    prisma.subscription.findMany({
      where: statusFilter ? { status: statusFilter as any } : {},
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { id: true, name: true, email: true } },
        plan: { select: { name: true, priceMonthly: true } },
      },
      take: 100,
    }),
    prisma.subscription.groupBy({ by: ["status"], _count: true }),
  ]);

  const counts = statusCounts.reduce((acc, item) => ({ ...acc, [item.status]: item._count }), {} as Record<string, number>);
  const total = statusCounts.reduce((acc, item) => acc + item._count, 0);

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Assinaturas</h1>
        <p className="text-sm text-gray-400 mt-0.5">{total} assinatura{total !== 1 ? "s" : ""} no total</p>
      </div>

      {/* Filtros por status */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Link
          href="/admin/assinaturas"
          className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!statusFilter ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
        >
          Todas ({total})
        </Link>
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <Link
            key={status}
            href={`/admin/assinaturas?status=${status}`}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${statusFilter === status ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
          >
            {label} ({counts[status] ?? 0})
          </Link>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Empresa", "Plano", "Status", "Ciclo", "Valor/mês", "Trial expira", "Criada em", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <CreditCard className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-600">Nenhuma assinatura encontrada</p>
                  </td>
                </tr>
              ) : subscriptions.map((sub) => (
                <tr key={sub.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/clientes/${sub.company.id}`} className="font-medium text-white hover:text-indigo-300">{sub.company.name}</Link>
                    {sub.company.email && <p className="text-xs text-gray-500 truncate max-w-[160px]">{sub.company.email}</p>}
                  </td>
                  <td className="px-5 py-3 text-gray-300">{sub.plan.name}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[sub.status] ?? STATUS_STYLES["CANCELED"]}`}>
                      {STATUS_LABELS[sub.status] ?? sub.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{sub.billingCycle === "YEARLY" ? "Anual" : "Mensal"}</td>
                  <td className="px-5 py-3 text-gray-300">
                    R$ {(sub.plan.priceMonthly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{new Date(sub.createdAt).toLocaleDateString("pt-BR")}</td>
                  <td className="px-5 py-3">
                    <Link href={`/admin/clientes/${sub.company.id}`} className="p-1.5 text-gray-500 hover:text-white rounded transition-colors inline-flex">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
