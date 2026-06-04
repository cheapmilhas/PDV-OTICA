"use client";

import { motion } from "framer-motion";
import { FileSpreadsheet, TrendingDown, UserX } from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

const items = [
  {
    icon: FileSpreadsheet,
    accentColor: "#2E6BFF",
    problem: "A OS da lente está num bloquinho?",
    solution:
      "Toda OS tem status, prazo e laboratório na tela. Quando o cliente liga perguntando da lente, você responde na hora.",
  },
  {
    icon: TrendingDown,
    accentColor: "#22C3E6",
    problem: "Não sabe se a ótica deu lucro de verdade?",
    solution:
      "DRE, fluxo de caixa e fechamento de caixa prontos. No fim do mês você sabe se fechou no azul — sem montar planilha.",
  },
  {
    icon: UserX,
    accentColor: "#16A34A",
    problem: "Cliente compra uma vez e some?",
    solution:
      "Histórico, receita e cashback de cada cliente à mão. Você atende melhor, fideliza e vende de novo.",
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
          className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
        >
          Problemas que resolvemos
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="font-heading font-bold tracking-tight mb-10 max-w-2xl"
          style={{ fontSize: "var(--text-h2)", color: "var(--lp-foreground)" }}
        >
          Gerir ótica no caderno e no Excel custa caro — só que você não vê o
          preço.
        </motion.h2>

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
              className="vis-card group cursor-default"
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

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 text-base font-medium"
          style={{ color: "var(--lp-foreground)" }}
        >
          Você abriu uma ótica para cuidar de clientes. Não para caçar
          informação.
        </motion.p>
      </div>
    </section>
  );
}
