"use client";

import { motion } from "framer-motion";
import { UserPlus, Settings, TrendingUp } from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

const steps = [
  {
    number: "01",
    icon: UserPlus,
    accentColor: "#2E6BFF",
    title: "Crie sua conta grátis",
    description: "Cadastro em minutos, direto no site. Sem cartão, sem compromisso.",
  },
  {
    number: "02",
    icon: Settings,
    accentColor: "#22C3E6",
    title: "Configure sua ótica",
    description:
      "Cadastre lojas, produtos e usuários. Precisa de ajuda? A gente migra seus dados com você.",
  },
  {
    number: "03",
    icon: TrendingUp,
    accentColor: "#16A34A",
    title: "Venda e registre OS",
    description: "Sua equipe usa no balcão no mesmo dia — a tela é simples e direta.",
  },
];

export function HowItWorks() {
  return (
    <section
      className="section-padding relative overflow-hidden"
      style={{ background: "var(--lp-background)" }}
    >
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mb-14"
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
          >
            Como funciona
          </p>
          <h2
            className="font-heading font-extrabold tracking-tight"
            style={{
              fontSize: "var(--text-h1)",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              color: "var(--lp-foreground)",
            }}
          >
            Sair do papel é{" "}
            <span style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}>
              mais simples do que você imagina.
            </span>
          </h2>
          <p
            className="mt-3 max-w-md"
            style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.65 }}
          >
            Em um dia sua ótica já pode estar rodando no Vis.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 relative"
        >
          {/* Subtle connector */}
          <div
            className="hidden md:block absolute top-8 pointer-events-none"
            style={{
              left: "calc(16.666% + 20px)",
              right: "calc(16.666% + 20px)",
              height: "1px",
              background:
                "linear-gradient(90deg, rgba(46,107,255,0.25) 0%, rgba(34,195,230,0.20) 50%, rgba(22,163,74,0.18) 100%)",
            }}
          />

          {steps.map((s, i) => (
            <motion.div key={s.number} variants={fadeInUp} className="relative">
              {/* Large watermark number — human touch */}
              <div
                className="absolute -top-2 right-0 font-heading font-bold select-none pointer-events-none"
                style={{
                  fontSize: "5rem",
                  lineHeight: 1,
                  color: `${s.accentColor}07`,
                  letterSpacing: "-0.05em",
                }}
              >
                {s.number}
              </div>

              <div className="relative z-10">
                <div
                  className="inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-5"
                  style={{
                    background: `${s.accentColor}12`,
                    border: `1px solid ${s.accentColor}22`,
                  }}
                >
                  <s.icon className="h-7 w-7" style={{ color: s.accentColor }} />
                </div>
                <p
                  className="text-xs font-bold mb-2"
                  style={{ color: s.accentColor, letterSpacing: "0.05em" }}
                >
                  Passo {i + 1}
                </p>
                <h3
                  className="font-heading font-semibold mb-2 text-lg"
                  style={{ color: "var(--lp-foreground)" }}
                >
                  {s.title}
                </h3>
                <p
                  className="text-sm leading-relaxed max-w-xs"
                  style={{ color: "var(--lp-muted)" }}
                >
                  {s.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
