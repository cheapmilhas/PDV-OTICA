"use client";

import { motion } from "framer-motion";
import { Quote } from "lucide-react";
import { staggerContainer, fadeInUp, viewportConfig } from "@/lib/animations";

/**
 * ⚠️ TODO(dono): PROVA SOCIAL — depoimentos REAIS.
 *
 * Esta seção está com conteúdo PLACEHOLDER. Substitua cada item de
 * `testimonials` por um depoimento verdadeiro de uma ótica que usa o Vis:
 *   - quote: a frase do cliente (curta, específica, no que o Vis resolveu)
 *   - name:  nome real
 *   - role:  cargo/loja (ex.: "Dona da Ótica X")
 *   - city:  cidade/UF (ex.: "Fortaleza/CE")
 *   - photo: caminho de uma foto real em /public (ex.: "/depoimentos/maria.jpg");
 *            deixe null para mostrar as iniciais.
 *
 * NÃO invente depoimentos nem números de óticas. O gate está em
 * `testimonials-flag.ts` (TESTIMONIALS_ARE_PLACEHOLDER): enquanto for true, a
 * seção não é renderizada na home (ver page.tsx) — troque para false quando
 * tiver pelo menos 2 depoimentos reais.
 */

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  city: string;
  photo: string | null;
};

const testimonials: Testimonial[] = [
  {
    quote:
      "PLACEHOLDER — troque por um depoimento real. Ex.: \"Hoje sei em que laboratório está cada lente. O cliente liga e eu respondo na hora.\"",
    name: "Nome do cliente",
    role: "Dona da Ótica Exemplo",
    city: "Cidade/UF",
    photo: null,
  },
  {
    quote:
      "PLACEHOLDER — troque por um depoimento real. Ex.: \"Parei de fechar o mês na planilha de madrugada. O DRE já vem pronto.\"",
    name: "Nome do cliente",
    role: "Gerente — Ótica Exemplo",
    city: "Cidade/UF",
    photo: null,
  },
  {
    quote:
      "PLACEHOLDER — troque por um depoimento real. Ex.: \"A equipe aprendeu a usar no mesmo dia. A venda de lente já cria a OS sozinha.\"",
    name: "Nome do cliente",
    role: "Dono da Ótica Exemplo",
    city: "Cidade/UF",
    photo: null,
  },
];

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export function Testimonials() {
  return (
    <section className="section-padding" style={{ background: "var(--lp-surface)" }}>
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportConfig}
          transition={{ duration: 0.3 }}
          className="mb-12 max-w-xl"
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
          >
            Quem usa
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
            Óticas que saíram do papel com o Vis.
          </h2>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {testimonials.map((t, i) => (
            <motion.figure
              key={i}
              variants={fadeInUp}
              className="flex flex-col rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-background)] p-6"
            >
              <Quote className="h-6 w-6 mb-4" style={{ color: "var(--brand-primary)", opacity: 0.5 }} />
              <blockquote
                className="flex-1 text-[0.9375rem] leading-relaxed"
                style={{ color: "var(--lp-foreground)" }}
              >
                {t.quote}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full flex-shrink-0 font-heading font-bold text-sm"
                  style={{
                    background: "var(--brand-tint)",
                    color: "var(--brand-primary)",
                  }}
                >
                  {initials(t.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color: "var(--lp-foreground)" }}>
                    {t.name}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--lp-subtle)" }}>
                    {t.role} · {t.city}
                  </p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
