"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncInvoicesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/invoice-reminders/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg((data as { error?: string }).error || "Erro ao sincronizar"); return; }
      if (data.skipped === "generation_disabled") {
        setMsg("Geração desligada — ligue a flag de geração primeiro.");
      } else {
        setMsg(`Processado: ${data.invoicesCreated ?? 0} faturas, ${(data.invoiceCreatedEmails ?? 0) + (data.dueSoonEmails ?? 0)} emails.`);
      }
      router.refresh();
    } catch {
      setMsg("Erro ao sincronizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={run} disabled={loading}
        className="px-4 py-2 rounded-md font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white">
        {loading ? "Sincronizando…" : "Sincronizar cobranças agora"}
      </button>
      {msg && <p className="text-sm text-gray-300">{msg}</p>}
    </div>
  );
}
