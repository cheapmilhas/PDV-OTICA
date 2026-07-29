"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Eye, Stethoscope, Check } from "lucide-react";
import { fadeInUp, staggerContainer } from "@/lib/animations";

/**
 * Hero da home INSTITUCIONAL: a empresa e os dois segmentos.
 *
 * A promessa é a mesma para os dois públicos — tirar a operação do papel e da
 * planilha — e é ela que sustenta um título só. A escolha do segmento vem logo
 * abaixo, com peso igual, porque aqui o visitante ainda não se identificou.
 *
 * Sem número inventado: enquanto não houver métrica real e verificável, a prova
 * é a que existe (sistema no ar, dados no Brasil, suporte humano). Prometer
 * "+500 clientes" numa página que o dono vai mostrar para cliente é risco de
 * credibilidade, não de conversão.
 */

const CAMINHOS = [
  {
    href: "/oticas",
    Icon: Eye,
    titulo: "Para óticas",
    descricao:
      "PDV, ordem de serviço de lentes, estoque e financeiro. Do orçamento à entrega do par, sem planilha.",
    bullets: ["Ordem de serviço com o laboratório", "Estoque e caixa no mesmo lugar"],
    cta: "Ver o Vis para óticas",
  },
  {
    href: "/medical",
    Icon: Stethoscope,
    titulo: "Para clínicas e consultórios",
    descricao:
      "Prontuário eletrônico, agenda, receituário e financeiro para consultórios e clínicas de qualquer especialidade.",
    bullets: ["Prontuário assinado por quem atendeu", "Agenda e fila de espera"],
    cta: "Ver o Vis Medical",
  },
] as const;

export function InstitucionalHero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-32 sm:pb-24">
      <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
      <div className="absolute inset-0 bg-dots pointer-events-none" />
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-8%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "760px",
          height: "520px",
          background:
            "radial-gradient(ellipse, rgba(46,107,255,0.12) 0%, rgba(34,195,230,0.06) 50%, transparent 75%)",
          filter: "blur(2px)",
        }}
      />

      <div className="container-custom relative z-10">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-3xl text-center"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide"
            style={{
              borderColor: "var(--lp-border)",
              background: "var(--brand-tint)",
              color: "var(--brand-primary)",
            }}
          >
            Tecnologia para a saúde
          </motion.span>

          <motion.h1
            variants={fadeInUp}
            className="font-heading mt-7 font-extrabold"
            style={{
              fontSize: "var(--text-hero)",
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              color: "var(--lp-foreground)",
            }}
          >
            Software para quem
            <br />
            <span style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}>
              cuida de gente.
            </span>
          </motion.h1>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-7 max-w-xl text-lg"
            style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}
          >
            Dois sistemas, um jeito de trabalhar: tirar a sua operação do papel e
            da planilha. Um para óticas, outro para clínicas e consultórios.
          </motion.p>
        </motion.div>

        {/* Os dois caminhos. Peso igual: aqui o visitante ainda não disse quem é. */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2"
        >
          {CAMINHOS.map(({ href, Icon, titulo, descricao, bullets, cta }) => (
            <motion.div key={href} variants={fadeInUp}>
              <Link
                href={href}
                className="group flex h-full flex-col rounded-2xl p-8 transition-shadow"
                style={{
                  background: "var(--lp-surface)",
                  border: "1px solid var(--lp-border)",
                  boxShadow: "0 1px 2px rgba(10,31,68,0.04)",
                }}
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "var(--brand-tint)" }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "var(--brand-primary)" }}
                    aria-hidden="true"
                  />
                </div>

                <h2
                  className="font-heading mt-5 text-xl font-extrabold"
                  style={{ color: "var(--lp-foreground)", letterSpacing: "-0.02em" }}
                >
                  {titulo}
                </h2>

                <p
                  className="mt-3 text-sm"
                  style={{ color: "var(--lp-muted)", lineHeight: 1.65 }}
                >
                  {descricao}
                </p>

                <ul className="mt-5 space-y-2">
                  {bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-sm">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0"
                        style={{ color: "var(--brand-primary)" }}
                        aria-hidden="true"
                      />
                      <span style={{ color: "var(--lp-muted)" }}>{b}</span>
                    </li>
                  ))}
                </ul>

                <span
                  className="mt-7 inline-flex items-center gap-1.5 text-sm font-bold"
                  style={{ color: "var(--brand-primary)" }}
                >
                  {cta}
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
