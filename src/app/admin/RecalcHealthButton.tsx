"use client";

import { Activity, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Botão "Recalcular saúde" do dashboard admin (Fase A — admin visão geral+saúde).
 * Dá a PORTA de entrada para o backend que já existia (POST /api/admin/health-score)
 * mas não tinha UI. Recalcula TODAS as empresas ativas e atualiza a tela.
 */
export function RecalcHealthButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleRecalc() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/health-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // sem companyId = todas as empresas ativas
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao recalcular");
      setMsg(data.message || "Saúde recalculada");
      router.refresh(); // re-renderiza o server component com os novos números
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao recalcular");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRecalc}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-800 bg-indigo-900/20 text-indigo-300 hover:bg-indigo-900/40 transition-colors text-xs font-medium disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
        {loading ? "Recalculando…" : "Recalcular saúde"}
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
