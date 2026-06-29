"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatGrau, type GrauTipo } from "@/lib/format-grau";
import type { PrescriptionListItem } from "./prescription-list";

/**
 * Detalhe (leitura) de uma receita do Livro: grau OD/OE + paciente/datas/origem.
 * Recebe a receita já carregada (a lista já traz `values`) — sem fetch extra.
 * Oferece "Editar" quando canEdit.
 */

interface Props {
  prescription: PrescriptionListItem & {
    values?: Record<string, unknown> | null;
    /** True se a receita está vinculada a uma OS → grau só edita na OS. */
    hasServiceOrder?: boolean;
  };
  open: boolean;
  onClose: () => void;
  canEdit?: boolean;
  onEdit?: (id: string) => void;
}

function fmtDate(d: string | Date | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

const EYE_COLS: Array<{ keys: [string, string]; label: string; tipo: GrauTipo }> = [
  { keys: ["odSph", "oeSph"], label: "Esférico", tipo: "dioptria" },
  { keys: ["odCyl", "oeCyl"], label: "Cilíndrico", tipo: "dioptria" },
  { keys: ["odAxis", "oeAxis"], label: "Eixo", tipo: "eixo" },
  { keys: ["pdFar", "pdNear"], label: "DNP", tipo: "medida" },
  { keys: ["fittingHeightOd", "fittingHeightOe"], label: "Altura", tipo: "medida" },
  { keys: ["odAdd", "oeAdd"], label: "Adição", tipo: "dioptria" },
];

export function PrescriptionDetailDialog({ prescription, open, onClose, canEdit, onEdit }: Props) {
  const v = (prescription.values ?? {}) as Record<string, unknown>;
  const paciente =
    prescription.isDependente && prescription.patientName
      ? prescription.patientName
      : prescription.customer?.name ?? "—";
  // Receita com OS apontando (mesmo vinda de venda) é "OS"; só "Venda" se exame/
  // lente avulso sem OS. (mesma regra da lista — ver origemLabel)
  const origem = prescription.hasServiceOrder
    ? "OS"
    : prescription.saleId
      ? "Venda"
      : "Avulsa";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {prescription.customer?.id ? (
              <Link
                href={`/dashboard/clientes/${prescription.customer.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
              >
                {paciente}
              </Link>
            ) : (
              paciente
            )}
            {prescription.isDependente && (
              <Badge variant="secondary" className="text-xs">Dependente</Badge>
            )}
            <Badge variant={prescription.status === "COMPLETA" ? "default" : "outline"} className="text-xs">
              {prescription.status === "COMPLETA" ? "Completa" : "Aguardando grau"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="text-muted-foreground">
            Emitida {fmtDate(prescription.issuedAt)} · Validade {fmtDate(prescription.expiresAt)} · Origem: {origem}
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border p-1.5 text-left font-semibold w-14">Olho</th>
                {EYE_COLS.map((c) => (
                  <th key={c.label} className="border p-1.5 text-center font-semibold">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["od", "oe"] as const).map((eye, i) => (
                <tr key={eye}>
                  <td className="border p-1.5 font-bold bg-gray-50 text-center">
                    {eye === "od" ? "OD" : "OE"}
                  </td>
                  {EYE_COLS.map((c) => (
                    <td key={c.label} className="border p-1.5 text-center">
                      {formatGrau(v[c.keys[i]] as string | number | null | undefined, c.tipo)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {prescription.hasServiceOrder && (
          <p className="text-xs text-muted-foreground">
            Esta receita veio de uma Ordem de Serviço. Para alterar o grau, edite o grau na Ordem de Serviço — a alteração reflete aqui automaticamente.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {canEdit && onEdit && !prescription.hasServiceOrder && (
            <Button onClick={() => onEdit(prescription.id)}>Editar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
