"use client";

import { motion } from "framer-motion";
import { UserPlus, Settings, TrendingUp } from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

const steps = [
  {
    number: "01",
    icon: UserPlus,
    accentColor: "#6366F1",
    title: "Crie sua conta",
    description: "Cadastro simples em menos de 5 minutos. Sem cartão, sem burocracia.",
  },
  {
    number: "02",
    icon: Settings,
    accentColor: "#0EA5E9",
    title: "Configure sua ótica",
    description:
      "Importe seu estoque, cadastre produtos e configure sua equipe com a ajuda do nosso time.",
  },
  {
    number: "03",
    icon: TrendingUp,
    accentColor: "#10B981",
    title: "Comece a vender",
    description: "Em até 7 dias sua ótica está em plena operação. Com treinamento incluído.",
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
            Simples de{" "}
            <span style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}>
              começar.
            </span>
          </h2>
          <p
            className="mt-3 max-w-md"
            style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.65 }}
          >
            Três passos para transformar a gestão da sua ótica.
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
                "linear-gradient(90deg, rgba(99,102,241,0.22) 0%, rgba(14,165,233,0.18) 50%, rgba(16,185,129,0.18) 100%)",
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
