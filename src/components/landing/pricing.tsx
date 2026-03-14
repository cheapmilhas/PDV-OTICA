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
    <section ref={sectionRef} id="precos" className="relative py-24 md:py-32 bg-navy-900 scroll-mt-20">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/15 to-transparent" />

      {/* Background accent */}
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-gold/3 to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div data-animate className="opacity-0 text-center mb-14 stagger-1">
          <p className="text-gold text-sm font-medium tracking-[0.2em] uppercase mb-4">
            Precos
          </p>
          <h2
            className="text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Planos que cabem{" "}
            <span className="text-gold-gradient">no seu bolso</span>
          </h2>
          <p className="mt-5 text-lg text-white/35">
            Comece com teste gratis de 14 dias. Sem compromisso.
          </p>

          {/* Toggle */}
          <div data-animate className="opacity-0 mt-10 inline-flex items-center rounded-xl bg-white/[0.03] border border-white/8 p-1 stagger-2" role="radiogroup" aria-label="Periodo de cobranca">
            <button
              onClick={() => setBilling("monthly")}
              role="radio"
              aria-checked={billing === "monthly"}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-[background,color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
                billing === "monthly"
                  ? "bg-gold text-navy-900 shadow-lg shadow-gold/20"
                  : "text-white/40 hover:text-white"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setBilling("yearly")}
              role="radio"
              aria-checked={billing === "yearly"}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-[background,color,box-shadow] duration-300 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 ${
                billing === "yearly"
                  ? "bg-gold text-navy-900 shadow-lg shadow-gold/20"
                  : "text-white/40 hover:text-white"
              }`}
            >
              Anual
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/20">
                Economize
              </span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        {loading ? (
          <div className="flex justify-center py-20" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-gold/50" aria-hidden="true" />
            <span className="sr-only">Carregando planos…</span>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/30">Planos em breve disponiveis.</p>
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
                        ? "border-2 border-gold/40 bg-white/[0.04] shadow-2xl gold-glow scale-[1.02]"
                        : "border border-white/8 bg-white/[0.02] hover:border-gold/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    {plan.isFeatured && (
                      <div className="bg-gradient-to-r from-gold to-gold-light px-4 py-2.5 text-center">
                        <span className="flex items-center justify-center gap-2 text-xs font-bold text-navy-900 uppercase tracking-wider">
                          <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          Mais popular
                        </span>
                      </div>
                    )}

                    <div className="p-7 md:p-8">
                      {/* Name */}
                      <h3 className="text-xl font-display font-bold text-white">{plan.name}</h3>
                      {plan.description && (
                        <p className="text-sm text-white/30 mt-1">{plan.description}</p>
                      )}

                      {/* Price */}
                      <div className="mt-7 mb-8">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-4xl font-display font-bold text-gold-gradient tabular-nums">
                            R$ {(monthlyEquiv / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-white/25 text-sm">/mes</span>
                        </div>
                        {billing === "yearly" && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm text-white/25 tabular-nums">
                              R$ {(price / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/ano
                            </span>
                            {discount > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium border border-emerald-500/20">
                                -{discount}%
                              </span>
                            )}
                          </div>
                        )}
                        {plan.trialDays > 0 && (
                          <p className="text-xs text-gold/60 mt-3">{plan.trialDays} dias gratis para testar</p>
                        )}
                      </div>

                      {/* CTA */}
                      <Link
                        href="/registro"
                        className={`block w-full text-center py-3.5 rounded-xl text-sm font-semibold transition-[background,color,border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 ${
                          plan.isFeatured
                            ? "bg-gradient-to-r from-gold to-gold-light text-navy-900 hover:from-gold-light hover:to-gold shadow-lg shadow-gold/20 hover:shadow-gold/30"
                            : "bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-gold/20"
                        }`}
                      >
                        Comecar teste gratis
                      </Link>

                      {/* Limits */}
                      <div className="mt-8 space-y-3 pb-6 border-b border-white/5">
                        <LimitItem icon={Users} label="Usuarios" value={plan.maxUsers} />
                        <LimitItem icon={Building2} label="Filiais" value={plan.maxBranches} />
                        <LimitItem icon={Package} label="Produtos" value={plan.maxProducts} />
                      </div>

                      {/* Features */}
                      <div className="mt-6 space-y-3">
                        <p className="text-[11px] font-medium text-white/20 uppercase tracking-[0.15em]">Inclui:</p>
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
      <span className="flex items-center gap-2.5 text-white/30">
        <Icon className="h-4 w-4 text-white/20" aria-hidden="true" />
        {label}
      </span>
      <span className="font-semibold text-white tabular-nums">
        {value === -1 ? "Ilimitado" : value}
      </span>
    </div>
  );
}

function FeatureItem({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Check className={`h-4 w-4 flex-shrink-0 ${highlight ? "text-gold" : "text-emerald-500/60"}`} aria-hidden="true" />
      <span className={highlight ? "text-gold-light" : "text-white/40"}>{label}</span>
    </div>
  );
}
