"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Lista reutilizável de receitas do Livro — usada na ficha do cliente e na tela
 * geral. Read-only; receita AGUARDANDO_GRAU oferece "Digitar grau".
 */

export interface PrescriptionListItem {
  id: string;
  issuedAt: string | Date;
  expiresAt: string | Date;
  status: "AGUARDANDO_GRAU" | "COMPLETA";
  isDependente?: boolean;
  patientName?: string | null;
  saleId?: string | null;
  serviceOrderId?: string | null;
  customer?: { id: string; name: string } | null;
  values?: Record<string, unknown> | null;
}

interface Props {
  prescriptions: PrescriptionListItem[];
  onDigitarGrau?: (id: string) => void;
  /** Clicar no card abre o detalhe (recebe a receita inteira — a lista já traz values). */
  onVer?: (prescription: PrescriptionListItem) => void;
}

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function origemLabel(p: PrescriptionListItem): string {
  if (p.saleId) return "Venda";
  if (p.serviceOrderId) return "OS";
  return "Avulsa";
}

function pacienteNome(p: PrescriptionListItem): string {
  if (p.isDependente && p.patientName) return p.patientName;
  return p.customer?.name ?? "—";
}

export function PrescriptionList({ prescriptions, onDigitarGrau, onVer }: Props) {
  if (prescriptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhuma receita encontrada.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {prescriptions.map((p) => (
        <div
          key={p.id}
          onClick={onVer ? () => onVer(p) : undefined}
          className={
            "flex items-center justify-between rounded-md border p-3" +
            (onVer ? " cursor-pointer hover:bg-muted/50 transition-colors" : "")
          }
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{pacienteNome(p)}</span>
              {p.isDependente && (
                <Badge variant="secondary" className="text-xs">Dependente</Badge>
              )}
              <Badge variant={p.status === "COMPLETA" ? "default" : "outline"} className="text-xs">
                {p.status === "COMPLETA" ? "Completa" : "Aguardando grau"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Emitida {fmtDate(p.issuedAt)} · Validade {fmtDate(p.expiresAt)} · Origem: {origemLabel(p)}
            </div>
          </div>
          {p.status === "AGUARDANDO_GRAU" && onDigitarGrau && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation(); // não dispara o onVer do card
                onDigitarGrau(p.id);
              }}
            >
              Digitar grau
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
