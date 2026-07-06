"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { formatLimitsPreview } from "@/lib/whatsapp-limits-display";

interface OverrideView {
  openHourOverride: number | null;
  closeHourOverride: number | null;
  dailyCapOverride: number | null;
  skipSaturdayOverride: boolean | null;
}

interface GlobalView {
  openHour: number;
  closeHour: number;
  dailyCap: number;
  skipSaturday: boolean;
}

/** Badge pequeno: "personalizado" (override) vs "herdando global". Só visual. */
function HerdaBadge({ overridden }: { overridden: boolean }) {
  return overridden ? (
    <span className="inline-flex items-center rounded-full bg-teal-100 text-teal-800 text-[11px] font-medium px-2 py-0.5">
      personalizado
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground text-[11px] px-2 py-0.5">
      herdando global
    </span>
  );
}

/**
 * Override das travas anti-bloqueio do WhatsApp POR ÓTICA (super admin).
 * Campo vazio = usa o global. Mostra o que é personalizado vs herdado + um
 * resumo dos valores EFETIVOS (override ?? global). Só super admin. A ótica não vê.
 */
export function CompanyWhatsappPanel({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [global, setGlobal] = useState<GlobalView | null>(null);

  // "" = usar o global (override null). String numérica = override.
  const [openHour, setOpenHour] = useState("");
  const [closeHour, setCloseHour] = useState("");
  const [dailyCap, setDailyCap] = useState("");
  const [skipSat, setSkipSat] = useState<"global" | "sim" | "nao">("global");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ovrRes, gblRes] = await Promise.all([
        fetch(`/api/admin/companies/${companyId}/whatsapp-limits`),
        fetch(`/api/admin/whatsapp-config`),
      ]);
      if (ovrRes.ok) {
        const { data } = (await ovrRes.json()) as { data: OverrideView };
        setOpenHour(data.openHourOverride != null ? String(data.openHourOverride) : "");
        setCloseHour(data.closeHourOverride != null ? String(data.closeHourOverride) : "");
        setDailyCap(data.dailyCapOverride != null ? String(data.dailyCapOverride) : "");
        setSkipSat(data.skipSaturdayOverride == null ? "global" : data.skipSaturdayOverride ? "sim" : "nao");
      }
      if (gblRes.ok) {
        const { data } = (await gblRes.json()) as { data: GlobalView };
        setGlobal(data);
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

  // Valores EFETIVOS (override ?? global) para o resumo ao vivo.
  const effOpen = numOrNull(openHour) ?? global?.openHour ?? 8;
  const effClose = numOrNull(closeHour) ?? global?.closeHour ?? 18;
  const effCap = numOrNull(dailyCap) ?? global?.dailyCap ?? 50;
  const effSkipSat = skipSat === "global" ? (global?.skipSaturday ?? false) : skipSat === "sim";
  const preview = formatLimitsPreview({ openHour: effOpen, closeHour: effClose, dailyCap: effCap, skipSaturday: effSkipSat });

  const hasAnyOverride =
    numOrNull(openHour) != null || numOrNull(closeHour) != null || numOrNull(dailyCap) != null || skipSat !== "global";

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

  function limparTudo() {
    setOpenHour("");
    setCloseHour("");
    setDailyCap("");
    setSkipSat("global");
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando travas de WhatsApp…
      </div>
    );
  }

  const inputCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div>
        <h3 className="font-semibold text-foreground">Travas de WhatsApp desta ótica</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Deixe em branco para usar o valor global. Preencher cria um override só para esta ótica.
        </p>
      </div>

      {/* Resumo dos valores EFETIVOS (o que vale de verdade para esta ótica). */}
      <div className="rounded-md bg-teal-50 border border-teal-200 px-4 py-3">
        {preview ? (
          <p className="text-sm text-teal-900"><span className="font-medium">Esta ótica usa:</span> {preview}</p>
        ) : (
          <p className="text-sm text-amber-700">Confira os valores: o fechamento deve ser maior que a abertura.</p>
        )}
        <p className="text-xs text-teal-700/80 mt-1">
          {hasAnyOverride ? "Tem ajustes próprios (override)." : "Herdando tudo do global."}
        </p>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 rounded-lg p-3"><p className="text-sm text-rose-700">{error}</p></div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3"><p className="text-sm text-emerald-700 font-medium">Override salvo.</p></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="ovr-open" className="text-sm font-medium text-foreground">Hora de abertura</label>
            <HerdaBadge overridden={numOrNull(openHour) != null} />
          </div>
          <input id="ovr-open" type="number" min="0" max="23" step="1" value={openHour}
            onChange={(e) => setOpenHour(e.target.value)} placeholder={`global: ${global?.openHour ?? 8}`} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="ovr-close" className="text-sm font-medium text-foreground">Hora de fechamento</label>
            <HerdaBadge overridden={numOrNull(closeHour) != null} />
          </div>
          <input id="ovr-close" type="number" min="1" max="24" step="1" value={closeHour}
            onChange={(e) => setCloseHour(e.target.value)} placeholder={`global: ${global?.closeHour ?? 18}`} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="ovr-cap" className="text-sm font-medium text-foreground">Teto diário</label>
            <HerdaBadge overridden={numOrNull(dailyCap) != null} />
          </div>
          <input id="ovr-cap" type="number" min="1" max="500" step="1" value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)} placeholder={`global: ${global?.dailyCap ?? 50}`} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="ovr-sat" className="text-sm font-medium text-foreground">Pular sábado</label>
            <HerdaBadge overridden={skipSat !== "global"} />
          </div>
          <select id="ovr-sat" value={skipSat}
            onChange={(e) => setSkipSat(e.target.value as "global" | "sim" | "nao")} className={inputCls}>
            <option value="global">Usar global ({global?.skipSaturday ? "pula sábado" : "sábado útil"})</option>
            <option value="sim">Sim (pular sábado)</option>
            <option value="nao">Não (sábado é dia útil)</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={limparTudo} disabled={!hasAnyOverride || saving}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground cursor-pointer transition-colors">
          Limpar overrides (voltar ao global)
        </button>
        <button type="submit" disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Salvando…" : "Salvar override"}
        </button>
      </div>
    </form>
  );
}
