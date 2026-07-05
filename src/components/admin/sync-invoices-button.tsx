"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function SyncInvoicesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invoice-reminders/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error((data as { error?: string }).error || "Erro ao sincronizar"); return; }
      if (data.skipped === "generation_disabled") {
        toast.warning("Geração desligada — ligue a flag de geração primeiro.");
      } else {
        toast.success(`Processado: ${data.invoicesCreated ?? 0} faturas, ${(data.invoiceCreatedEmails ?? 0) + (data.dueSoonEmails ?? 0)} emails.`);
        router.refresh();
      }
    } catch {
      toast.error("Erro ao sincronizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={run} disabled={loading}
      className="px-4 py-2 rounded-md font-semibold text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground">
      {loading ? "Sincronizando…" : "Sincronizar cobranças agora"}
    </button>
  );
}
