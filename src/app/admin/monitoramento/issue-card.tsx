"use client";

// src/app/admin/monitoramento/issue-card.tsx
//
// Cartão de um problema detectado (aba Resolução). O botão "Resolver" depende do
// action.kind: blueprint → abre o ActionModal (Fase 5, com auditoria); link → navega
// para a página do cliente; info → texto explicativo. Tipos definidos localmente p/
// não puxar lib/prisma ao bundle do client (mesmo padrão do cockpit-client).
import { useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ChevronRight, Info, Wrench } from "lucide-react";
import { ActionModal, type BlueprintDescriptor } from "./action-modal";

export type IssueSeverity = "critical" | "warning" | "info";

export interface IssueAction {
  kind: "blueprint" | "link" | "info";
  blueprintId?: string;
  href?: string;
  label: string;
}

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: "system" | "client";
  title: string;
  explanation: string;
  companyId?: string;
  companyName?: string;
  action?: IssueAction;
}

const SEV: Record<IssueSeverity, { icon: React.ElementType; ring: string; iconCls: string; chip: string; label: string }> = {
  critical: { icon: AlertCircle, ring: "border-red-500/30 bg-red-500/5", iconCls: "text-red-400", chip: "bg-red-500/15 text-red-300", label: "Urgente" },
  warning: { icon: AlertTriangle, ring: "border-amber-500/30 bg-amber-500/5", iconCls: "text-amber-400", chip: "bg-amber-500/15 text-amber-300", label: "Atenção" },
  info: { icon: Info, ring: "border-blue-500/30 bg-blue-500/5", iconCls: "text-blue-400", chip: "bg-blue-500/15 text-blue-300", label: "Aviso" },
};

interface IssueCardProps {
  issue: Issue;
  // mapa de descritores p/ resolver action.blueprintId (fetch uma vez no cockpit-client)
  blueprints: Record<string, BlueprintDescriptor>;
  onResolved?: () => void;
}

export function IssueCard({ issue, blueprints, onResolved }: IssueCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const sev = SEV[issue.severity];
  const Icon = sev.icon;

  const bp = issue.action?.kind === "blueprint" && issue.action.blueprintId
    ? blueprints[issue.action.blueprintId]
    : undefined;
  // blueprint filtrado por role (ausente no mapa) → esconder o botão de resolver
  const blueprintMissing = issue.action?.kind === "blueprint" && !bp;

  return (
    <div className={`rounded-xl border p-4 ${sev.ring}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${sev.iconCls}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{issue.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sev.chip}`}>{sev.label}</span>
          </div>
          <p className="mt-1 text-sm text-gray-400">{issue.explanation}</p>

          {issue.action && (
            <div className="mt-3">
              {issue.action.kind === "link" && issue.action.href && (
                <Link href={issue.action.href} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700">
                  {issue.action.label} <ChevronRight className="h-4 w-4" />
                </Link>
              )}
              {issue.action.kind === "blueprint" && bp && issue.companyId && (
                <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
                  <Wrench className="h-4 w-4" /> {issue.action.label}
                </button>
              )}
              {blueprintMissing && (
                <span className="text-xs text-gray-500" title="Você não tem permissão para esta ação">Sem permissão para resolver</span>
              )}
              {issue.action.kind === "info" && (
                <span className="text-xs text-gray-500">{issue.action.label}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {modalOpen && bp && issue.companyId && (
        <ActionModal
          blueprint={bp}
          companyId={issue.companyId}
          companyName={issue.companyName ?? ""}
          onClose={() => setModalOpen(false)}
          onDone={() => { setModalOpen(false); onResolved?.(); }}
        />
      )}
    </div>
  );
}
