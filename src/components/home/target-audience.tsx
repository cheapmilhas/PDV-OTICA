"use client";

import { motion } from "framer-motion";
import { Store, Building2, Link2, ShoppingBag } from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";
import { GradientText } from "@/components/ui/gradient-text";

const profiles = [
  {
    icon: Store,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    title: "Ótica Independente",
    headline: "Controle tudo sem complicação",
    description:
      "Sistema completo para quem gerencia sozinho. PDV, estoque, caixa e pós-venda num único lugar fácil de usar.",
    tag: "1 loja",
  },
  {
    icon: Building2,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    title: "Rede de Óticas",
    headline: "Todas as lojas, um só painel",
    description:
      "Gerencie estoque, vendas e resultados de cada filial com visão consolidada da rede inteira.",
    tag: "2-10 lojas",
  },
  {
    icon: Link2,
    color: "text-brand-success",
    bg: "bg-brand-success/10",
    title: "Franquias",
    headline: "Padronize e escale",
    description:
      "Operações uniformes em todas as unidades, com relatórios por franqueado e controle central.",
    tag: "Franquias",
  },
  {
    icon: ShoppingBag,
    color: "text-brand-warning",
    bg: "bg-brand-warning/10",
    title: "Ótica Online + Física",
    headline: "Integre seus canais",
    description:
      "E-commerce e loja física sincronizados. Estoque único, clientes unificados, vendas em qualquer canal.",
    tag: "Omnichannel",
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
            Para todo tipo de{" "}
            <GradientText>ótica.</GradientText>
          </h2>
          <p className="mt-4 text-muted text-lg max-w-xl mx-auto">
            Seja você dono de uma loja ou de uma rede, o PDV Ótica se adapta à sua realidade.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
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
