"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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

  const text = label !== undefined ? label : deriveLabel(invoiceSent, invoiceSentAt);

  async function run() {
    if (sentToday) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/resend-charge`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.alreadySentToday) toast.success("Já reenviada hoje");
        else if (data.status === "SENT") toast.success("Enviado.");
        else toast.success(`Status: ${data.status ?? "—"}`);
        router.refresh();
      } else {
        toast.error(data.error || "Erro");
      }
    } catch { toast.error("Erro"); } finally { setLoading(false); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={loading || sentToday} className="text-xs text-primary hover:text-primary/80 underline disabled:opacity-50">
        {sentToday ? "Já enviada hoje" : loading ? "Reenviando…" : text}
      </button>
    </span>
  );
}
