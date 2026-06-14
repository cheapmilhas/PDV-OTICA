"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";

interface EmailConfig {
  masterEnabled: boolean;
  testMode: boolean;
  testEmail: string | null;
  welcomeEnabled: boolean;
  trialEndingEnabled: boolean;
  trialExpiredEnabled: boolean;
  invoiceOverdueEnabled: boolean;
  paymentConfirmedEnabled: boolean;
  subscriptionSuspendedEnabled: boolean;
  subscriptionCanceledEnabled: boolean;
}

interface LogRow {
  id: string;
  companyName: string;
  eventType: string;
  status: string;
  to: string;
  createdAt: string;
}

const EMAIL_TYPES = [
  { key: "WELCOME",               label: "Boas-vindas",           flag: "welcomeEnabled" as const },
  { key: "TRIAL_ENDING",          label: "Trial acabando",         flag: "trialEndingEnabled" as const },
  { key: "TRIAL_EXPIRED",         label: "Trial expirou",          flag: "trialExpiredEnabled" as const },
  { key: "INVOICE_OVERDUE",       label: "Fatura vencida",         flag: "invoiceOverdueEnabled" as const },
  { key: "PAYMENT_CONFIRMED",     label: "Pagamento confirmado",   flag: "paymentConfirmedEnabled" as const },
  { key: "SUBSCRIPTION_SUSPENDED",label: "Assinatura suspensa",    flag: "subscriptionSuspendedEnabled" as const },
  { key: "SUBSCRIPTION_CANCELED", label: "Assinatura cancelada",   flag: "subscriptionCanceledEnabled" as const },
] as const;

type FlagKey = typeof EMAIL_TYPES[number]["flag"];

// Tipos gerados pelo fluxo de cobrança Asaas — aparecem nos logs mas não têm
// toggle de configuração aqui (são controlados pelo fluxo de cobrança).
const LOG_ONLY_LABELS: Record<string, string> = {
  INVOICE_CREATED: "Fatura criada",
  INVOICE_DUE_SOON: "Fatura a vencer",
};

const LABEL_BY_TYPE: Record<string, string> = {
  ...Object.fromEntries(EMAIL_TYPES.map(({ key, label }) => [key, label])),
  ...LOG_ONLY_LABELS,
};

function statusBadge(status: string) {
  switch (status) {
    case "SENT":
      return (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
          Enviado
        </span>
      );
    case "SKIPPED":
      return (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-muted text-muted-foreground">
          Ignorado
        </span>
      );
    case "FAILED":
      return (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700">
          Falhou
        </span>
      );
    case "PENDING":
    default:
      return (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">
          Pendente
        </span>
      );
  }
}

export function EmailsClient({
  config,
  logs,
}: {
  config: EmailConfig;
  logs: LogRow[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testEmailValue, setTestEmailValue] = useState(config.testEmail ?? "");

  async function patch(body: Partial<EmailConfig> & { testEmail?: string | null }) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/saas-emails/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Erro ao salvar");
        return;
      }
      router.refresh();
    } catch {
      setError("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Emails Automáticos"
        subtitle="Controle os emails transacionais enviados aos clientes do SaaS: boas-vindas, trial, cobranças, suspensão e cancelamento."
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* Modo teste — banner de aviso quando ligado */}
      {config.testMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-amber-700">
            ⚠️ Modo teste ligado — os emails vão só para{" "}
            <span className="font-mono">{config.testEmail || "(sem endereço definido)"}</span>
            , não para os clientes.
          </p>
          <p className="text-xs text-amber-600 mt-1">
            Desative o modo teste abaixo quando estiver pronto para enviar aos clientes reais.
          </p>
        </div>
      )}

      {/* Interruptor mestre */}
      <div className="bg-muted border border-border rounded-lg p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-foreground">
            Status: {config.masterEnabled ? "🟢 Emails ativados" : "⚪ Emails desativados"}
          </p>
          <p className="text-sm text-muted-foreground">
            {config.masterEnabled
              ? "Envios ocorrem conforme os gatilhos abaixo."
              : "Nenhum email é disparado enquanto desligado."}
          </p>
        </div>
        <button
          onClick={() => patch({ masterEnabled: !config.masterEnabled })}
          disabled={saving}
          className={`px-4 py-2 rounded-md font-semibold text-sm disabled:opacity-50 ${
            config.masterEnabled
              ? "bg-rose-600 hover:bg-rose-700 text-white"
              : "bg-emerald-600 hover:bg-emerald-700 text-white"
          }`}
        >
          {config.masterEnabled ? "Desligar" : "Ligar"}
        </button>
      </div>

      {/* Modo teste + testEmail */}
      <div className="bg-muted border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">Modo teste</p>
            <p className="text-sm text-muted-foreground">
              Quando ligado, todos os emails vão para o endereço de teste abaixo.
            </p>
          </div>
          <button
            onClick={() => {
              if (!config.testMode) {
                patch({ testMode: true });
              } else if (
                confirm(
                  "Desligar modo teste fará os emails irem para os clientes reais. Confirmar?"
                )
              ) {
                patch({ testMode: false });
              }
            }}
            disabled={saving}
            className={`px-4 py-2 rounded-md font-semibold text-sm disabled:opacity-50 ${
              config.testMode
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-background hover:bg-muted text-foreground"
            }`}
          >
            {config.testMode ? "🔍 Teste ligado" : "Ligar teste"}
          </button>
        </div>
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Endereço de teste</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmailValue}
              onChange={(e) => setTestEmailValue(e.target.value)}
              placeholder="admin@exemplo.com"
              className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
            />
            <button
              onClick={() => patch({ testEmail: testEmailValue || null })}
              disabled={saving || testEmailValue === (config.testEmail ?? "")}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-md text-sm font-semibold"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>

      {/* Toggles por tipo */}
      <div className="bg-muted border border-border rounded-lg p-5">
        <p className="font-semibold text-foreground mb-4">Tipos de email</p>
        <div className="space-y-3">
          {EMAIL_TYPES.map(({ key, label, flag }) => {
            const enabled = config[flag as FlagKey] as boolean;
            return (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => patch({ [flag]: !enabled })}
                    disabled={saving}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 focus:outline-none ${
                      enabled ? "bg-primary" : "bg-muted-foreground/40"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="text-sm text-foreground">{label}</span>
                </div>
                <button
                  onClick={() =>
                    window.open(`/api/admin/saas-emails/preview?type=${key}`, "_blank")
                  }
                  className="text-xs text-primary hover:text-primary/80 underline"
                >
                  Pré-visualizar
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Histórico */}
      <div className="bg-muted border border-border rounded-lg p-5">
        <p className="font-semibold text-foreground mb-3">Histórico de envios (últimos 50)</p>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum envio registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Empresa</th>
                  <th className="pb-2 pr-4 font-medium">Tipo</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Destinatário</th>
                  <th className="pb-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-border">
                    <td className="py-2 pr-4 text-foreground">{l.companyName}</td>
                    <td className="py-2 pr-4 text-foreground">
                      {LABEL_BY_TYPE[l.eventType] ?? l.eventType}
                    </td>
                    <td className="py-2 pr-4">{statusBadge(l.status)}</td>
                    <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">{l.to}</td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {new Date(l.createdAt).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
