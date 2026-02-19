"use client";

import { useRouter } from "next/navigation";

interface Props {
  admin: { name: string; email: string; role: string };
  metrics: {
    totalCompanies: number;
    activeSubscriptions: number;
    trialSubscriptions: number;
    totalRevenue: number;
  };
  recentCompanies: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    plan: string;
    status: string;
  }[];
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-400 border-green-500/30",
  TRIAL: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  TRIAL_EXPIRED: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  PAST_DUE: "bg-red-500/10 text-red-400 border-red-500/30",
  SUSPENDED: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  CANCELED: "bg-red-500/10 text-red-400 border-red-500/30",
  "—": "bg-gray-500/10 text-gray-500 border-gray-700",
};

export default function AdminDashboard({ admin, metrics, recentCompanies }: Props) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  const metricCards = [
    {
      label: "Total de Empresas",
      value: metrics.totalCompanies,
      icon: "🏢",
      color: "text-blue-400",
    },
    {
      label: "Assinaturas Ativas",
      value: metrics.activeSubscriptions,
      icon: "✅",
      color: "text-green-400",
    },
    {
      label: "Em Trial",
      value: metrics.trialSubscriptions,
      icon: "⏳",
      color: "text-yellow-400",
    },
    {
      label: "Receita Total",
      value: `R$ ${metrics.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      icon: "💰",
      color: "text-emerald-400",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">PDV Ótica Admin</h1>
              <p className="text-xs text-gray-500">Sistema de gerenciamento SaaS</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-white">{admin.name}</p>
              <p className="text-xs text-gray-500">{admin.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-600 hover:text-white"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white">Dashboard</h2>
          <p className="text-sm text-gray-400">Visão geral do sistema PDV Ótica</p>
        </div>

        {/* Metrics */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-3 text-2xl">{card.icon}</div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              <p className="mt-1 text-sm text-gray-500">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Companies */}
        <div className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-6 py-4">
            <h3 className="text-sm font-semibold text-white">Empresas Recentes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Empresa</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Slug</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Plano</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {recentCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-600">
                      Nenhuma empresa cadastrada ainda
                    </td>
                  </tr>
                ) : (
                  recentCompanies.map((company) => (
                    <tr key={company.id} className="border-b border-gray-800/50 transition hover:bg-gray-800/30">
                      <td className="px-6 py-4 text-sm font-medium text-white">{company.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-400">{company.slug || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-300">{company.plan}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[company.status] ?? statusColors["—"]}`}>
                          {company.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(company.createdAt).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
