"use client";

import { motion } from "framer-motion";
import { Lock, Cloud, BookOpen, Key, FileCheck, Activity } from "lucide-react";
import { GradientText } from "@/components/ui/gradient-text";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

const items = [
  {
    icon: Lock,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    title: "Criptografia SSL/TLS",
    description: "Toda comunicação entre seu computador e o servidor é criptografada.",
  },
  {
    icon: Cloud,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    title: "Backup automático diário",
    description: "Seus dados são copiados automaticamente todos os dias sem você precisar fazer nada.",
  },
  {
    icon: FileCheck,
    color: "text-brand-success",
    bg: "bg-brand-success/10",
    title: "LGPD Compliant",
    description: "Conformidade total com a Lei Geral de Proteção de Dados dos seus clientes.",
  },
  {
    icon: BookOpen,
    color: "text-brand-warning",
    bg: "bg-brand-warning/10",
    title: "Livro de Receitas Digital",
    description: "Obrigatório pela Vigilância Sanitária (Decreto 24.492/1934) — incluso no sistema.",
  },
  {
    icon: Key,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    title: "Certificado Digital",
    description: "Integração com certificado A1 e A3 para emissão fiscal sem complicação.",
  },
  {
    icon: Activity,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    title: "Log de Auditoria",
    description: "Registro completo de todas as ações: quem fez o quê, quando e de onde.",
  },
];

export function Security() {
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
            Seus dados.{" "}
            <GradientText>Protegidos de verdade.</GradientText>
          </h2>
          <p className="mt-4 text-muted text-lg max-w-xl mx-auto">
            Segurança e conformidade para você dormir tranquilo enquanto sua ótica funciona.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {items.map((item) => (
            <motion.div
              key={item.title}
              variants={fadeInUp}
              className="flex gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--border-hover)] transition-colors"
            >
              <div className={`shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{item.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
