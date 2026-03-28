"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, ArrowRight, Zap, Building2, Rocket } from "lucide-react";
import Link from "next/link";
import { plans } from "@/content/pricing";
import { formatCurrency } from "@/lib/utils";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";
import { REGISTER_URL, WHATSAPP_URL } from "@/lib/constants";

const PLAN_ICONS = {
  essencial: Zap,
  profissional: Rocket,
  rede: Building2,
};

export function PricingSection() {
  const [annual, setAnnual] = useState(false);

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
            Transparentes.{" "}
            <span style={{ color: "var(--lp-muted)", fontWeight: 400 }}>
              Sem surpresas.
            </span>
          </h2>
          <p style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.6 }}>
            Sem letras miúdas. Cancele quando quiser.
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
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {/* Animated active indicator */}
            <motion.div
              className="absolute inset-y-1 rounded-lg"
              animate={{ x: annual ? "100%" : "0%" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{
                width: "calc(50% - 4px)",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.10)",
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
                  background: "rgba(16,185,129,0.15)",
                  border: "1px solid rgba(16,185,129,0.25)",
                  color: "var(--brand-success)",
                }}
              >
                −17%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Pricing cards — asymmetric sizes, highlighted plan is taller */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end"
        >
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.id as keyof typeof PLAN_ICONS] ?? Zap;
            const isHighlighted = plan.highlight;

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
                          "linear-gradient(160deg, rgba(99,102,241,0.08) 0%, rgba(14,165,233,0.04) 100%)",
                        border: "1px solid rgba(99,102,241,0.35)",
                        boxShadow:
                          "0 0 0 1px rgba(99,102,241,0.15), 0 12px 48px rgba(99,102,241,0.18), 0 4px 12px rgba(99,102,241,0.10)",
                        paddingTop: "2.5rem",
                        paddingBottom: "2.5rem",
                      }
                    : {
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }
                }
              >
                {/* "Most popular" badge — breaks out of the top border */}
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold tracking-wide"
                      style={{
                        background: "linear-gradient(135deg, #6366F1, #7C3AED)",
                        color: "white",
                        boxShadow: "0 2px 12px rgba(99,102,241,0.4)",
                      }}
                    >
                      <Rocket className="h-3 w-3" />
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan icon + name */}
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
                    style={{
                      background: isHighlighted
                        ? "rgba(99,102,241,0.15)"
                        : "rgba(255,255,255,0.05)",
                      border: isHighlighted
                        ? "1px solid rgba(99,102,241,0.25)"
                        : "1px solid rgba(255,255,255,0.08)",
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
                    <p style={{ color: "var(--lp-subtle)", fontSize: "0.8125rem", lineHeight: 1.4 }}>
                      {plan.description}
                    </p>
                  </div>
                </div>

                {/* Price — animated swap */}
                <div className="mb-6">
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
                        {formatCurrency(annual ? plan.annualPrice : plan.monthlyPrice)}
                      </span>
                      <span style={{ color: "var(--lp-subtle)", fontSize: "0.875rem" }}>
                        /mês
                      </span>
                    </motion.div>
                  </AnimatePresence>
                  {annual && (
                    <p style={{ color: "var(--lp-subtle)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                      Cobrado anualmente ({formatCurrency(plan.annualPrice * 12)}/ano)
                    </p>
                  )}
                </div>

                {/* CTA */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="mb-7"
                >
                  <Link
                    href={plan.id === "rede" ? WHATSAPP_URL : REGISTER_URL}
                    target="_blank"
                    rel={plan.id === "rede" ? "noopener noreferrer" : undefined}
                    className="inline-flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-bold group transition-all"
                    style={
                      isHighlighted
                        ? {
                            background: "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)",
                            color: "white",
                            boxShadow: "0 4px 20px rgba(99,102,241,0.35)",
                          }
                        : {
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.10)",
                            color: "var(--lp-foreground)",
                          }
                    }
                  >
                    {plan.cta}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </motion.div>

                {/* Divider */}
                <div
                  className="w-full h-px mb-6"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />

                {/* Feature list */}
                <div className="space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2.5 text-sm">
                      <div
                        className="mt-0.5 h-4 w-4 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: isHighlighted
                            ? "rgba(99,102,241,0.15)"
                            : "rgba(16,185,129,0.12)",
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
                  {plan.notIncluded?.map((f) => (
                    <div key={f} className="flex items-start gap-2.5 text-sm opacity-30">
                      <X className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "var(--lp-subtle)" }} />
                      <span style={{ color: "var(--lp-subtle)" }}>{f}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <p
          className="text-center text-sm mt-10"
          style={{ color: "var(--lp-subtle)" }}
        >
          14 dias grátis em todos os planos. Sem cartão de crédito. Cancele quando quiser.
        </p>
      </div>
    </section>
  );
}
