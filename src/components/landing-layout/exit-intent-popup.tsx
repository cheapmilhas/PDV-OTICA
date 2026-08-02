"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useExitIntent } from "@/hooks/use-exit-intent";
import { REGISTER_URL, WHATSAPP_ENABLED, WHATSAPP_URL } from "@/lib/constants";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Este popup aparece em TODAS as páginas do site, /medical inclusive. Fixo em
 * copy ótica, ele dizia ao médico: ícone de óculos, "sua ótica no controle",
 * "7 dias grátis" (o Medical dá 14) e um botão para o cadastro ÓTICO. Ou seja,
 * a última coisa que a clínica via antes de sair era a oferta errada.
 */
const OFERTA = {
  otica: {
    emoji: "👓",
    titulo: "Espera! Não saia sem testar.",
    // 14, não 7: `prisma/seed-plans.ts` dá trialDays 14 a TODOS os planos, e o
    // resto do site já dizia 14. O visitante via dois prazos na mesma sessão.
    texto: "14 dias grátis, sem cartão, sem compromisso. Sua ótica no controle em minutos.",
    href: REGISTER_URL,
  },
  medical: {
    emoji: "🩺",
    titulo: "Espera! Não saia sem testar.",
    texto: "14 dias grátis, sem cartão, sem compromisso. Sua clínica organizada em minutos.",
    href: "/registro-medical",
  },
  // Rotas institucionais (home, /precos, /contato, /blog) servem os DOIS
  // públicos: assumir ótica ali mandava o visitante de clínica para o cadastro
  // errado. Aqui a escolha do produto fica com ele.
  neutra: {
    emoji: "✨",
    titulo: "Espera! Não saia sem testar.",
    texto: "14 dias grátis, sem cartão, sem compromisso. Escolha o sistema da sua operação.",
    href: "/precos",
  },
} as const;

/** Rotas que pertencem inequivocamente ao produto ótico. */
const ROTAS_OTICA = ["/oticas", "/funcionalidades", "/vis-vs-planilha"];

export function ExitIntentPopup() {
  const { show, dismiss } = useExitIntent();
  const [submitted] = useState(false);

  const pathname = usePathname() ?? "";
  const emMedical = pathname === "/medical" || pathname.startsWith("/medical/");
  const emOtica = ROTAS_OTICA.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const oferta = emMedical ? OFERTA.medical : emOtica ? OFERTA.otica : OFERTA.neutra;

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed z-[101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md"
          >
            <div className="relative mx-4 rounded-2xl border border-[var(--border-hover)] bg-[var(--surface)] p-8 shadow-glow-lg">
              <button
                onClick={dismiss}
                className="absolute right-4 top-4 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="text-center">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/10">
                  <span className="text-2xl">{oferta.emoji}</span>
                </div>
                <h3 className="font-heading text-xl font-bold text-foreground mb-2">
                  {oferta.titulo}
                </h3>
                <p className="text-sm text-muted mb-6">{oferta.texto}</p>

                {!submitted ? (
                  <div className="space-y-3">
                    <Button size="lg" className="w-full" asChild>
                      <Link href={oferta.href}>
                        Quero testar grátis agora
                      </Link>
                    </Button>
                    {WHATSAPP_ENABLED && (
                      <Button variant="secondary" size="default" className="w-full" asChild>
                        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                          Falar com consultor
                        </a>
                      </Button>
                    )}
                    <button
                      onClick={dismiss}
                      className="text-xs text-subtle hover:text-muted transition-colors"
                    >
                      Não, obrigado
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-brand-success font-medium">
                    ✓ Ótimo! Redirecionando para o cadastro...
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
