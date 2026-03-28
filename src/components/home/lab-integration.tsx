"use client";

import { motion } from "framer-motion";
import { FlaskConical, ArrowRight, Bell, CheckCircle } from "lucide-react";
import { GradientText } from "@/components/ui/gradient-text";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

const steps = [
  {
    icon: FlaskConical,
    color: "text-brand-primary",
    bg: "bg-brand-primary/10",
    step: "01",
    title: "Envie a O.S.",
    description: "Com um clique, envie a ordem de serviço diretamente ao laboratório parceiro.",
  },
  {
    icon: ArrowRight,
    color: "text-brand-accent",
    bg: "bg-brand-accent/10",
    step: "02",
    title: "Acompanhe em tempo real",
    description: "Veja o status do pedido em cada etapa — do envio até a conclusão no laboratório.",
  },
  {
    icon: Bell,
    color: "text-brand-success",
    bg: "bg-brand-success/10",
    step: "03",
    title: "Cliente notificado",
    description: "Quando o óculos ficar pronto, o cliente recebe aviso automático no WhatsApp.",
  },
];

export function LabIntegration() {
  return (
    <section className="section-padding bg-[var(--surface)]">
      <div className="container-custom">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={viewportConfig}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 text-xs font-medium text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-full px-3 py-1 mb-6">
              <FlaskConical className="h-3 w-3" />
              Diferencial exclusivo
            </div>
            <h2
              className="font-heading font-bold text-foreground tracking-tight mb-4"
              style={{ fontSize: "var(--text-h2)" }}
            >
              Conectado com{" "}
              <GradientText>seu laboratório.</GradientText>
            </h2>
            <p className="text-muted text-base leading-relaxed mb-8">
              Acompanhe cada pedido de lente do envio até a entrega, sem precisar ligar
              para ninguém. Seu laboratório recebe tudo automaticamente.
            </p>

            <div className="flex items-center gap-3 text-sm text-muted">
              <CheckCircle className="h-4 w-4 text-brand-success shrink-0" />
              <span>Integrado com os principais laboratórios do Brasil</span>
            </div>
          </motion.div>

          {/* Steps */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={viewportConfig}
            className="space-y-4"
          >
            {steps.map((s) => (
              <motion.div
                key={s.step}
                variants={fadeInUp}
                className="flex gap-4 items-start rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 hover:border-[var(--border-hover)] transition-colors"
              >
                <div className={`shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-subtle">{s.step}</span>
                    <h3 className="font-semibold text-foreground text-sm">{s.title}</h3>
                  </div>
                  <p className="text-sm text-muted">{s.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
