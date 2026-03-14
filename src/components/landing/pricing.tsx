"use client";

import { useState, useEffect, useRef } from "react";
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
  goals: "Metas & Comissoes",
  campaigns: "Campanhas",
  cashback: "Cashback",
  multi_branch: "Multi-filial",
  reports_advanced: "Relatorios Avancados",
  api_access: "Acesso a API",
};

const BASE_FEATURES = [
  "PDV completo",
  "Gestao de estoque",
  "Financeiro integrado",
  "Ordens de servico",
  "Orcamentos",
  "Relatorios basicos",
];

export function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/api/public/plans")
      .then((r) => r.json())
      .then((data) => setPlans(data.plans || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (prefersReduced) {
              entry.target.classList.remove("opacity-0");
            } else {
              entry.target.classList.add("animate-fade-up");
              entry.target.classList.remove("opacity-0");
            }
          }
        });
      },
      { threshold: 0.05 }
    );

    section.querySelectorAll("[data-animate]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  return (
    <section ref={sectionRef} id="precos" className="relative py-24 md:py-32 bg-sand-50 scroll-mt-20">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div data-animate className="opacity-0 text-center mb-14 stagger-1">
          <p className="text-teal-600 text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Precos
          </p>
          <h2
            className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-gray-900"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Planos que cabem{" "}
            <span className="text-teal-gradient">no seu bolso</span>
          </h2>
          <p className="mt-5 text-lg text-gray-500">
            Comece com teste gratis de 14 dias. Sem compromisso.
          </p>

          {/* Toggle */}
          <div data-animate className="opacity-0 mt-10 inline-flex items-center rounded-xl bg-white border border-gray-200 p-1 shadow-sm stagger-2" role="radiogroup" aria-label="Periodo de cobranca">
            <button
              onClick={() => setBilling("monthly")}
              role="radio"
              aria-checked={billing === "monthly"}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-[background,color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 ${
                billing === "monthly"
                  ? "bg-teal-600 text-white shadow-md shadow-teal-600/20"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling("yearly")}
              role="radio"
              aria-checked={billing === "yearly"}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-[background,color,box-shadow] duration-300 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 ${
                billing === "yearly"
                  ? "bg-teal-600 text-white shadow-md shadow-teal-600/20"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Anual
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                Economize
              </span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        {loading ? (
          <div className="flex justify-center py-20" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500" aria-hidden="true" />
            <span className="sr-only">Carregando planos…</span>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400">Planos em breve disponiveis.</p>
          </div>
        ) : (
          <div className={`grid grid-cols-1 md:grid-cols-2 ${plans.length >= 3 ? "lg:grid-cols-3" : ""} gap-6 max-w-5xl mx-auto`}>
            {plans.map((plan, index) => {
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
                  data-animate
                  className={`opacity-0 stagger-${Math.min(index + 3, 8)}`}
                >
                  <div
                    className={`relative rounded-2xl overflow-hidden transition-[background,border-color,transform,box-shadow] duration-500 h-full ${
                      plan.isFeatured
                        ? "border-2 border-teal-400 bg-white shadow-xl shadow-teal-100/50 scale-[1.02]"
                        : "border border-gray-200 bg-white hover:border-teal-200 hover:shadow-lg hover:shadow-teal-50"
                    }`}
                  >
                    {plan.isFeatured && (
                      <div className="bg-teal-600 px-4 py-2.5 text-center">
                        <span className="flex items-center justify-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                          <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          Mais popular
                        </span>
                      </div>
                    )}

                    <div className="p-7 md:p-8">
                      <h3 className="text-xl font-display font-bold text-gray-900">{plan.name}</h3>
                      {plan.description && (
                        <p className="text-sm text-gray-400 mt-1">{plan.description}</p>
                      )}

                      <div className="mt-7 mb-8">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-4xl font-display font-bold text-teal-gradient tabular-nums">
                            R$ {(monthlyEquiv / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-gray-400 text-sm">/mes</span>
                        </div>
                        {billing === "yearly" && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm text-gray-400 tabular-nums">
                              R$ {(price / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/ano
                            </span>
                            {discount > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                -{discount}%
                              </span>
                            )}
                          </div>
                        )}
                        {plan.trialDays > 0 && (
                          <p className="text-xs text-teal-600 mt-3">{plan.trialDays} dias gratis para testar</p>
                        )}
                      </div>

                      <Link
                        href="/registro"
                        className={`block w-full text-center py-3.5 rounded-xl text-sm font-semibold transition-[background,color,border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 ${
                          plan.isFeatured
                            ? "bg-teal-600 text-white hover:bg-teal-700 shadow-md shadow-teal-600/20"
                            : "bg-gray-50 text-gray-700 hover:bg-teal-50 border border-gray-200 hover:border-teal-200 hover:text-teal-700"
                        }`}
                      >
                        Comecar teste gratis
                      </Link>

                      <div className="mt-8 space-y-3 pb-6 border-b border-gray-100">
                        <LimitItem icon={Users} label="Usuarios" value={plan.maxUsers} />
                        <LimitItem icon={Building2} label="Filiais" value={plan.maxBranches} />
                        <LimitItem icon={Package} label="Produtos" value={plan.maxProducts} />
                      </div>

                      <div className="mt-6 space-y-3">
                        <p className="text-[11px] font-medium text-gray-300 uppercase tracking-[0.15em]">Inclui:</p>
                        {BASE_FEATURES.map((f) => (
                          <FeatureItem key={f} label={f} />
                        ))}
                        {enabledFeatures.map((f) => (
                          <FeatureItem key={f} label={f} highlight />
                        ))}
                      </div>
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
      <span className="flex items-center gap-2.5 text-gray-500">
        <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
        {label}
      </span>
      <span className="font-semibold text-gray-900 tabular-nums">
        {value === -1 ? "Ilimitado" : value}
      </span>
    </div>
  );
}

function FeatureItem({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Check className={`h-4 w-4 flex-shrink-0 ${highlight ? "text-teal-600" : "text-emerald-500"}`} aria-hidden="true" />
      <span className={highlight ? "text-teal-700 font-medium" : "text-gray-600"}>{label}</span>
    </div>
  );
}
