"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Play, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REGISTER_URL, WHATSAPP_URL } from "@/lib/constants";
import { fadeInUp, staggerContainer, scaleIn } from "@/lib/animations";

// Easing for premium feel
const EASE_EXPO = [0.22, 1, 0.36, 1];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20 pb-16">
      {/* ── Atmospheric background — no white, no gradient text ── */}
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />

      {/* Dot grid — understated, not screaming */}
      <div className="absolute inset-0 bg-dots pointer-events-none" />

      {/* Noise texture overlay — organic grain that breaks "AI flatness" */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "200px 200px",
        }}
      />

      {/* Radial glow — off-center, subtle depth */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-5%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "700px",
          height: "500px",
          background:
            "radial-gradient(ellipse, rgba(99,102,241,0.10) 0%, rgba(14,165,233,0.04) 50%, transparent 75%)",
          filter: "blur(1px)",
        }}
      />

      {/* Second accent glow — creates asymmetry */}
      <div
        className="absolute pointer-events-none hidden lg:block"
        style={{
          bottom: "15%",
          right: "8%",
          width: "320px",
          height: "320px",
          background:
            "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)",
          filter: "blur(2px)",
        }}
      />

      <div className="container-custom relative z-10 w-full">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center text-center max-w-4xl mx-auto"
        >
          {/* ── Badge/Pill — with a real spring bounce ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.82, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 22 }}
            className="mb-7"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide"
              style={{
                borderColor: "rgba(99,102,241,0.28)",
                background: "rgba(99,102,241,0.07)",
                color: "#a5b4fc",
                backdropFilter: "blur(8px)",
              }}
            >
              <Sparkles className="h-3 w-3 flex-shrink-0" style={{ color: "#818cf8" }} />
              Novo: Dashboard com BI em tempo real
              <ArrowRight className="h-3 w-3 flex-shrink-0 opacity-70" />
            </span>
          </motion.div>

          {/* ── Headline — NO gradient text ── */}
          {/* Instead: solid white + brand teal keyword with italic weight contrast */}
          <motion.h1
            variants={fadeInUp}
            className="font-heading font-extrabold tracking-tight mb-5"
            style={{
              fontSize: "var(--text-hero)",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "var(--lp-foreground)",
            }}
          >
            Sua ótica no{" "}
            <span
              style={{
                color: "var(--brand-primary)",
                fontStyle: "italic",
                fontWeight: 800,
              }}
            >
              controle.
            </span>
            <br />
            Suas vendas no{" "}
            <span
              style={{
                color: "var(--brand-accent)",
                fontStyle: "italic",
                fontWeight: 800,
              }}
            >
              piloto.
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeInUp}
            style={{
              fontSize: "1.125rem",
              color: "var(--lp-muted)",
              maxWidth: "34rem",
              lineHeight: 1.65,
              marginBottom: "2rem",
            }}
          >
            O sistema completo que simplifica a gestão da sua ótica — do caixa ao
            pós-venda. Fácil de usar, rápido de aprender.
          </motion.p>

          {/* ── CTAs ── */}
          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row gap-3 mb-10 w-full sm:w-auto"
          >
            {/* Primary CTA — gradient + glow, arrow that slides on hover */}
            <motion.div
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Link
                href={REGISTER_URL}
                className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white group"
                style={{
                  background: "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)",
                  boxShadow: "0 4px 24px rgba(99,102,241,0.35), 0 1px 3px rgba(0,0,0,0.2)",
                  minHeight: "52px",
                  fontSize: "0.9375rem",
                }}
              >
                Testar Grátis por 14 dias
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
            </motion.div>

            {/* Secondary CTA */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold transition-colors"
                style={{
                  minHeight: "52px",
                  fontSize: "0.9375rem",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "var(--lp-foreground)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <Play className="h-4 w-4" />
                Falar com consultor
              </a>
            </motion.div>
          </motion.div>

          {/* Social proof */}
          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row items-center gap-3 mb-12"
            style={{ fontSize: "0.8125rem", color: "var(--lp-muted)" }}
          >
            <div className="flex items-center gap-1.5">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <span className="font-semibold" style={{ color: "var(--lp-foreground)" }}>4.9</span>
              <span>no Google</span>
            </div>
            <span className="hidden sm:block opacity-30">·</span>
            <span className="font-semibold" style={{ color: "var(--lp-foreground)" }}>+500 óticas</span>
            <span className="hidden sm:block opacity-30">·</span>
            <span>Sem cartão de crédito</span>
            <span className="hidden sm:block opacity-30">·</span>
            <span>Cancele quando quiser</span>
          </motion.div>

          {/* ── Dashboard Mockup ── */}
          <motion.div variants={scaleIn} className="w-full max-w-5xl">
            <div className="relative">
              {/* Ambient glow behind the frame */}
              <div
                className="absolute -inset-px rounded-3xl pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(14,165,233,0.08) 50%, rgba(16,185,129,0.06) 100%)",
                  filter: "blur(1px)",
                }}
              />

              {/* Browser frame */}
              <div
                className="relative rounded-2xl overflow-hidden"
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "var(--lp-surface)",
                  boxShadow:
                    "0 32px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                {/* Browser chrome */}
                <div
                  className="flex items-center gap-2 px-4 py-3 border-b"
                  style={{
                    background: "var(--lp-surface-hover)",
                    borderColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-400/60" />
                    <div className="h-3 w-3 rounded-full bg-yellow-400/60" />
                    <div className="h-3 w-3 rounded-full bg-green-400/60" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div
                      className="rounded-md px-3 py-1 text-xs text-center"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        color: "var(--lp-subtle)",
                      }}
                    >
                      app.pdvotica.com.br/dashboard
                    </div>
                  </div>
                </div>

                {/* Dashboard preview */}
                <div
                  className="p-4 md:p-6"
                  style={{ minHeight: 320, background: "var(--lp-background)" }}
                >
                  {/* Top stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Vendas hoje", value: "R$ 4.280", color: "text-brand-success", delta: "↑ 12%" },
                      { label: "O.S. abertas", value: "23", color: "text-brand-primary", delta: "5 prontas" },
                      { label: "Estoque baixo", value: "7 itens", color: "text-brand-warning", delta: "Atenção" },
                      { label: "Meta do mês", value: "68%", color: "text-brand-accent", delta: "R$ 32k / 47k" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl p-3 md:p-4"
                        style={{
                          border: "1px solid rgba(255,255,255,0.06)",
                          background: "var(--lp-surface)",
                        }}
                      >
                        <p className="text-xs mb-1" style={{ color: "var(--lp-muted)" }}>
                          {stat.label}
                        </p>
                        <p className={`font-heading font-bold text-lg md:text-xl ${stat.color}`}>
                          {stat.value}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--lp-subtle)" }}>
                          {stat.delta}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Chart */}
                  <div
                    className="rounded-xl p-4 mb-3 hidden md:block"
                    style={{
                      border: "1px solid rgba(255,255,255,0.06)",
                      background: "var(--lp-surface)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--lp-foreground)" }}
                      >
                        Vendas — últimos 7 dias
                      </p>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: "rgba(16,185,129,0.12)",
                          border: "1px solid rgba(16,185,129,0.20)",
                          color: "var(--brand-success)",
                        }}
                      >
                        ↑ 18% vs semana anterior
                      </span>
                    </div>
                    <div className="flex items-end gap-2 h-20">
                      {[40, 65, 45, 80, 60, 90, 75].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t transition-all duration-300"
                          style={{
                            height: `${h}%`,
                            background:
                              i === 5
                                ? "linear-gradient(to top, #6366F1, #818CF8)"
                                : "rgba(99,102,241,0.18)",
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-2">
                      {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                        <p
                          key={d}
                          className="flex-1 text-center text-xs"
                          style={{ color: "var(--lp-subtle)" }}
                        >
                          {d}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* Recent OS */}
                  <div
                    className="rounded-xl p-4 hidden md:block"
                    style={{
                      border: "1px solid rgba(255,255,255,0.06)",
                      background: "var(--lp-surface)",
                    }}
                  >
                    <p
                      className="text-sm font-medium mb-3"
                      style={{ color: "var(--lp-foreground)" }}
                    >
                      Últimas Ordens de Serviço
                    </p>
                    <div className="space-y-2">
                      {[
                        { os: "OS #1247", client: "Maria Santos", status: "Pronto", bg: "rgba(16,185,129,0.10)", color: "var(--brand-success)" },
                        { os: "OS #1246", client: "João Almeida", status: "No lab", bg: "rgba(14,165,233,0.10)", color: "var(--brand-accent)" },
                        { os: "OS #1245", client: "Ana Lima", status: "Em andamento", bg: "rgba(245,158,11,0.10)", color: "var(--brand-warning)" },
                      ].map((item) => (
                        <div
                          key={item.os}
                          className="flex items-center justify-between text-sm"
                        >
                          <span
                            className="font-medium"
                            style={{ color: "var(--lp-muted)" }}
                          >
                            {item.os}
                          </span>
                          <span style={{ color: "var(--lp-foreground)" }}>
                            {item.client}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: item.bg, color: item.color }}
                          >
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Glow reflection below */}
              <div
                className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-16 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse, rgba(99,102,241,0.25) 0%, transparent 70%)",
                  filter: "blur(24px)",
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
