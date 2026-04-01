"use client";

import { motion } from "framer-motion";
import {
  ShoppingCart,
  Users,
  Package,
  DollarSign,
  FileText,
  FlaskConical,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

const features = [
  {
    icon: ShoppingCart,
    accentColor: "#6366F1",
    title: "PDV e Vendas",
    description:
      "Feche uma venda em segundos. O.S. gerada automaticamente com logo da ótica, desconto com limite por vendedor e cliente sai com recibo no WhatsApp na hora.",
    tags: ["Venda em segundos", "Sem erro de desconto", "Recibo automático"],
    span: "2" as const,
  },
  {
    icon: DollarSign,
    accentColor: "#10B981",
    title: "Financeiro",
    description:
      "Saiba exatamente se sua ótica está dando lucro — hoje, esse mês, esse ano. DRE, fluxo de caixa e comissões calculadas automaticamente. Sem planilha, sem contador manual.",
    tags: ["Lucro em tempo real", "DRE automático", "Comissão calculada"],
    span: "2" as const,
  },
  {
    icon: Users,
    accentColor: "#0EA5E9",
    title: "Clientes e Receituários",
    description:
      "Nunca perca um cliente por receita vencida. Alerta automático antes do prazo e histórico completo de compras e receitas em um clique.",
    tags: ["Alerta de vencimento", "Histórico completo", "Recompra fácil"],
    span: "1" as const,
  },
  {
    icon: Package,
    accentColor: "#F59E0B",
    title: "Estoque",
    description:
      "Nunca mais perca venda por falta de produto. Alerta antes de zerar, entrada de nota por XML sem digitar nada e controle de todas as filiais numa tela só.",
    tags: ["Alerta antes de zerar", "XML sem digitação", "Multi-loja"],
    span: "1" as const,
  },
  {
    icon: FlaskConical,
    accentColor: "#6366F1",
    title: "Laboratório",
    description:
      "Pare de ligar para saber se o óculos ficou pronto. Envie a O.S. ao laboratório com um clique e o cliente recebe aviso no WhatsApp automaticamente quando estiver pronto.",
    tags: ["Sem ligação para lab", "Status automático", "Cliente avisado"],
    span: "1" as const,
  },
  {
    icon: FileText,
    accentColor: "#0EA5E9",
    title: "Fiscal",
    description:
      "Emita NF-e, NFC-e e SAT sem sair do sistema. Nunca mais digitar nota fiscal na mão — tudo vai automático para o contador.",
    tags: ["NF-e sem esforço", "Contador automático", "SAT integrado"],
    span: "1" as const,
  },
  {
    icon: MessageSquare,
    accentColor: "#10B981",
    title: "Pós-venda",
    description:
      "Traga o cliente de volta sem precisar ligar. WhatsApp automático no aniversário, quando a receita vencer e em campanhas de fidelização — tudo no piloto.",
    tags: ["Cliente volta sozinho", "WhatsApp automático", "Sem trabalho extra"],
    span: "1" as const,
  },
  {
    icon: BarChart3,
    accentColor: "#F59E0B",
    title: "Relatórios e BI",
    description:
      "Tome decisões com dados, não com feeling. Veja qual vendedor performa mais, qual produto gira menos e onde está a inadimplência — em tempo real.",
    tags: ["Decisão com dados", "Por vendedor", "Inadimplência visível"],
    span: "1" as const,
  },
];

export function FeaturesBento() {
  return (
    <section
      className="section-padding relative overflow-hidden"
      style={{ background: "var(--lp-background)" }}
    >
      {/* Subtle radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: "600px",
          height: "300px",
          background:
            "radial-gradient(ellipse, rgba(99,102,241,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="container-custom relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-14"
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
          >
            Funcionalidades
          </p>
          <h2
            className="font-heading font-extrabold tracking-tight"
            style={{
              fontSize: "var(--text-h1)",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              color: "var(--lp-foreground)",
            }}
          >
            Tudo que sua ótica precisa.{" "}
            <span style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}>
              Num só lugar.
            </span>
          </h2>
          <p
            className="mt-4 max-w-xl mx-auto"
            style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.65 }}
          >
            Módulos completos que trabalham juntos para você não precisar de nenhum outro sistema.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeInUp}
              whileHover={{
                y: -5,
                transition: { duration: 0.25, ease: [0.25, 1, 0.5, 1] },
              }}
              className={[
                "relative rounded-2xl p-5 transition-all duration-300 group cursor-default",
                f.span === "2" ? "md:col-span-2" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = `${f.accentColor}35`;
                el.style.background = `rgba(255,255,255,0.04)`;
                el.style.boxShadow = `0 8px 32px rgba(0,0,0,0.2), 0 0 0 1px ${f.accentColor}15`;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = "rgba(255,255,255,0.07)";
                el.style.background = "rgba(255,255,255,0.025)";
                el.style.boxShadow = "none";
              }}
            >
              {/* Icon */}
              <div
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4 transition-all duration-300 group-hover:scale-110"
                style={{
                  background: `${f.accentColor}14`,
                  border: `1px solid ${f.accentColor}22`,
                }}
              >
                <f.icon className="h-5 w-5" style={{ color: f.accentColor }} />
              </div>

              <h3
                className="font-heading font-semibold mb-2"
                style={{ color: "var(--lp-foreground)", fontSize: "0.9375rem" }}
              >
                {f.title}
              </h3>
              <p
                className="text-sm leading-relaxed mb-4"
                style={{ color: "var(--lp-muted)" }}
              >
                {f.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {f.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "var(--lp-subtle)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Accent line at bottom — reveals on hover */}
              <div
                className="absolute bottom-0 left-6 right-6 h-px rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(90deg, transparent, ${f.accentColor}55, transparent)`,
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
