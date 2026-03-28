"use client";

import { motion } from "framer-motion";
import { FileSpreadsheet, TrendingDown, UserX } from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

const items = [
  {
    icon: FileSpreadsheet,
    accentColor: "#F59E0B",
    problem: "Cansado de planilhas e anotações em papel?",
    solution:
      "O PDV Ótica centraliza tudo: vendas, clientes, estoque e financeiro num só lugar. Sem planilha, sem caos.",
  },
  {
    icon: TrendingDown,
    accentColor: "#6366F1",
    problem: "Não sabe se sua ótica está dando lucro?",
    solution:
      "DRE, fluxo de caixa e dashboard em tempo real mostram exatamente como está sua operação — por dia, semana ou mês.",
  },
  {
    icon: UserX,
    accentColor: "#0EA5E9",
    problem: "Clientes compram uma vez e nunca mais voltam?",
    solution:
      "WhatsApp automático para receitas vencendo, aniversários e campanhas de fidelização. Seu cliente sempre lembrando de você.",
  },
];

export function ProblemsSolutions() {
  return (
    <section
      className="section-padding"
      style={{ background: "var(--lp-surface)" }}
    >
      <div className="container-custom">
        {/* Section label — gives context, no centered H2 blob */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-xs font-bold uppercase tracking-widest mb-10"
          style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
        >
          Problemas que resolvemos
        </motion.p>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {items.map((item) => (
            <motion.div
              key={item.problem}
              variants={fadeInUp}
              className="group rounded-2xl p-6 transition-all duration-300 cursor-default"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = `${item.accentColor}30`;
                el.style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "rgba(255,255,255,0.07)";
                el.style.background = "rgba(255,255,255,0.025)";
              }}
            >
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-5 transition-transform duration-300 group-hover:scale-110"
                style={{
                  background: `${item.accentColor}14`,
                  border: `1px solid ${item.accentColor}22`,
                }}
              >
                <item.icon className="h-5 w-5" style={{ color: item.accentColor }} />
              </div>
              <h3
                className="font-heading font-semibold mb-3 text-base leading-snug"
                style={{ color: "var(--lp-foreground)" }}
              >
                {item.problem}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--lp-muted)" }}>
                {item.solution}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
