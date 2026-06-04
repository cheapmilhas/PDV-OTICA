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
import { SectionHeading } from "@/components/home/section-heading";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

const features = [
  {
    icon: ShoppingCart,
    accentColor: "#2E6BFF",
    title: "Venda mais rápida no balcão",
    description:
      "Feche a venda em poucos cliques, aplique desconto e atenda o próximo cliente sem fila. A venda de lente já gera a OS sozinha.",
    tags: ["Venda em segundos", "Desconto com limite", "OS automática"],
    span: "2" as const,
  },
  {
    icon: DollarSign,
    accentColor: "#16A34A",
    title: "O financeiro da ótica resolvido",
    description:
      "Contas a pagar, a receber, fluxo de caixa e DRE prontos para você saber se o mês fechou no azul — sem montar planilha de madrugada.",
    tags: ["Lucro real", "DRE pronto", "Fechamento de caixa"],
    span: "2" as const,
  },
  {
    icon: FlaskConical,
    accentColor: "#22C3E6",
    title: "Cada OS de lente sob controle",
    description:
      "Saiba o prazo, o status e o laboratório de cada serviço — e nunca mais esqueça uma lente no caminho.",
    tags: ["Prazo visível", "Laboratório certo", "Nada se perde"],
    span: "1" as const,
  },
  {
    icon: Users,
    accentColor: "#2E6BFF",
    title: "Clientes que voltam",
    description:
      "Histórico, receita e contato de cada cliente à mão, para você atender melhor e vender de novo.",
    tags: ["Histórico completo", "Receita à mão", "Recompra fácil"],
    span: "1" as const,
  },
  {
    icon: Package,
    accentColor: "#F59E0B",
    title: "Estoque que bate com a realidade",
    description:
      "Saiba o que tem, o que falta e o que está parado na prateleira — sem contar armação na mão.",
    tags: ["Alerta de baixa", "Armações e lentes", "Multi-loja"],
    span: "1" as const,
  },
  {
    icon: FileText,
    accentColor: "#0A1F44",
    title: "Cada um no seu papel",
    description:
      "Vendedor, caixa e gerente com acessos próprios — mais segurança e menos confusão no dia a dia.",
    tags: ["Acesso por cargo", "Mais segurança", "Caixa rastreável"],
    span: "1" as const,
  },
  {
    icon: MessageSquare,
    accentColor: "#16A34A",
    title: "Cashback que traz o cliente",
    description:
      "Recompense quem compra e dê um motivo a mais para o cliente escolher a sua ótica de novo.",
    tags: ["Fideliza", "Cliente volta", "Sem trabalho extra"],
    span: "1" as const,
  },
  {
    icon: BarChart3,
    accentColor: "#22C3E6",
    title: "Relatórios que ajudam a decidir",
    description:
      "Veja qual vendedor performa mais, qual produto gira menos e onde está a inadimplência — em tempo real.",
    tags: ["Por vendedor", "Giro de produto", "Inadimplência"],
    span: "1" as const,
  },
];

export function FeaturesBento() {
  return (
    <section
      id="funcionalidades"
      className="section-padding relative overflow-hidden scroll-mt-20"
      style={{ background: "var(--lp-background)" }}
    >
      {/* Subtle radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: "600px",
          height: "300px",
          background:
            "radial-gradient(ellipse, rgba(46,107,255,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="container-custom relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <SectionHeading
            eyebrow="Funcionalidades"
            title={
              <>
                Tudo o que sua ótica precisa.{" "}
                <span style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}>
                  Nada que você não vai usar.
                </span>
              </>
            }
            subtitle="Recursos pensados para o balcão, o caixa e a gerência — não para um manual de TI."
          />
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
              className={[
                "vis-card relative p-5 group cursor-default",
                f.span === "2" ? "md:col-span-2" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
                      border: "1px solid var(--lp-border)",
                      color: "var(--lp-muted)",
                      background: "var(--lp-background)",
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
