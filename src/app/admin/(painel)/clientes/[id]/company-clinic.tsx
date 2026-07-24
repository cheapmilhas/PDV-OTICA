"use client";

import { useState } from "react";
import { Check, Copy, Stethoscope, AlertTriangle } from "lucide-react";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";

interface CompanyClinicProps {
  provisioningState: string;
  domusClinicId: string | null;
  medicalInviteUrl: string | null;
  planTier: string | null;
  entitlementRevision: string | null;
  failureReason: string | null;
}

const TIER_LABELS: Record<string, string> = {
  clinic_full: "Clínica completa",
  ophthalmology: "Oftalmologia",
  specialist: "Especialista",
};

export function CompanyClinic({
  provisioningState,
  domusClinicId,
  medicalInviteUrl,
  planTier,
  entitlementRevision,
  failureReason,
}: CompanyClinicProps) {
  const [copied, setCopied] = useState(false);

  async function copyInvite() {
    if (!medicalInviteUrl) return;
    try {
      await navigator.clipboard.writeText(medicalInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível (permissão/contexto) — silencioso; o link fica visível.
    }
  }

  const isFailed = provisioningState === "PROVISION_FAILED";

  return (
    <div className="space-y-5">
      {/* Alerta de falha (N1) — falha terminal do provisionamento no Domus. */}
      {isFailed && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Falha ao provisionar a clínica no sistema Medical
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {failureReason
                ? `Motivo: ${failureReason}`
                : "O worker esgotou as tentativas. Verifique o estado do canal Vis↔Domus."}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            Clínica no sistema Medical (Domus)
          </h2>
          <AdminStatusBadge kind="provisioning" status={provisioningState} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="ID da clínica (Domus)" value={domusClinicId ?? "—"} mono />
          <InfoRow
            label="Tier (entitlement)"
            value={planTier ? (TIER_LABELS[planTier] ?? planTier) : "—"}
          />
          <InfoRow label="Escrita liberada" value={provisioningState === "PROVISIONED" ? "Sim" : "—"} />
          <InfoRow label="Revisão do entitlement" value={entitlementRevision ?? "—"} mono />
        </div>
      </div>

      {/* Link de convite — copiar (padrão Input readOnly font-mono + botão). */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Convite de acesso do administrador</h3>
        <p className="text-xs text-muted-foreground mb-3">
          O administrador da clínica define a senha em medical.vis.app.br por este link.
        </p>
        {medicalInviteUrl ? (
          <div className="flex gap-2">
            <input
              readOnly
              value={medicalInviteUrl}
              className="flex-1 px-3 py-2 bg-muted border border-input rounded-lg text-foreground text-xs font-mono focus:outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copyInvite}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {provisioningState === "PROVISIONED"
              ? "Convite ainda não gerado."
              : "O link fica disponível quando o provisionamento concluir."}
          </p>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-foreground ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</p>
    </div>
  );
}
