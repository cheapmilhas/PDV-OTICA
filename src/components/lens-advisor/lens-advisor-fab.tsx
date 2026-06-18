"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Glasses, X } from "lucide-react";
import { useLensAdvisor } from "./use-lens-advisor";
import { LensAdvisorForm } from "./lens-advisor-form";
import { isExpired } from "@/lib/lens-widget-expiry";

/**
 * Bolinha (FAB) flutuante + balão do Assistente de Lentes. Montado UMA vez no
 * layout do dashboard. O hook useLensAdvisor vive AQUI (fonte única do estado da
 * receita) — assim sobrevive enquanto o widget estiver montado e expõe
 * lastEditedAt/reset para a expiração de 10 min.
 */
export function LensAdvisorFab() {
  const advisor = useLensAdvisor(); // hook vive AQUI (persiste enquanto montado)
  const [open, setOpen] = useState(false);
  const balloonRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Abrir: se os dados expiraram (>10min desde a última edição), zera antes de mostrar.
  const handleOpen = useCallback(() => {
    if (isExpired(advisor.lastEditedAt, Date.now())) advisor.reset();
    setOpen(true);
  }, [advisor]);

  // Esc + click-outside SÓ enquanto aberto; cleanup no fim.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      // dentro do balão/bolinha → não fecha
      if (balloonRef.current?.contains(t) || fabRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    // mousedown evita corrida com o onClick da bolinha; fabRef garante que clicar
    // na própria bolinha não dispare o fechamento por "fora".
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          ref={balloonRef}
          role="dialog"
          aria-label="Assistente de Lentes"
          className="fixed bottom-20 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-xl border bg-background p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Glasses className="h-4 w-4" aria-hidden="true" />
              Assistente de Lentes
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <LensAdvisorForm advisor={advisor} />
        </div>
      )}

      <button
        ref={fabRef}
        type="button"
        aria-label="Assistente de Lentes"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
      >
        <Glasses className="h-6 w-6" aria-hidden="true" />
      </button>
    </>
  );
}
