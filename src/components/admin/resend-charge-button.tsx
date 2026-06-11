"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface ResendChargeButtonProps {
  invoiceId: string;
  invoiceSent?: boolean;
  invoiceSentAt?: string | null;
  sentToday?: boolean;
  label?: string;
}

function formatDayMonth(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function deriveLabel(invoiceSent?: boolean, invoiceSentAt?: string | null): string {
  if (!invoiceSent) return "Enviar cobrança";
  const dm = invoiceSentAt ? formatDayMonth(invoiceSentAt) : null;
  return dm ? `Reenviar (enviada ${dm})` : "Reenviar";
}

export function ResendChargeButton({ invoiceId, invoiceSent, invoiceSentAt, sentToday, label }: ResendChargeButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const text = label !== undefined ? label : deriveLabel(invoiceSent, invoiceSentAt);

  async function run() {
    if (sentToday) return;
    setLoading(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/resend-charge`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.alreadySentToday) setMsg("Já reenviada hoje");
        else if (data.status === "SENT") setMsg("Enviado.");
        else setMsg(`Status: ${data.status ?? "—"}`);
        router.refresh();
      } else {
        setMsg(data.error || "Erro");
      }
    } catch { setMsg("Erro"); } finally { setLoading(false); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={loading || sentToday} className="text-xs text-indigo-400 hover:text-indigo-300 underline disabled:opacity-50">
        {sentToday ? "Já enviada hoje" : loading ? "Reenviando…" : text}
      </button>
      {msg && <span className="text-xs text-gray-400">{msg}</span>}
    </span>
  );
}
