"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

interface WhatsappLimitsView {
  openHour: number;
  closeHour: number;
  dailyCap: number;
  skipSaturday: boolean;
}

/**
 * Tela GLOBAL das travas anti-bloqueio do WhatsApp (super admin).
 * Defaults = Fase 1 (8-18h, 50/dia, sábado útil). O ritmo (intervalo entre
 * mensagens) NÃO é editável aqui — mora no cron-job.org (link abaixo).
 */
export function WhatsappLimitsClient({ config }: { config: WhatsappLimitsView }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [openHour, setOpenHour] = useState(String(config.openHour));
  const [closeHour, setCloseHour] = useState(String(config.closeHour));
  const [dailyCap, setDailyCap] = useState(String(config.dailyCap));
  const [skipSaturday, setSkipSaturday] = useState(config.skipSaturday);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const o = parseInt(openHour, 10);
    const c = parseInt(closeHour, 10);
    const d = parseInt(dailyCap, 10);

    // Validação client-side (o servidor revalida + rejeita com 400).
    if (isNaN(o) || o < 0 || o > 23) return setError("Hora de abertura deve estar entre 0 e 23.");
    if (isNaN(c) || c < 1 || c > 24) return setError("Hora de fechamento deve estar entre 1 e 24.");
    if (c <= o) return setError("A hora de fechamento deve ser maior que a de abertura.");
    if (isNaN(d) || d < 1 || d > 500) return setError("Teto diário deve estar entre 1 e 500.");

    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/whatsapp-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openHour: o, closeHour: c, dailyCap: d, skipSaturday }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Erro ao salvar.");
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Erro de rede ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <p className="text-sm text-emerald-700 font-medium">Limites salvos com sucesso.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-muted border border-border rounded-lg p-5 space-y-4">
        <div>
          <p className="font-semibold text-foreground">Limites de envio (anti-bloqueio)</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Valor padrão para todas as óticas. Você pode sobrescrever por ótica no detalhe de cada uma.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="wa-open" className="text-sm font-medium text-foreground">Hora de abertura</label>
            <input id="wa-open" type="number" min="0" max="23" step="1" value={openHour}
              onChange={(e) => setOpenHour(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className="text-xs text-muted-foreground">Hora (0-23). Padrão: 8.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="wa-close" className="text-sm font-medium text-foreground">Hora de fechamento</label>
            <input id="wa-close" type="number" min="1" max="24" step="1" value={closeHour}
              onChange={(e) => setCloseHour(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className="text-xs text-muted-foreground">Exclusivo: 18 = envia até 17:59. Padrão: 18.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="wa-cap" className="text-sm font-medium text-foreground">Teto diário (msgs/ótica/dia)</label>
            <input id="wa-cap" type="number" min="1" max="500" step="1" value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className="text-xs text-muted-foreground">1-500. Padrão: 50.</p>
          </div>
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={skipSaturday}
                onChange={(e) => setSkipSaturday(e.target.checked)}
                className="h-4 w-4 rounded border-input" />
              <span className="text-sm font-medium text-foreground">Pular sábado</span>
            </label>
            <p className="text-xs text-muted-foreground">Domingo e feriados fixos já são sempre pulados.</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="px-5 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {saving ? "Salvando…" : "Salvar limites"}
          </button>
        </div>
      </form>

      {/* Ritmo: fora do app (cron-job.org) */}
      <div className="bg-muted border border-border rounded-lg p-5 space-y-2">
        <p className="font-semibold text-foreground">Ritmo de envio (intervalo entre mensagens)</p>
        <p className="text-sm text-muted-foreground">
          O ritmo é controlado no cron-job.org, fora do sistema. Recomendado: ~1 mensagem a cada 3-5 minutos.
        </p>
        <a href="https://console.cron-job.org" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          Ajustar ritmo de envio <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
