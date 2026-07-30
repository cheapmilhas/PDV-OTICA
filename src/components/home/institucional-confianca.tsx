"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, MessageCircle, ShieldCheck, Smartphone, Headset } from "lucide-react";
import { WHATSAPP_URL } from "@/lib/constants";
import { fadeInUp, staggerContainer, viewportConfig } from "@/lib/animations";

/**
 * A parte de baixo da home institucional: por que confiar, e o convite a falar.
 *
 * REGRA que vale para toda esta página: nenhuma afirmação que não seja
 * verificável hoje. Sem "+500 clientes", sem "99,9% de uptime", sem depoimento
 * inventado — o dono mostra este site para cliente, e uma promessa que ele não
 * consegue sustentar numa conversa custa mais caro que a conversão que traria.
 * Quando houver número real, ele entra aqui.
 *
 * O CTA final é conversa, não cadastro: quem chega na home institucional ainda
 * não escolheu o produto, então mandá-lo para um formulário de cadastro seria
 * pedir uma decisão que ele não tomou. O caminho de cadastro está nos dois
 * cards do topo, já segmentado.
 */

const PILARES = [
  {
    Icon: ShieldCheck,
    titulo: "Seus dados no Brasil, tratados conforme a LGPD",
    descricao:
      "Backup automático e controle de quem vê o quê. Dado de paciente e de cliente não é assunto para planilha em pendrive.",
  },
  {
    Icon: Smartphone,
    titulo: "Funciona no computador, tablet e celular",
    descricao:
      "Sem instalar nada. O que você registrou no balcão aparece na sala, e o que aconteceu hoje você confere de casa.",
  },
  {
    Icon: Headset,
    titulo: "Suporte humano, de quem conhece o seu ramo",
    descricao:
      "Você fala com gente que entende de ótica e de consultório, não com um robô de tíquete. Ajuda para migrar o que já existe.",
  },
] as const;

export function InstitucionalConfianca() {
  return (
    <section className="section-padding" style={{ background: "var(--lp-surface)" }}>
      <div className="container-custom">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="mx-auto max-w-4xl"
        >
          <motion.h2
            variants={fadeInUp}
            className="font-heading text-center font-extrabold"
            style={{
              fontSize: "var(--text-h2)",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              color: "var(--lp-foreground)",
            }}
          >
            O que vale para os dois
          </motion.h2>

          <motion.p
            variants={fadeInUp}
            className="mx-auto mt-4 max-w-lg text-center text-base"
            style={{ color: "var(--lp-muted)", lineHeight: 1.65 }}
          >
            Muda o que cada sistema faz. Não muda o cuidado com o seu dado, nem
            quem atende quando você precisa.
          </motion.p>

          <motion.div variants={fadeInUp} className="mt-14 grid gap-10 sm:grid-cols-3">
            {PILARES.map(({ Icon, titulo, descricao }) => (
              <div key={titulo}>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: "var(--brand-tint)" }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "var(--brand-primary)" }}
                    aria-hidden="true"
                  />
                </div>
                <h3
                  className="mt-5 font-semibold"
                  style={{ color: "var(--lp-foreground)", lineHeight: 1.35 }}
                >
                  {titulo}
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}
                >
                  {descricao}
                </p>
              </div>
            ))}
          </motion.div>

          {/* CTA: conversa, não cadastro — ver comentário no topo do arquivo. */}
          <motion.div
            variants={fadeInUp}
            className="mt-16 rounded-2xl px-8 py-12 text-center md:px-14"
            style={{
              background: "var(--brand-tint)",
              border: "1px solid var(--lp-border)",
            }}
          >
            <h3
              className="font-heading font-extrabold"
              style={{
                fontSize: "var(--text-h2)",
                lineHeight: 1.1,
                letterSpacing: "-0.025em",
                color: "var(--lp-foreground)",
              }}
            >
              Não sabe por onde começar?
            </h3>
            <p
              className="mx-auto mt-4 max-w-md text-sm"
              style={{ color: "var(--lp-muted)", lineHeight: 1.65 }}
            >
              Conte como funciona o seu atendimento hoje. A gente diz, sem
              enrolação, se o Vis resolve — e qual dos dois sistemas é o seu.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-7 text-sm font-bold text-white"
                style={{
                  minHeight: "52px",
                  background: "var(--gradient-brand-vivid)",
                  boxShadow: "0 6px 24px var(--brand-glow)",
                }}
              >
                <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                Falar no WhatsApp
              </a>
              <Link
                href="/contato"
                className="group inline-flex items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold"
                style={{
                  minHeight: "52px",
                  background: "var(--lp-surface)",
                  border: "1px solid var(--lp-border-hover)",
                  color: "var(--lp-foreground)",
                }}
              >
                Deixar meu contato
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </div>

            <p className="mt-6 text-xs" style={{ color: "var(--lp-subtle)" }}>
              Sem cartão de crédito. Sem fidelidade.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
