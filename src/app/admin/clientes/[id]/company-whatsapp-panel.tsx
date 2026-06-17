"use client";

import { useState, useEffect, useCallback } from "react";

interface OverrideView {
  openHourOverride: number | null;
  closeHourOverride: number | null;
  dailyCapOverride: number | null;
  skipSaturdayOverride: boolean | null;
}

/**
 * Override das travas anti-bloqueio do WhatsApp POR ÓTICA (super admin).
 * Campo vazio = usa o global. Só super admin (dentro do /admin). A ótica não vê.
 */
export function CompanyWhatsappPanel({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // "" = usar o global (override null). String numérica = override.
  const [openHour, setOpenHour] = useState("");
  const [closeHour, setCloseHour] = useState("");
  const [dailyCap, setDailyCap] = useState("");
  // skipSaturday: "global" | "sim" | "nao"
  const [skipSat, setSkipSat] = useState<"global" | "sim" | "nao">("global");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/whatsapp-limits`);
      if (res.ok) {
        const { data } = (await res.json()) as { data: OverrideView };
        setOpenHour(data.openHourOverride != null ? String(data.openHourOverride) : "");
        setCloseHour(data.closeHourOverride != null ? String(data.closeHourOverride) : "");
        setDailyCap(data.dailyCapOverride != null ? String(data.dailyCapOverride) : "");
        setSkipSat(data.skipSaturdayOverride == null ? "global" : data.skipSaturdayOverride ? "sim" : "nao");
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  function numOrNull(s: string): number | null {
    const t = s.trim();
    if (t === "") return null;
    const n = parseInt(t, 10);
    return isNaN(n) ? null : n;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const body = {
      openHourOverride: numOrNull(openHour),
      closeHourOverride: numOrNull(closeHour),
      dailyCapOverride: numOrNull(dailyCap),
      skipSaturdayOverride: skipSat === "global" ? null : skipSat === "sim",
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/whatsapp-limits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error || "Erro ao salvar override.");
        return;
      }
      setSuccess(true);
      load();
    } catch {
      setError("Erro de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando travas de WhatsApp…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="bg-muted border border-border rounded-lg p-5 space-y-4 max-w-2xl">
      <div>
        <p className="font-semibold text-foreground">Travas de WhatsApp desta ótica</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Deixe em branco para usar o valor global. Preencher cria um override só para esta ótica.
        </p>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 rounded-lg p-3"><p className="text-sm text-rose-700">{error}</p></div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3"><p className="text-sm text-emerald-700 font-medium">Override salvo.</p></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="ovr-open" className="text-sm font-medium text-foreground">Hora de abertura</label>
          <input id="ovr-open" type="number" min="0" max="23" step="1" value={openHour}
            onChange={(e) => setOpenHour(e.target.value)} placeholder="usar global"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ovr-close" className="text-sm font-medium text-foreground">Hora de fechamento</label>
          <input id="ovr-close" type="number" min="1" max="24" step="1" value={closeHour}
            onChange={(e) => setCloseHour(e.target.value)} placeholder="usar global"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ovr-cap" className="text-sm font-medium text-foreground">Teto diário</label>
          <input id="ovr-cap" type="number" min="1" max="500" step="1" value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)} placeholder="usar global"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ovr-sat" className="text-sm font-medium text-foreground">Pular sábado</label>
          <select id="ovr-sat" value={skipSat}
            onChange={(e) => setSkipSat(e.target.value as "global" | "sim" | "nao")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="global">Usar global</option>
            <option value="sim">Sim (pular sábado)</option>
            <option value="nao">Não (sábado é dia útil)</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {saving ? "Salvando…" : "Salvar override"}
        </button>
      </div>
    </form>
  );
}
