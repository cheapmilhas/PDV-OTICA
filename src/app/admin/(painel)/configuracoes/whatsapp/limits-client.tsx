"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Clock, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { formatLimitsPreview } from "@/lib/whatsapp-limits-display";

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

  // Preview ao vivo do efeito das travas (atualiza enquanto edita).
  const preview = formatLimitsPreview({
    openHour: parseInt(openHour, 10),
    closeHour: parseInt(closeHour, 10),
    dailyCap: parseInt(dailyCap, 10),
    skipSaturday,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const o = parseInt(openHour, 10);
    const c = parseInt(closeHour, 10);
    const d = parseInt(dailyCap, 10);

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

  const inputCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="max-w-2xl space-y-6">
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h3 className="font-semibold text-foreground">Limites de envio (anti-bloqueio)</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Valor padrão para todas as óticas. Você pode sobrescrever por ótica no detalhe de cada uma.
          </p>
        </div>

        {/* Preview ao vivo do efeito */}
        <div className="rounded-md bg-teal-50 border border-teal-200 px-4 py-3">
          {preview ? (
            <p className="text-sm text-teal-900">
              <span className="font-medium">Resultado:</span> {preview}
            </p>
          ) : (
            <p className="text-sm text-amber-700">Confira os valores: o fechamento deve ser maior que a abertura.</p>
          )}
          <p className="text-xs text-teal-700/80 mt-1">Domingo e feriados nacionais fixos são sempre pulados.</p>
        </div>

        {/* Seção: janela de horário (abertura → fechamento como um intervalo) */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Janela de horário</p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="wa-open" className="text-xs text-muted-foreground">Abertura</label>
              <input id="wa-open" type="number" min="0" max="23" step="1" value={openHour}
                onChange={(e) => setOpenHour(e.target.value)} className={inputCls} />
            </div>
            <span className="pb-2 text-muted-foreground">até</span>
            <div className="flex-1 space-y-1.5">
              <label htmlFor="wa-close" className="text-xs text-muted-foreground">Fechamento</label>
              <input id="wa-close" type="number" min="1" max="24" step="1" value={closeHour}
                onChange={(e) => setCloseHour(e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Horas em ponto (0-24). Fechamento exclusivo: 18 = envia até 17:59.</p>
        </div>

        {/* Seção: teto diário */}
        <div className="space-y-1.5">
          <label htmlFor="wa-cap" className="text-sm font-medium text-foreground">Teto diário</label>
          <input id="wa-cap" type="number" min="1" max="500" step="1" value={dailyCap}
            onChange={(e) => setDailyCap(e.target.value)} className={`${inputCls} max-w-[12rem]`} />
          <p className="text-xs text-muted-foreground">Máximo de mensagens por ótica por dia (1-500).</p>
        </div>

        {/* Seção: pular sábado (Switch) */}
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium text-foreground">Pular sábado</p>
            <p className="text-xs text-muted-foreground">Quando ligado, não envia aos sábados.</p>
          </div>
          <Switch checked={skipSaturday} onCheckedChange={setSkipSaturday} aria-label="Pular sábado" />
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Salvando…" : "Salvar limites"}
          </button>
        </div>
      </form>

      {/* Ritmo: fora do app (cron-job.org). Callout informativo — borda completa, sem faixa lateral. */}
      <div className="rounded-lg border border-border bg-muted/50 p-5">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Ritmo de envio (intervalo entre mensagens)</p>
            <p className="text-sm text-muted-foreground">
              O ritmo é controlado no cron-job.org, fora do sistema. Recomendado: ~1 mensagem a cada 3 a 5 minutos.
            </p>
            <a href="https://console.cron-job.org" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline cursor-pointer">
              Ajustar ritmo de envio <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
