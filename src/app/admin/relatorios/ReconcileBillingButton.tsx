"use client";

import { RefreshCw, Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * Botão "Reconciliar cobrança" — dispara POST /api/admin/billing/reconcile sob
 * demanda. Reconcilia subscriptions com billingSyncPending contra o Asaas.
 */
export function ReconcileBillingButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleReconcile() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/billing/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao reconciliar");
      setMsg(
        `${data.processed} verificada(s) · ${data.cleared} resolvida(s) · ${data.kept} divergente(s)` +
          (data.errors ? ` · ${data.errors} erro(s)` : "")
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao reconciliar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleReconcile}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-800 bg-indigo-900/20 text-indigo-300 hover:bg-indigo-900/40 transition-colors text-xs font-medium disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        {loading ? "Reconciliando…" : "Reconciliar cobrança"}
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
