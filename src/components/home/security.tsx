"use client";

import { motion } from "framer-motion";
import { Lock, Cloud, BookOpen, Key, FileCheck, Activity } from "lucide-react";
import { GradientText } from "@/components/ui/gradient-text";
import { SectionHeading } from "@/components/home/section-heading";
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
    title: "Dados tratados conforme a LGPD",
    // "LGPD Compliant / Conformidade TOTAL" é afirmação jurídica absoluta e
    // inverificável — e o resto do site (registro-medical, /medical) já usa
    // esta fórmula, que descreve a prática sem prometer certificação.
    description:
      "Controle de quem vê o quê e registro de quem acessou os dados dos seus clientes.",
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
    // A emissão fiscal (NFC-e/NF-e) está no roadmap, não contratável hoje.
    // Anunciar como pronto fazia o site prometer o que a assinatura não entrega.
    emBreve: true,
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
        >
          <SectionHeading
            eyebrow="Segurança & confiança"
            title={
              <>
                Seus dados seguros —{" "}
                <GradientText>e sempre com você.</GradientText>
              </>
            }
            subtitle="Sua ótica na nuvem, com backup automático e proteção de ponta a ponta."
          />
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
              className="vis-card flex gap-4 p-5"
            >
              <div className={`shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl ${item.bg}`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <div>
                <h3
                  className="font-semibold text-sm mb-1 flex items-center gap-2 flex-wrap"
                  style={{ color: "var(--lp-foreground)" }}
                >
                  {item.title}
                  {"emBreve" in item && item.emBreve && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide"
                      style={{
                        background: "var(--lp-background)",
                        border: "1px solid var(--lp-border)",
                        color: "var(--lp-muted)",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Em breve
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted leading-relaxed">{item.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
