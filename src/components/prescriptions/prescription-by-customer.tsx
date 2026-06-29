"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { groupByCustomer } from "@/lib/group-prescriptions-by-customer";
import { formatGrau } from "@/lib/format-grau";
import type { PrescriptionListItem } from "./prescription-list";

/**
 * Visão "Por cliente" do Livro de Receitas: agrupa as receitas por cliente e
 * mostra a evolução do grau (ordem cronológica crescente). Read-only; receita
 * AGUARDANDO_GRAU sem OS oferece "Digitar grau".
 */

interface Props {
  prescriptions: PrescriptionListItem[];
  onVer: (p: PrescriptionListItem) => void;
  onDigitarGrau?: (id: string) => void;
}

function fmtDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

/** Resumo curto do grau a partir de values (ex. "OD -1.25"). Sem values → "". */
function grauResumo(values: Record<string, unknown> | null | undefined): string {
  if (!values) return "";
  const od = values.odSph;
  const oe = values.oeSph;
  const parts: string[] = [];
  if (od !== undefined && od !== null && od !== "") parts.push(`OD ${formatGrau(od as string | number | null | undefined, "dioptria")}`);
  if (oe !== undefined && oe !== null && oe !== "") parts.push(`OE ${formatGrau(oe as string | number | null | undefined, "dioptria")}`);
  return parts.join(" · ");
}

export function PrescriptionByCustomer({ prescriptions, onVer, onDigitarGrau }: Props) {
  // useMemo ANTES de qualquer return condicional (regra dos hooks). Evita
  // reagrupar a cada render do pai (que muda por viewing/editId etc).
  const groups = useMemo(() => groupByCustomer(prescriptions), [prescriptions]);

  if (prescriptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhuma receita encontrada.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const grauAtual = grauResumo(group.latest.values);
        return (
          <div key={group.customerId} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Link
                  href={`/dashboard/clientes/${group.customerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium truncate underline-offset-2 hover:underline"
                >
                  {group.customerName}
                </Link>
                <Badge variant="secondary" className="text-xs">
                  {group.count} receita(s)
                </Badge>
              </div>
              {grauAtual && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  Grau atual: {grauAtual}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {group.prescriptions.map((p) => {
                const grau = grauResumo(p.values);
                return (
                  <div
                    key={p.id}
                    data-testid="rx-row"
                    onClick={() => onVer(p)}
                    className="flex items-center justify-between gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Emitida {fmtDate(p.issuedAt)}</span>
                        <Badge
                          variant={p.status === "COMPLETA" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {p.status === "COMPLETA" ? "Completa" : "Aguardando grau"}
                        </Badge>
                      </div>
                      {grau && (
                        <div className="text-xs text-muted-foreground mt-0.5">{grau}</div>
                      )}
                    </div>
                    {p.status === "AGUARDANDO_GRAU" && !p.hasServiceOrder && onDigitarGrau && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation(); // não dispara o onVer da linha
                          onDigitarGrau(p.id);
                        }}
                      >
                        Digitar grau
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
