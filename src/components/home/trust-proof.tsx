"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  Cloud,
  Sparkles,
  MessageCircle,
  Unlock,
  CreditCard,
  Check,
} from "lucide-react";
import { SectionHeading } from "@/components/home/section-heading";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

// Faixa A — métricas reais do produto. `counter` define se o número anima
// (valores textuais como "Diário"/"IA" ficam estáticos).
const metrics: {
  counter?: { value: number; suffix?: string };
  text?: string;
  label: string;
}[] = [
  { counter: { value: 100, suffix: "%" }, label: "na nuvem" },
  { text: "Diário", label: "backup automático" },
  { text: "IA", label: "leitura de receita por foto" },
  { counter: { value: 0 }, label: "instalação — abra e use" },
];

// Faixa B — selos. `highlight` marca o destaque (OCR por IA).
const badges = [
  {
    icon: ShieldCheck,
    title: "LGPD por padrão",
    description: "Seus dados e os do cliente protegidos pela lei.",
  },
  {
    icon: Cloud,
    title: "100% na nuvem",
    description: "Sumiu o computador da loja? Seus dados continuam.",
  },
  {
    icon: Sparkles,
    title: "OCR de receita por IA",
    description: "Fotografe a receita e o Vis preenche os valores.",
    highlight: true,
  },
  {
    icon: MessageCircle,
    title: "Suporte humano no WhatsApp",
    description: "Fala com gente de verdade, não com robô.",
  },
  {
    icon: Unlock,
    title: "Sem fidelidade",
    description: "Fica porque gosta, não porque está preso.",
  },
  {
    icon: CreditCard,
    title: "Sem cartão para testar",
    description: "Comece grátis hoje, sem compromisso.",
  },
];

const guarantees = [
  "Sem cartão de crédito",
  "Sem fidelidade",
  "Cancele quando quiser",
];

export function TrustProof() {
  return (
    <section
      className="section-padding"
      style={{ background: "var(--gradient-brand-wash)" }}
    >
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.5 }}
        >
          <SectionHeading
            eyebrow="Por que confiar no Vis"
            title="Confiança que se verifica, não se promete"
            subtitle="Sem números inflados nem promessas vazias — só o que o sistema realmente entrega no dia a dia da sua ótica."
          />
        </motion.div>

        {/* Faixa A — métricas do produto */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-2 md:grid-cols-4 divide-y divide-[var(--border)] sm:divide-y-0 sm:divide-x sm:divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60"
        >
          {metrics.map((m) => (
            <motion.div
              key={m.label}
              variants={fadeInUp}
              className="text-center px-4 py-8"
            >
              <div
                className="font-heading font-extrabold tracking-tight"
                style={{ fontSize: "2.5rem", lineHeight: 1, color: "var(--lp-foreground)" }}
              >
                {m.counter ? (
                  <AnimatedCounter value={m.counter.value} suffix={m.counter.suffix} />
                ) : (
                  m.text
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{m.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Faixa B — selos */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12"
        >
          {badges.map((b) => (
            <motion.div
              key={b.title}
              variants={fadeInUp}
              className="vis-card p-5 relative flex gap-4"
              style={b.highlight ? { borderColor: "var(--brand-accent)" } : undefined}
            >
              {b.highlight && (
                <span
                  className="absolute -top-2.5 right-4 inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide"
                  style={{ background: "var(--brand-tint)", color: "var(--brand-primary)" }}
                >
                  Exclusivo
                </span>
              )}
              <div
                className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={
                  b.highlight
                    ? { background: "rgba(34, 195, 230, 0.12)", color: "var(--brand-accent)" }
                    : { background: "var(--brand-tint)", color: "var(--brand-primary)" }
                }
              >
                <b.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{b.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{b.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Faixa C — garantias em linha */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.5 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted"
        >
          {guarantees.map((g, i) => (
            <span key={g} className="inline-flex items-center gap-2">
              {i > 0 && <span className="text-[var(--border-hover)]" aria-hidden>·</span>}
              <Check className="h-4 w-4 shrink-0" style={{ color: "var(--brand-success)" }} />
              {g}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
