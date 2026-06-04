"use client";

import { motion } from "framer-motion";
import { Store, Building2, FlaskConical } from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";
import { GradientText } from "@/components/ui/gradient-text";

const profiles = [
  {
    icon: Store,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    title: "Ótica independente",
    headline: "Saia do apaga-incêndio",
    description:
      "Você faz um pouco de tudo. O Vis organiza venda, OS, estoque e dinheiro num lugar só, para você voltar a vender.",
    tag: "1 loja",
  },
  {
    icon: Building2,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    title: "Rede com várias lojas",
    headline: "Todas as unidades num painel",
    description:
      "Multi-loja e multi-CNPJ na mesma conta. Veja o desempenho de cada loja e o todo, sem abrir cinco arquivos.",
    tag: "Multi-loja",
  },
  {
    icon: FlaskConical,
    color: "text-brand-success",
    bg: "bg-brand-success/10",
    title: "Ótica com laboratório",
    headline: "Cada lente no prazo certo",
    description:
      "Acompanhe cada OS até o laboratório — interno ou terceirizado — e saiba o prazo real de cada serviço.",
    tag: "Próprio ou parceiro",
  },
];

export function TargetAudience() {
  return (
    <section className="section-padding">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2
            className="font-heading font-bold text-foreground tracking-tight"
            style={{ fontSize: "var(--text-h1)" }}
          >
            Feito para óticas{" "}
            <GradientText>de verdade.</GradientText>
          </h2>
          <p className="mt-4 text-muted text-lg max-w-xl mx-auto">
            Uma loja só ou uma rede inteira, com laboratório próprio ou
            parceiros. O Vis se adapta ao seu jeito.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {profiles.map((p) => (
            <motion.div
              key={p.title}
              variants={fadeInUp}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--border-hover)] hover:shadow-glow transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${p.bg}`}>
                  <p.icon className={`h-5 w-5 ${p.color}`} />
                </div>
                <span className="text-xs font-medium text-subtle border border-[var(--border)] rounded-full px-2.5 py-1">
                  {p.tag}
                </span>
              </div>
              <p className="text-xs font-medium text-muted mb-1">{p.title}</p>
              <h3 className="font-heading font-semibold text-foreground mb-2 text-base leading-snug">
                {p.headline}
              </h3>
              <p className="text-sm text-muted leading-relaxed">{p.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
