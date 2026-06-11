"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResendChargeButton({ invoiceId, label = "Reenviar boleto/PIX" }: { invoiceId: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setLoading(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/resend-charge`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? (data.status === "SENT" ? "Reenviado." : `Status: ${data.status ?? "—"}`) : (data.error || "Erro"));
      if (res.ok) router.refresh();
    } catch { setMsg("Erro"); } finally { setLoading(false); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={loading} className="text-xs text-indigo-400 hover:text-indigo-300 underline disabled:opacity-50">
        {loading ? "Reenviando…" : label}
      </button>
      {msg && <span className="text-xs text-gray-400">{msg}</span>}
    </span>
  );
}
