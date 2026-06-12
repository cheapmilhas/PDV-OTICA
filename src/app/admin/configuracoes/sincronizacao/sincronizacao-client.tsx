"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";

interface Config {
  isEnabled: boolean;
  dryRun: boolean;
  lastRunAt: string | null;
  lastRunSummary: Record<string, unknown> | null;
}
interface AuditRow {
  id: string;
  companyName: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export function SincronizacaoClient({ config, audits }: { config: Config; audits: AuditRow[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function patch(body: { isEnabled?: boolean; dryRun?: boolean }) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auto-sync/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao salvar");
        return;
      }
      router.refresh();
    } catch {
      setError("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const s = config.lastRunSummary;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Sincronização Automática"
        subtitle="Re-aplica o padrão atual do sistema (plano de contas, contas financeiras, templates e mensagens padrão) a todas as empresas, toda madrugada (4h). Aditivo: nunca apaga dados, não mexe em saldos e nunca sobrescreve textos personalizados pelas óticas."
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="bg-muted border border-border rounded-lg p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-foreground">
            Status: {config.isEnabled ? "🟢 Ligada" : "⚪ Desligada"}
          </p>
          <p className="text-sm text-muted-foreground">
            {config.isEnabled ? "Roda toda madrugada às 4h." : "Nada acontece até você ligar."}
          </p>
        </div>
        <button
          onClick={() => patch({ isEnabled: !config.isEnabled })}
          disabled={saving}
          className={`px-4 py-2 rounded-md font-semibold text-sm disabled:opacity-50 ${
            config.isEnabled
              ? "bg-rose-600 hover:bg-rose-700 text-white"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {config.isEnabled ? "Desligar" : "Ligar"}
        </button>
      </div>

      <div className="bg-muted border border-border rounded-lg p-5">
        <p className="font-semibold text-foreground mb-2">Modo</p>
        <div className="flex gap-3">
          <button
            onClick={() => patch({ dryRun: true })}
            disabled={saving || config.dryRun}
            className={`px-4 py-2 rounded-md text-sm ${
              config.dryRun
                ? "bg-blue-600 text-white"
                : "bg-background text-foreground hover:bg-muted"
            }`}
          >
            🔍 Simulação (só relatório)
          </button>
          <button
            onClick={() => {
              if (confirm("Aplicar DE VERDADE nas empresas a partir da próxima execução?")) {
                patch({ dryRun: false });
              }
            }}
            disabled={saving || !config.dryRun}
            className={`px-4 py-2 rounded-md text-sm ${
              !config.dryRun
                ? "bg-blue-600 text-white"
                : "bg-background text-foreground hover:bg-muted"
            }`}
          >
            ✅ Aplicar de verdade
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Em Simulação, a execução só gera o relatório do que MUDARIA — não grava nada nas empresas.
        </p>
      </div>

      <div className="bg-muted border border-border rounded-lg p-5">
        <p className="font-semibold text-foreground mb-2">Última execução</p>
        {config.lastRunAt ? (
          <div className="text-sm text-foreground space-y-1">
            <p>
              {new Date(config.lastRunAt).toLocaleString("pt-BR")} {s?.dryRun ? "(simulação)" : ""}
            </p>
            {s && (
              <p>
                ✅ {String(s.changed ?? 0)} com mudança · ⏭️ {String(s.unchanged ?? 0)} sem mudança
                · ❌ {String(s.errors ?? 0)} erro(s) · total {String(s.total ?? 0)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não rodou.</p>
        )}
      </div>

      <div className="bg-muted border border-border rounded-lg p-5">
        <p className="font-semibold text-foreground mb-3">O que mudou por empresa (últimos 50)</p>
        {audits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {audits.map((a) => {
              const created = (a.metadata?.created ?? {}) as Record<string, number>;
              const messages = (a.metadata?.messages ?? {}) as {
                filled?: string[];
                updated?: string[];
              };
              const isDry = Boolean(a.metadata?.dryRun);
              const parts: string[] = [];
              if (created.chartOfAccounts) parts.push(`+${created.chartOfAccounts} plano de contas`);
              if (created.financeAccounts)
                parts.push(`+${created.financeAccounts} contas financeiras`);
              if (created.reconciliationTemplates)
                parts.push(`+${created.reconciliationTemplates} templates`);
              if (messages.filled?.length)
                parts.push(`${messages.filled.length} mensagem(ns) preenchida(s)`);
              if (messages.updated?.length)
                parts.push(`${messages.updated.length} mensagem(ns) atualizada(s)`);
              return (
                <li key={a.id} className="border-b border-border pb-2">
                  <span className="text-foreground">{a.companyName}</span>{" "}
                  <span className="text-muted-foreground">
                    — {parts.join(" · ") || "mudança registrada"}
                  </span>{" "}
                  {isDry && <span className="text-blue-600">[simulação]</span>}
                  <span className="text-muted-foreground ml-2">
                    {new Date(a.createdAt).toLocaleString("pt-BR")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
