"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Recalcula a saúde de UMA empresa (Fase C). Usa POST /api/admin/health-score
 * com companyId — porta de entrada por linha da tabela de saúde.
 */
export function RecalcOneButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handle() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/admin/health-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Falha");
      }
      router.refresh();
    } catch {
      setFailed(true); // sinaliza falha na própria linha (botão fica vermelho)
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      title={failed ? "Falhou — clique para tentar de novo" : "Recalcular saúde desta empresa"}
      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
        failed
          ? "text-red-400 hover:text-red-300 hover:bg-red-900/20"
          : "text-gray-500 hover:text-indigo-300 hover:bg-indigo-900/20"
      }`}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
    </button>
  );
}
