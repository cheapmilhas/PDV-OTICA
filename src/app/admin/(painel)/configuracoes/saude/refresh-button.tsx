"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Botão de atualização SOB DEMANDA da Saúde do Sistema. Zero-polling por design:
 * o snapshot só é remontado quando o operador clica (router.refresh re-renderiza
 * o server component). Nada de setInterval — um ping periódico no banco quebraria
 * o scale-to-zero do Neon.
 */
export function RefreshHealthButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function handleRefresh() {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
      // Deixa o spin visível ao menos um instante mesmo em refresh instantâneo.
      setTimeout(() => setSpinning(false), 600);
    });
  }

  const busy = pending || spinning;

  return (
    <button
      onClick={handleRefresh}
      disabled={busy}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-medium disabled:opacity-60"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Atualizando…" : "Atualizar agora"}
    </button>
  );
}
