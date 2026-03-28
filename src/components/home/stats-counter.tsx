"use client";

import { motion } from "framer-motion";
import { Cloud, Smartphone, Headphones, Shield } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";
import { GradientText } from "@/components/ui/gradient-text";

const stats = [
  {
    icon: Cloud,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    value: 100,
    suffix: "%",
    label: "Na nuvem",
    description: "Acesse de qualquer lugar, qualquer hora",
  },
  {
    icon: Smartphone,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    value: 0,
    customValue: "Mobile",
    suffix: "",
    label: "Primeiro",
    description: "Funciona perfeitamente no celular",
  },
  {
    icon: Headphones,
    color: "text-brand-success",
    bg: "bg-brand-success/10",
    value: 2,
    suffix: "h",
    prefix: "<",
    label: "Suporte",
    description: "Resposta humanizada ultra-rápida",
  },
  {
    icon: Shield,
    color: "text-brand-warning",
    bg: "bg-brand-warning/10",
    value: 0,
    customValue: "LGPD",
    suffix: "",
    label: "Compliant",
    description: "Dados criptografados e protegidos",
  },
];

export function StatsCounter() {
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
            Feito para{" "}
            <GradientText>durar.</GradientText>
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
          className="grid grid-cols-2 lg:grid-cols-4 gap-5"
        >
          {stats.map((s) => (
            <motion.div
              key={s.label}
              variants={fadeInUp}
              className="text-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 hover:border-[var(--border-hover)] transition-colors"
            >
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${s.bg} mb-4`}>
                <s.icon className={`h-6 w-6 ${s.color}`} />
              </div>
              <div className="font-heading font-bold text-3xl md:text-4xl text-gradient mb-1">
                {s.customValue ? (
                  s.customValue
                ) : (
                  <AnimatedCounter
                    value={s.value}
                    suffix={s.suffix}
                    prefix={s.prefix}
                  />
                )}
              </div>
              <p className="font-semibold text-foreground text-sm mb-1">{s.label}</p>
              <p className="text-xs text-muted">{s.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
