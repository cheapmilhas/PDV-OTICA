import { requireAdmin } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { Building2, Package, Star, Users } from "lucide-react";

export default async function PlanosPage() {
  await requireAdmin();

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      features: true,
      _count: { select: { subscriptions: true } },
    },
  });

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Planos</h1>
        <p className="text-sm text-gray-400 mt-0.5">Planos de assinatura disponíveis</p>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-gray-800 bg-gray-900">
          <Package className="h-8 w-8 text-gray-700 mx-auto mb-2" />
          <p className="text-gray-600">Nenhum plano cadastrado</p>
          <p className="text-xs text-gray-700 mt-1">Execute: npm run db:seed:plans</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div key={plan.id} className={`relative rounded-xl border bg-gray-900 overflow-hidden ${plan.isFeatured ? "border-indigo-600" : "border-gray-800"}`}>
              {plan.isFeatured && (
                <div className="bg-indigo-600 px-4 py-1.5 text-center">
                  <span className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white">
                    <Star className="h-3.5 w-3.5" />
                    Mais popular
                  </span>
                </div>
              )}

              <div className="p-5">
                {/* Nome e status */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                    {plan.description && <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${plan.isActive ? "bg-green-900/50 text-green-400" : "bg-gray-800 text-gray-500"}`}>
                    {plan.isActive ? "Ativo" : "Inativo"}
                  </span>
                </div>

                {/* Preço */}
                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white">
                      R$ {(plan.priceMonthly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-sm text-gray-500">/mês</span>
                  </div>
                  {plan.priceYearly && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      ou R$ {(plan.priceYearly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/ano
                    </p>
                  )}
                </div>

                {/* Limites */}
                <div className="space-y-2 mb-4 p-3 rounded-lg bg-gray-800/50">
                  <LimitRow icon={Users} label="Usuários" value={plan.maxUsers} />
                  <LimitRow icon={Building2} label="Filiais" value={plan.maxBranches} />
                  <LimitRow icon={Package} label="Produtos" value={plan.maxProducts} />
                </div>

                {/* Features */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Funcionalidades</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.features.filter(f => f.value === "true").map((f) => (
                      <span key={f.id} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300">{f.key}</span>
                    ))}
                  </div>
                </div>

                {/* Rodapé */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-800 text-xs">
                  <span className="text-gray-500">
                    {plan._count.subscriptions} assinatura{plan._count.subscriptions !== 1 ? "s" : ""}
                  </span>
                  {plan.trialDays && plan.trialDays > 0 && (
                    <span className="text-indigo-400">{plan.trialDays} dias de trial</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LimitRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-gray-400 text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className="text-xs font-medium text-gray-200">
        {value === -1 ? "Ilimitado" : value.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}
