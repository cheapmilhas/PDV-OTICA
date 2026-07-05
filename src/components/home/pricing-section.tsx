"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, Zap, FileText, Building2, Rocket, Bell } from "lucide-react";
import Link from "next/link";
import {
  formatPlanPrice,
  isComingSoon,
  type PublicPlan,
} from "@/lib/plan-display";
import { ComingSoonInterestModal } from "@/components/plan/coming-soon-interest-modal";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";
import { REGISTER_URL, WHATSAPP_URL } from "@/lib/constants";

const PLAN_ICONS = {
  basico: Zap,
  "basico-nf": FileText,
  profissional: Building2,
  rede: Rocket,
};

export function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [interest, setInterest] = useState<PublicPlan | null>(null);

  useEffect(() => {
    fetch("/api/public/plans")
      .then((r) => r.json())
      .then((d) => setPlans(d.plans ?? []))
      .catch(() => setPlans([]));
  }, []);

  return (
    <section
      className="section-padding relative overflow-hidden"
      style={{ background: "var(--lp-surface)" }}
    >
      {/* Subtle noise texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "200px 200px",
        }}
      />

      <div className="container-custom relative z-10">
        {/* Section header — left-aligned on desktop for asymmetry */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 max-w-xl"
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
          >
            Preços
          </p>
          <h2
            className="font-heading font-extrabold tracking-tight mb-4"
            style={{
              fontSize: "var(--text-h1)",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              color: "var(--lp-foreground)",
            }}
          >
            Preço claro,{" "}
            <span style={{ color: "var(--lp-muted)", fontWeight: 400 }}>
              do tamanho da sua ótica.
            </span>
          </h2>
          <p style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.6 }}>
            Comece grátis. Sem taxa de implantação, sem fidelidade. Cancele quando quiser.
          </p>
        </motion.div>

        {/* Toggle — pill with animated slider */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-10"
        >
          <div
            className="inline-flex items-center rounded-xl p-1 relative"
            style={{
              background: "var(--lp-background)",
              border: "1px solid var(--lp-border)",
            }}
          >
            {/* Animated active indicator */}
            <motion.div
              className="absolute inset-y-1 rounded-lg"
              animate={{ x: annual ? "100%" : "0%" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{
                width: "calc(50% - 4px)",
                background: "var(--lp-surface)",
                border: "1px solid var(--lp-border-hover)",
                boxShadow: "0 1px 3px rgba(10,31,68,0.08)",
              }}
            />
            <button
              onClick={() => setAnnual(false)}
              className="relative z-10 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors"
              style={{ color: !annual ? "var(--lp-foreground)" : "var(--lp-muted)" }}
            >
              Mensal
            </button>
            <button
              onClick={() => setAnnual(true)}
              className="relative z-10 rounded-lg px-5 py-2.5 text-sm font-semibold flex items-center gap-2 transition-colors"
              style={{ color: annual ? "var(--lp-foreground)" : "var(--lp-muted)" }}
            >
              Anual
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(22,163,74,0.12)",
                  border: "1px solid rgba(22,163,74,0.25)",
                  color: "var(--brand-success)",
                }}
              >
                −17%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Loading skeleton — no fake prices */}
        {plans.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl p-7 animate-pulse"
                style={{
                  background: "var(--lp-background)",
                  border: "1px solid var(--lp-border)",
                  minHeight: "26rem",
                }}
              >
                <div
                  className="h-10 w-10 rounded-xl mb-5"
                  style={{ background: "var(--lp-surface)" }}
                />
                <div
                  className="h-4 w-2/3 rounded mb-3"
                  style={{ background: "var(--lp-surface)" }}
                />
                <div
                  className="h-10 w-1/2 rounded mb-6"
                  style={{ background: "var(--lp-surface)" }}
                />
                <div
                  className="h-11 w-full rounded-xl mb-6"
                  style={{ background: "var(--lp-surface)" }}
                />
                <div className="space-y-2.5">
                  {[0, 1, 2, 3].map((j) => (
                    <div
                      key={j}
                      className="h-4 w-full rounded"
                      style={{ background: "var(--lp-surface)" }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
          {/* Planos disponíveis em destaque; "Em breve" ficam num rodapé compacto
              (roadmap) para não competirem como colunas vazias. */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportConfig}
            className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch max-w-3xl mx-auto"
          >
            {plans.filter((p) => !isComingSoon(p)).map((plan) => {
              const Icon = PLAN_ICONS[plan.slug as keyof typeof PLAN_ICONS] ?? Zap;
              const isHighlighted = plan.isFeatured;
              const badge = isHighlighted ? "Mais escolhido" : undefined;
              // priceYearly é o TOTAL anual (centavos). O valor exibido com "/mês" no
              // modo anual é o mensal-equivalente (total anual ÷ 12).
              const monthlyEquivAnnual = plan.priceYearly > 0
                ? Math.round(plan.priceYearly / 12)
                : 0;
              const price = formatPlanPrice(annual ? monthlyEquivAnnual : plan.priceMonthly);
              const yearlyMonthlyEquiv = formatPlanPrice(monthlyEquivAnnual);
              const hasBothPrices = plan.priceMonthly > 0 && plan.priceYearly > 0;
              // Economia anual = 12 mensalidades cheias − total do plano anual.
              const annualSavings = formatPlanPrice(plan.priceMonthly * 12 - plan.priceYearly);
              const features = plan.highlightFeatures ?? [];

              return (
                <motion.div
                  key={plan.id}
                  variants={fadeInUp}
                  whileHover={
                    isHighlighted
                      ? { y: -6, transition: { duration: 0.28, ease: [0.25, 1, 0.5, 1] } }
                      : { y: -4, transition: { duration: 0.28, ease: [0.25, 1, 0.5, 1] } }
                  }
                  className="relative rounded-2xl p-7 flex flex-col transition-all duration-300"
                  style={
                    isHighlighted
                      ? {
                          background:
                            "linear-gradient(160deg, rgba(46,107,255,0.07) 0%, rgba(34,195,230,0.04) 100%)",
                          border: "1px solid rgba(46,107,255,0.35)",
                          boxShadow:
                            "0 0 0 1px rgba(46,107,255,0.12), 0 12px 48px rgba(46,107,255,0.16), 0 4px 12px rgba(10,31,68,0.08)",
                          paddingTop: "2.5rem",
                          paddingBottom: "2.5rem",
                        }
                      : {
                          background: "var(--lp-background)",
                          border: "1px solid var(--lp-border)",
                        }
                  }
                >
                  {/* "Most popular" badge — breaks out of the top border */}
                  {badge && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold tracking-wide"
                        style={{
                          background: "var(--gradient-brand-vivid)",
                          color: "white",
                          boxShadow: "0 2px 12px var(--brand-glow)",
                        }}
                      >
                        <Rocket className="h-3 w-3" />
                        {badge}
                      </span>
                    </div>
                  )}

                  {/* Plan icon + name */}
                  <div className="flex items-center gap-3 mb-5">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
                      style={{
                        background: isHighlighted
                          ? "var(--brand-tint)"
                          : "var(--lp-surface)",
                        border: isHighlighted
                          ? "1px solid rgba(46,107,255,0.25)"
                          : "1px solid var(--lp-border)",
                      }}
                    >
                      <Icon
                        className="h-5 w-5"
                        style={{
                          color: isHighlighted ? "var(--brand-primary)" : "var(--lp-muted)",
                        }}
                      />
                    </div>
                    <div>
                      <h3
                        className="font-heading font-bold"
                        style={{ color: "var(--lp-foreground)", fontSize: "1.0625rem" }}
                      >
                        {plan.name}
                      </h3>
                      {plan.description && (
                        <p style={{ color: "var(--lp-subtle)", fontSize: "0.8125rem", lineHeight: 1.4 }}>
                          {plan.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Price — animated swap; null price → "Em breve" */}
                  <div className="mb-6">
                    {price ? (
                      <>
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={annual ? "annual" : "monthly"}
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.22 }}
                            className="flex items-baseline gap-1.5"
                          >
                            <span
                              className="font-heading font-extrabold"
                              style={{
                                fontSize: "2.75rem",
                                lineHeight: 1,
                                letterSpacing: "-0.04em",
                                color: "var(--lp-foreground)",
                              }}
                            >
                              {price}
                            </span>
                            <span style={{ color: "var(--lp-subtle)", fontSize: "0.875rem" }}>
                              /mês
                            </span>
                          </motion.div>
                        </AnimatePresence>
                        {hasBothPrices && annual && annualSavings && (
                          <p style={{ color: "var(--brand-success)", fontSize: "0.75rem", marginTop: "0.25rem", fontWeight: 600 }}>
                            Economize {annualSavings}/ano
                          </p>
                        )}
                        {hasBothPrices && !annual && yearlyMonthlyEquiv && (
                          <p style={{ color: "var(--lp-subtle)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                            ou {yearlyMonthlyEquiv}/mês no plano anual
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className="font-heading font-extrabold"
                          style={{
                            fontSize: "2rem",
                            lineHeight: 1.1,
                            letterSpacing: "-0.03em",
                            color: "var(--lp-muted)",
                          }}
                        >
                          Em breve
                        </span>
                      </div>
                    )}
                  </div>

                  {/* CTA — planos "Em breve" são filtrados para a faixa "No radar"
                      abaixo, então aqui o plano é sempre disponível. */}
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    className="mb-7"
                  >
                    <Link
                      href={plan.slug === "rede" ? WHATSAPP_URL : REGISTER_URL}
                      rel={plan.slug === "rede" ? "noopener noreferrer" : undefined}
                      target={plan.slug === "rede" ? "_blank" : undefined}
                      className="inline-flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-bold group transition-all"
                      style={
                        isHighlighted
                          ? {
                              background: "var(--gradient-brand-vivid)",
                              color: "white",
                              boxShadow: "0 4px 20px var(--brand-glow)",
                            }
                          : {
                              background: "var(--lp-surface)",
                              border: "1px solid var(--lp-border-hover)",
                              color: "var(--lp-foreground)",
                            }
                      }
                    >
                      {plan.slug === "rede" ? "Falar com Consultor" : "Testar Grátis"}
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </motion.div>

                  {/* Divider */}
                  <div
                    className="w-full h-px mb-6"
                    style={{ background: "var(--lp-border)" }}
                  />

                  {/* Feature list */}
                  <div className="space-y-2.5 flex-1">
                    {features.map((f) => (
                      <div key={f} className="flex items-start gap-2.5 text-sm">
                        <div
                          className="mt-0.5 h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isHighlighted
                              ? "var(--brand-tint)"
                              : "rgba(22,163,74,0.12)",
                          }}
                        >
                          <Check
                            className="h-2.5 w-2.5"
                            style={{
                              color: isHighlighted ? "var(--brand-primary)" : "var(--brand-success)",
                            }}
                          />
                        </div>
                        <span style={{ color: "var(--lp-foreground)", lineHeight: 1.5 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Roadmap — planos "Em breve" em cards compactos, sem competir com os ativos */}
          {plans.some((p) => isComingSoon(p)) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportConfig}
              transition={{ duration: 0.3 }}
              className="mt-10"
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: "var(--lp-subtle)", letterSpacing: "0.15em" }}
              >
                No radar
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.filter((p) => isComingSoon(p)).map((plan) => {
                  const Icon = PLAN_ICONS[plan.slug as keyof typeof PLAN_ICONS] ?? Zap;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setInterest(plan)}
                      className="group flex items-center gap-3 rounded-xl p-4 text-left transition-colors"
                      style={{
                        background: "var(--lp-background)",
                        border: "1px solid var(--lp-border)",
                      }}
                    >
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                        style={{ background: "var(--lp-surface)", border: "1px solid var(--lp-border)" }}
                      >
                        <Icon className="h-4 w-4" style={{ color: "var(--lp-muted)" }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3
                            className="font-heading font-bold truncate"
                            style={{ color: "var(--lp-foreground)", fontSize: "0.9375rem" }}
                          >
                            {plan.name}
                          </h3>
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-bold flex-shrink-0"
                            style={{
                              background: "var(--lp-surface)",
                              border: "1px solid var(--lp-border-hover)",
                              color: "var(--lp-muted)",
                            }}
                          >
                            <Bell className="h-2.5 w-2.5" />
                            Em breve
                          </span>
                        </div>
                        {plan.description && (
                          <p
                            className="truncate"
                            style={{ color: "var(--lp-subtle)", fontSize: "0.75rem" }}
                          >
                            {plan.description}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-xs font-semibold flex-shrink-0 transition-colors group-hover:underline"
                        style={{ color: "var(--brand-primary)" }}
                      >
                        Avise-me
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
          </>
        )}

        <p
          className="text-center text-sm mt-10"
          style={{ color: "var(--lp-subtle)" }}
        >
          Comece grátis. Sem cartão de crédito, sem taxa de implantação e sem fidelidade.
        </p>
      </div>

      <ComingSoonInterestModal
        open={!!interest}
        planSlug={interest?.slug ?? ""}
        planName={interest?.name ?? ""}
        onClose={() => setInterest(null)}
      />
    </section>
  );
}
