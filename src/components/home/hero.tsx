"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, MessageCircle, Check, Sparkles } from "lucide-react";
import { REGISTER_URL, WHATSAPP_URL } from "@/lib/constants";
import { fadeInUp, staggerContainer, scaleIn } from "@/lib/animations";
import { BrowserFrame } from "@/components/landing-layout/browser-frame";

const HERO_BULLETS = [
  "Cada OS de lente, do pedido ao laboratório à entrega",
  "Saiba quanto entrou, saiu e sobrou — sem planilha",
  "Cada cargo no seu papel: vendedor, caixa e gerente",
  "Funciona no computador, tablet ou celular",
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20 pb-16">
      {/* ── Wash claro Vis ── */}
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="absolute inset-0 bg-dots pointer-events-none" />

      {/* Glow azul/ciano sutil no topo */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-8%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "760px",
          height: "520px",
          background:
            "radial-gradient(ellipse, rgba(46,107,255,0.12) 0%, rgba(34,195,230,0.06) 50%, transparent 75%)",
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
          {/* ── Eyebrow ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.82, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 280, damping: 22 }}
            className="mb-7"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide"
              style={{
                borderColor: "var(--lp-border)",
                background: "var(--brand-tint)",
                color: "var(--brand-primary)",
              }}
            >
              <Sparkles className="h-3 w-3 flex-shrink-0" />
              O sistema simples para óticas modernas
            </span>
          </motion.div>

          {/* ── Headline ── */}
          <motion.h1
            variants={fadeInUp}
            className="font-heading font-extrabold tracking-tight mb-5"
            style={{
              fontSize: "var(--text-hero)",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "var(--lp-foreground)",
            }}
          >
            A gestão{" "}
            <span
              style={{
                background: "var(--gradient-brand-vivid)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              clara
            </span>{" "}
            da sua ótica.
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            variants={fadeInUp}
            style={{
              fontSize: "1.125rem",
              color: "var(--lp-muted)",
              maxWidth: "38rem",
              lineHeight: 1.65,
              marginBottom: "2rem",
            }}
          >
            Vendas, ordens de serviço de lentes, estoque e financeiro num só
            lugar. O Vis tira sua ótica das planilhas e do papel — e coloca tudo
            sob controle, do balcão ao laboratório.
          </motion.p>

          {/* ── CTAs duplos ── */}
          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row gap-3 mb-5 w-full sm:w-auto"
          >
            <motion.div
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Link
                href={REGISTER_URL}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white group w-full"
                style={{
                  background: "var(--gradient-brand-vivid)",
                  boxShadow: "0 6px 24px var(--brand-glow), 0 1px 3px rgba(10,31,68,0.1)",
                  minHeight: "52px",
                  fontSize: "0.9375rem",
                }}
              >
                Começar grátis
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold transition-colors w-full"
                style={{
                  minHeight: "52px",
                  fontSize: "0.9375rem",
                  background: "var(--lp-surface)",
                  border: "1px solid var(--lp-border-hover)",
                  color: "var(--lp-foreground)",
                }}
              >
                <MessageCircle className="h-4 w-4" style={{ color: "var(--brand-primary)" }} />
                Falar com consultor
              </a>
            </motion.div>
          </motion.div>

          {/* Microcopy */}
          <motion.p
            variants={fadeInUp}
            className="mb-9"
            style={{ fontSize: "0.8125rem", color: "var(--lp-subtle)" }}
          >
            Sem cartão de crédito. Configuração em minutos. Cancele quando quiser.
          </motion.p>

          {/* Bullets de prova */}
          <motion.ul
            variants={fadeInUp}
            className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 mb-12 text-left max-w-2xl"
          >
            {HERO_BULLETS.map((b) => (
              <li
                key={b}
                className="flex items-start gap-2.5 text-sm"
                style={{ color: "var(--lp-muted)" }}
              >
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full mt-0.5"
                  style={{ background: "var(--brand-tint)" }}
                >
                  <Check className="h-3 w-3" style={{ color: "var(--brand-primary)" }} />
                </span>
                {b}
              </li>
            ))}
          </motion.ul>

          {/* ── Dashboard Mockup (claro Vis) ── */}
          <motion.div variants={scaleIn} className="w-full max-w-5xl">
            <div className="relative">
              {/* Ambient glow */}
              <div
                className="absolute -inset-px rounded-3xl pointer-events-none"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(46,107,255,0.18) 0%, rgba(34,195,230,0.10) 100%)",
                  filter: "blur(2px)",
                }}
              />

              {/* Browser frame */}
              <BrowserFrame url="vis.app.br/dashboard">
                {/* Dashboard preview */}
                <div
                  className="p-4 md:p-6"
                  style={{ minHeight: 320, background: "var(--lp-background)" }}
                >
                  {/* Top stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Vendas hoje", value: "R$ 4.280", color: "var(--brand-success)", delta: "↑ 12%" },
                      { label: "OS abertas", value: "23", color: "var(--brand-primary)", delta: "5 prontas" },
                      { label: "Estoque baixo", value: "7 itens", color: "var(--brand-warning)", delta: "Atenção" },
                      { label: "Meta do mês", value: "68%", color: "var(--brand-accent)", delta: "R$ 32k / 47k" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl p-3 md:p-4"
                        style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)" }}
                      >
                        <p className="text-xs mb-1" style={{ color: "var(--lp-muted)" }}>
                          {stat.label}
                        </p>
                        <p className="font-heading font-bold text-lg md:text-xl" style={{ color: stat.color }}>
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
                    style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)" }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium" style={{ color: "var(--lp-foreground)" }}>
                        Vendas — últimos 7 dias
                      </p>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: "rgba(22,163,74,0.10)",
                          border: "1px solid rgba(22,163,74,0.20)",
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
                                ? "var(--gradient-brand-vivid)"
                                : "rgba(46,107,255,0.16)",
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-2">
                      {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                        <p key={d} className="flex-1 text-center text-xs" style={{ color: "var(--lp-subtle)" }}>
                          {d}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* Recent OS */}
                  <div
                    className="rounded-xl p-4 hidden md:block"
                    style={{ border: "1px solid var(--lp-border)", background: "var(--lp-surface)" }}
                  >
                    <p className="text-sm font-medium mb-3" style={{ color: "var(--lp-foreground)" }}>
                      Últimas ordens de serviço
                    </p>
                    <div className="space-y-2">
                      {[
                        { os: "OS #1247", client: "Maria Santos", status: "Pronto", bg: "rgba(22,163,74,0.10)", color: "var(--brand-success)" },
                        { os: "OS #1246", client: "João Almeida", status: "No laboratório", bg: "rgba(46,107,255,0.10)", color: "var(--brand-primary)" },
                        { os: "OS #1245", client: "Ana Lima", status: "Em andamento", bg: "rgba(245,158,11,0.12)", color: "var(--brand-warning)" },
                      ].map((item) => (
                        <div key={item.os} className="flex items-center justify-between text-sm">
                          <span className="font-medium" style={{ color: "var(--lp-muted)" }}>
                            {item.os}
                          </span>
                          <span style={{ color: "var(--lp-foreground)" }}>{item.client}</span>
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
              </BrowserFrame>

              {/* Reflexo */}
              <div
                className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-16 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse, rgba(46,107,255,0.22) 0%, transparent 70%)",
                  filter: "blur(28px)",
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
