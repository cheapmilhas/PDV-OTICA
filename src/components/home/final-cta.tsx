"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { REGISTER_URL, WHATSAPP_URL } from "@/lib/constants";
import { fadeInUp, staggerContainer, viewportConfig } from "@/lib/animations";

export function FinalCta() {
  return (
    <section className="section-padding" style={{ background: "var(--lp-background)" }}>
      <div className="container-custom">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={viewportConfig}
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.18)",
          }}
        >
          {/* Subtle radial light — not a loud gradient */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 80% at 50% 0%, rgba(99,102,241,0.10) 0%, transparent 70%)",
            }}
          />
          {/* Noise texture */}
          <div
            className="absolute inset-0 pointer-events-none opacity-25"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`,
              backgroundRepeat: "repeat",
              backgroundSize: "200px 200px",
            }}
          />

          <div className="relative z-10 px-8 py-16 md:px-16 text-center">
            <motion.p
              variants={fadeInUp}
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
            >
              Comece hoje mesmo
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              className="font-heading font-extrabold tracking-tight mb-4"
              style={{
                fontSize: "var(--text-h1)",
                lineHeight: 1.08,
                letterSpacing: "-0.025em",
                color: "var(--lp-foreground)",
              }}
            >
              Pronto para transformar
              <br />
              <span style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}>
                a gestão da sua ótica?
              </span>
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="text-base mb-10 max-w-md mx-auto"
              style={{ color: "var(--lp-muted)", lineHeight: 1.65 }}
            >
              Comece grátis. Sem cartão. Sem compromisso.
              <br />
              14 dias para testar tudo.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-3 justify-center"
            >
              <motion.div
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <Link
                  href={REGISTER_URL}
                  className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white group"
                  style={{
                    background: "linear-gradient(135deg, #6366F1 0%, #7C3AED 100%)",
                    boxShadow: "0 4px 24px rgba(99,102,241,0.35)",
                    minHeight: "52px",
                  }}
                >
                  Testar Grátis por 14 dias
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold transition-colors cursor-pointer"
                  style={{
                    minHeight: "52px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "var(--lp-foreground)",
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  Falar com consultor
                </a>
              </motion.div>
            </motion.div>

            <motion.p
              variants={fadeInUp}
              className="text-xs mt-6"
              style={{ color: "var(--lp-subtle)" }}
            >
              Mais de 500 óticas já usam o PDV Ótica
            </motion.p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
