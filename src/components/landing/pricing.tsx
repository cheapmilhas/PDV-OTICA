"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, Star, Users, Building2, Package, Loader2 } from "lucide-react";

interface PlanFeature {
  id: string;
  key: string;
  value: string;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxBranches: number;
  maxProducts: number;
  trialDays: number;
  isFeatured: boolean;
  features: PlanFeature[];
}

const FEATURE_LABELS: Record<string, string> = {
  crm: "CRM Inteligente",
  goals: "Metas & Comissões",
  campaigns: "Campanhas",
  cashback: "Cashback",
  multi_branch: "Multi-filial",
  reports_advanced: "Relatórios Avançados",
  api_access: "Acesso à API",
};

const BASE_FEATURES = [
  "PDV completo",
  "Gestão de estoque",
  "Financeiro integrado",
  "Ordens de serviço",
  "Orçamentos",
  "Relatórios básicos",
];

export function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/plans")
      .then((r) => r.json())
      .then((data) => setPlans(data.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <section id="precos" className="relative py-20 md:py-28 bg-gray-950">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-600/5 via-transparent to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Planos que cabem{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              no seu bolso
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Comece com teste grátis de 14 dias. Sem compromisso.
          </p>

          {/* Toggle */}
          <div className="mt-8 inline-flex items-center rounded-xl bg-gray-900 border border-gray-800 p-1">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                billing === "monthly"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                billing === "yearly"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Anual
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-semibold">
                Economize
              </span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500">Planos em breve disponíveis.</p>
          </div>
        ) : (
          <div className={`grid grid-cols-1 md:grid-cols-2 ${plans.length >= 3 ? "lg:grid-cols-3" : ""} gap-6 max-w-5xl mx-auto`}>
            {plans.map((plan) => {
              const price = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
              const monthlyEquiv = billing === "yearly" ? Math.round(plan.priceYearly / 12) : plan.priceMonthly;
              const discount =
                billing === "yearly" && plan.priceMonthly > 0
                  ? Math.round(100 - (plan.priceYearly / 12 / plan.priceMonthly) * 100)
                  : 0;
              const enabledFeatures = plan.features
                .filter((f) => f.value === "true")
                .map((f) => FEATURE_LABELS[f.key] || f.key);

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border overflow-hidden transition-all ${
                    plan.isFeatured
                      ? "border-indigo-500/50 bg-gray-900 shadow-xl shadow-indigo-500/10 scale-[1.02]"
                      : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                  }`}
                >
                  {plan.isFeatured && (
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-center">
                      <span className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white">
                        <Star className="h-3.5 w-3.5" />
                        Mais popular
                      </span>
                    </div>
                  )}

                  <div className="p-6 md:p-8">
                    {/* Nome */}
                    <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                    {plan.description && (
                      <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                    )}

                    {/* Preço */}
                    <div className="mt-6 mb-8">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-white">
                          R$ {(monthlyEquiv / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-gray-500">/mês</span>
                      </div>
                      {billing === "yearly" && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            R$ {(price / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/ano
                          </span>
                          {discount > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                              -{discount}%
                            </span>
                          )}
                        </div>
                      )}
                      {plan.trialDays > 0 && (
                        <p className="text-xs text-indigo-400 mt-2">{plan.trialDays} dias grátis para testar</p>
                      )}
                    </div>

                    {/* CTA */}
                    <Link
                      href="/contato"
                      className={`block w-full text-center py-3 rounded-xl text-sm font-medium transition-all ${
                        plan.isFeatured
                          ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/25"
                          : "bg-gray-800 text-white hover:bg-gray-700 border border-gray-700"
                      }`}
                    >
                      Começar teste grátis
                    </Link>

                    {/* Limites */}
                    <div className="mt-8 space-y-3 pb-6 border-b border-gray-800">
                      <LimitItem icon={Users} label="Usuários" value={plan.maxUsers} />
                      <LimitItem icon={Building2} label="Filiais" value={plan.maxBranches} />
                      <LimitItem icon={Package} label="Produtos" value={plan.maxProducts} />
                    </div>

                    {/* Features base */}
                    <div className="mt-6 space-y-3">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Inclui:</p>
                      {BASE_FEATURES.map((f) => (
                        <FeatureItem key={f} label={f} />
                      ))}
                      {enabledFeatures.map((f) => (
                        <FeatureItem key={f} label={f} highlight />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function LimitItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-gray-400">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className="font-medium text-white">
        {value === -1 ? "Ilimitado" : value}
      </span>
    </div>
  );
}

function FeatureItem({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Check className={`h-4 w-4 flex-shrink-0 ${highlight ? "text-indigo-400" : "text-green-500"}`} />
      <span className={highlight ? "text-indigo-300" : "text-gray-300"}>{label}</span>
    </div>
  );
}
