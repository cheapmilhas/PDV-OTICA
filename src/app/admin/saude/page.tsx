import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { HealthCategory } from "@prisma/client";
import { HealthBadge } from "@/components/health-badge";
import { RecalcHealthButton } from "../RecalcHealthButton";
import { RecalcOneButton } from "./RecalcOneButton";
import { Activity } from "lucide-react";
import Link from "next/link";

const CATEGORY_ORDER: HealthCategory[] = ["CRITICAL", "AT_RISK", "HEALTHY", "THRIVING"];
const CATEGORY_LABEL: Record<HealthCategory, string> = {
  CRITICAL: "Crítico", AT_RISK: "Em Risco", HEALTHY: "Saudável", THRIVING: "Excelente",
};

export default async function AdminSaudePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filterCategory =
    params.category && CATEGORY_ORDER.includes(params.category as HealthCategory)
      ? (params.category as HealthCategory)
      : null;

  // Empresas com health calculado, piores primeiro. Lê o cache na Company.
  const companies = await prisma.company.findMany({
    where: {
      healthScore: { not: null },
      ...(filterCategory ? { healthCategory: filterCategory } : {}),
    },
    orderBy: [{ healthScore: "asc" }],
    take: 500, // cap de segurança; piores primeiro já priorizam o que importa
    select: {
      id: true,
      name: true,
      healthScore: true,
      healthCategory: true,
      healthUpdatedAt: true,
      healthScores: {
        orderBy: { calculatedAt: "desc" },
        take: 1,
        select: {
          usageScore: true, billingScore: true, engagementScore: true,
          supportScore: true, riskFactors: true,
        },
      },
    },
  });

  // Contagem por categoria (para os filtros).
  const counts = await prisma.company.groupBy({
    by: ["healthCategory"],
    where: { healthScore: { not: null } },
    _count: true,
  });
  const countByCat = (cat: HealthCategory) =>
    counts.find((c) => c.healthCategory === cat)?._count ?? 0;
  const totalScored = counts.reduce((s, c) => s + c._count, 0);

  return (
    <div className="p-6 text-white">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-indigo-400" /> Saúde dos Clientes
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalScored} cliente{totalScored !== 1 ? "s" : ""} com saúde calculada · piores primeiro
          </p>
        </div>
        <RecalcHealthButton />
      </div>

      {/* Filtros por categoria */}
      <div className="flex flex-wrap gap-2 mb-5">
        <FilterChip href="/admin/saude" label="Todos" count={totalScored} active={!filterCategory} />
        {CATEGORY_ORDER.map((cat) => (
          <FilterChip
            key={cat}
            href={`/admin/saude?category=${cat}`}
            label={CATEGORY_LABEL[cat]}
            count={countByCat(cat)}
            active={filterCategory === cat}
          />
        ))}
      </div>

      {companies.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center text-gray-500">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-gray-400">
            {totalScored === 0 ? "Nenhuma saúde calculada ainda" : "Nenhum cliente nesta categoria"}
          </p>
          <p className="text-sm mt-1">
            {totalScored === 0
              ? 'Clique em "Recalcular saúde" para gerar os scores.'
              : "Tente outro filtro."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["Empresa", "Saúde", "Uso", "Billing", "Engaj.", "Suporte", "Fatores de risco", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const sub = c.healthScores[0];
                // riskFactors é Json? — narrow de verdade (só strings), não cast cego.
                const rawRisks = sub?.riskFactors;
                const risks = Array.isArray(rawRisks)
                  ? rawRisks.filter((r): r is string => typeof r === "string")
                  : [];
                return (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors align-top">
                    <td className="px-4 py-3">
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-white hover:text-indigo-300">{c.name}</Link>
                      {c.healthUpdatedAt && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {new Date(c.healthUpdatedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.healthScore != null && c.healthCategory && (
                        <HealthBadge score={c.healthScore} category={c.healthCategory} size="sm" />
                      )}
                    </td>
                    <SubCell value={sub?.usageScore} />
                    <SubCell value={sub?.billingScore} />
                    <SubCell value={sub?.engagementScore} />
                    <SubCell value={sub?.supportScore} />
                    <td className="px-4 py-3 max-w-xs">
                      {risks.length === 0 ? (
                        <span className="text-gray-600 text-xs">—</span>
                      ) : (
                        <ul className="text-xs text-gray-400 space-y-0.5">
                          {risks.slice(0, 3).map((r, i) => <li key={i}>• {r}</li>)}
                          {risks.length > 3 && <li className="text-gray-600">+{risks.length - 3} mais</li>}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3"><RecalcOneButton companyId={c.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SubCell({ value }: { value?: number | null }) {
  if (value == null) return <td className="px-4 py-3 text-gray-600 text-xs">—</td>;
  const color = value >= 70 ? "text-green-400" : value >= 40 ? "text-yellow-400" : "text-red-400";
  return <td className={`px-4 py-3 text-xs font-medium ${color}`}>{value}</td>;
}

function FilterChip({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        active
          ? "border-indigo-700 bg-indigo-900/30 text-indigo-300"
          : "border-gray-800 bg-gray-900 text-gray-400 hover:bg-gray-800/50"
      }`}
    >
      {label} <span className="text-gray-600">({count})</span>
    </Link>
  );
}
