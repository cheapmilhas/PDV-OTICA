"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { SyncInvoicesButton } from "@/components/admin/sync-invoices-button";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  invoiceGenerationEnabled: boolean;
  invoiceCreatedEnabled: boolean;
  invoiceDueSoonEnabled: boolean;
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
  { key: "INVOICE_CREATED",       label: "Fatura disponível",      flag: "invoiceCreatedEnabled" as const },
  { key: "INVOICE_DUE_SOON",      label: "Fatura a vencer",        flag: "invoiceDueSoonEnabled" as const },
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
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-success/10 text-success">
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
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-destructive/10 text-destructive">
          Falhou
        </span>
      );
    case "PENDING":
    default:
      return (
        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning/10 text-warning">
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
  const [showDisableTestConfirm, setShowDisableTestConfirm] = useState(false);

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

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Modo teste — banner de aviso quando ligado */}
      {config.testMode && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
          <p className="text-sm font-semibold text-warning flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            Modo teste ligado — os emails vão só para{" "}
            <span className="font-mono">{config.testEmail || "(sem endereço definido)"}</span>
            , não para os clientes.
          </p>
          <p className="text-xs text-warning/90 mt-1">
            Desative o modo teste abaixo quando estiver pronto para enviar aos clientes reais.
          </p>
        </div>
      )}

      {/* Interruptor mestre */}
      <div className="bg-muted border border-border rounded-lg p-5 flex items-center justify-between">
        <div>
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            Status:
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${config.masterEnabled ? "bg-success" : "bg-muted-foreground"}`}
            />
            {config.masterEnabled ? "Emails ativados" : "Emails desativados"}
          </p>
          <p className="text-sm text-muted-foreground">
            {config.masterEnabled
              ? "Envios ocorrem conforme os gatilhos abaixo."
              : "Nenhum email é disparado enquanto desligado."}
          </p>
        </div>
        <Button
          onClick={() => patch({ masterEnabled: !config.masterEnabled })}
          disabled={saving}
          variant={config.masterEnabled ? "destructive" : "success"}
        >
          {config.masterEnabled ? "Desligar" : "Ligar"}
        </Button>
      </div>

      {/* Geração de cobrança */}
      <div className="bg-muted border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">Geração de cobrança</p>
            <p className="text-sm text-muted-foreground">
              Controla se o sistema busca faturas Asaas e envia emails de cobrança.
            </p>
          </div>
          <Button
            onClick={() => patch({ invoiceGenerationEnabled: !config.invoiceGenerationEnabled })}
            disabled={saving}
            variant={config.invoiceGenerationEnabled ? "destructive" : "success"}
          >
            {config.invoiceGenerationEnabled ? "Desligar" : "Ligar"}
          </Button>
        </div>

        {/* Status banner */}
        {!config.invoiceGenerationEnabled ? (
          <div className="bg-muted border border-border rounded-md p-3">
            <p className="text-sm text-foreground">
              Geração de cobrança DESLIGADA — o sistema não busca nem comunica cobranças. Ligue só
              quando estiver pronto.
            </p>
          </div>
        ) : config.testMode ? (
          <div className="bg-warning/10 border border-warning/30 rounded-md p-3">
            <p className="text-sm text-warning">
              Cobranças sendo processadas, mas emails vão só para{" "}
              <span className="font-mono">{config.testEmail || "(sem endereço)"}</span>.
            </p>
          </div>
        ) : !config.masterEnabled ? (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3">
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              Geração ligada, mas o interruptor mestre de emails está DESLIGADO — nenhum email
              sai.
            </p>
          </div>
        ) : (
          <div className="bg-success/10 border border-success/30 rounded-md p-3">
            <p className="text-sm text-success">
              Geração de cobrança ativa — cobranças são buscadas e comunicadas aos clientes.
            </p>
          </div>
        )}

        <SyncInvoicesButton />
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
          <Button
            onClick={() => {
              if (!config.testMode) {
                patch({ testMode: true });
              } else {
                setShowDisableTestConfirm(true);
              }
            }}
            disabled={saving}
            variant={config.testMode ? "default" : "outline"}
            className={
              config.testMode ? "bg-info text-info-foreground hover:bg-info/90" : undefined
            }
          >
            {config.testMode ? "🔍 Teste ligado" : "Ligar teste"}
          </Button>
        </div>
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Endereço de teste</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmailValue}
              onChange={(e) => setTestEmailValue(e.target.value)}
              placeholder="admin@exemplo.com"
              className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              onClick={() => patch({ testEmail: testEmailValue || null })}
              disabled={saving || testEmailValue === (config.testEmail ?? "")}
            >
              Salvar
            </Button>
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
                    aria-label={`${enabled ? "Desativar" : "Ativar"} email: ${label}`}
                    onClick={() => patch({ [flag]: !enabled })}
                    disabled={saving}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      enabled ? "bg-primary" : "bg-muted-foreground/40"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform ${
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
                  className="text-xs text-primary hover:text-primary/80 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
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
          <EmptyState icon={Mail} message="Nenhum envio registrado ainda." />
        ) : (
          <ResponsiveTable minWidth={720}>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-foreground">{l.companyName}</TableCell>
                  <TableCell className="text-foreground">
                    {LABEL_BY_TYPE[l.eventType] ?? l.eventType}
                  </TableCell>
                  <TableCell>{statusBadge(l.status)}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{l.to}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(l.createdAt).toLocaleString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        )}
      </div>

      <AlertDialog open={showDisableTestConfirm} onOpenChange={setShowDisableTestConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar o modo teste?</AlertDialogTitle>
            <AlertDialogDescription>
              Os emails passarão a ser enviados para os clientes reais. Confirme apenas quando estiver pronto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDisableTestConfirm(false);
                patch({ testMode: false });
              }}
            >
              Desligar modo teste
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
