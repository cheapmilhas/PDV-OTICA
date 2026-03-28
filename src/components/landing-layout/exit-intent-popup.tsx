"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useExitIntent } from "@/hooks/use-exit-intent";
import { REGISTER_URL, WHATSAPP_URL } from "@/lib/constants";
import Link from "next/link";

export function ExitIntentPopup() {
  const { show, dismiss } = useExitIntent();
  const [submitted] = useState(false);

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
                  <span className="text-2xl">👓</span>
                </div>
                <h3 className="font-heading text-xl font-bold text-foreground mb-2">
                  Espera! Não saia sem testar.
                </h3>
                <p className="text-sm text-muted mb-6">
                  7 dias grátis, sem cartão, sem compromisso. Sua ótica no controle em minutos.
                </p>

                {!submitted ? (
                  <div className="space-y-3">
                    <Button size="lg" className="w-full" asChild>
                      <Link href={REGISTER_URL}>
                        Quero testar grátis agora
                      </Link>
                    </Button>
                    <Button variant="secondary" size="default" className="w-full" asChild>
                      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                        Falar com consultor
                      </a>
                    </Button>
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
