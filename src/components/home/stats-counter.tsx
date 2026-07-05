"use client";

import { motion } from "framer-motion";
import { Cloud, Smartphone, Headphones, Shield } from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";
import { GradientText } from "@/components/ui/gradient-text";

// "Linha de fatos": cada item é uma afirmação curta com ícone, no lugar dos
// antigos números-gigantes-com-gradiente (que eram um clichê de site gerado por
// IA e exibiam valores sem sentido como "0%"/"<0h" ao animar).
const facts = [
  {
    icon: Cloud,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    title: "100% na nuvem",
    description: "Acesse de qualquer lugar, a qualquer hora — sem instalar nada.",
  },
  {
    icon: Smartphone,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    title: "Funciona no celular",
    description: "Feito para o balcão: usa no computador, tablet ou telefone.",
  },
  {
    icon: Headphones,
    color: "text-brand-success",
    bg: "bg-brand-success/10",
    title: "Suporte humano",
    description: "Resposta de gente de verdade, em menos de 2 horas.",
  },
  {
    icon: Shield,
    color: "text-brand-warning",
    bg: "bg-brand-warning/10",
    title: "LGPD por padrão",
    description: "Dados criptografados e protegidos pela lei, sem trabalho extra.",
  },
];

export function StatsCounter() {
  return (
    <section className="section-padding">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.4 }}
          className="text-center mb-12"
        >
          <h2
            className="font-heading font-bold text-foreground tracking-tight"
            style={{ fontSize: "var(--text-h1)" }}
          >
            Feito para <GradientText>durar.</GradientText>
          </h2>
          <p className="mt-4 text-muted text-lg max-w-xl mx-auto">
            Tecnologia de ponta com a simplicidade que o dia a dia da ótica exige.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {facts.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeInUp}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--border-hover)] transition-colors"
            >
              <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${f.bg} mb-4`}>
                <f.icon className={`h-5 w-5 ${f.color}`} />
              </div>
              <p className="font-heading font-bold text-foreground text-lg mb-1.5">{f.title}</p>
              <p className="text-sm text-muted leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
