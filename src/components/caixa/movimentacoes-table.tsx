"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { User, Wallet, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getMethodLabel,
  getTipoIcon,
  getTipoLabel,
  getTipoBadgeVariant,
  getFormaPagamentoIcon,
  getMovementDescription,
} from "./mov-helpers";

export type MovRow =
  | {
      kind: "MOVEMENT";
      id: string;
      type: string;
      direction: "IN" | "OUT";
      method: string;
      amount: number;
      note?: string;
      originType?: string;
      createdAt: string;
      createdByUser?: { name: string };
    }
  | {
      kind: "RECEIVABLE";
      id: string;
      method: string;
      amount: number;
      saleNumber: number;
      sellerName: string;
      createdAt: string;
    }
  | {
      kind: "VOIDED";
      id: string;
      method: string;
      amount: number;
      saleNumber: number;
      sellerName: string;
      createdAt: string;
    };

interface MovimentacoesTableProps {
  rows: MovRow[];
  compact?: boolean;
}

/**
 * Tabela compartilhada de movimentações do caixa.
 *
 * CONTRATO: renderiza `rows` NA ORDEM RECEBIDA — NÃO ordena internamente.
 * Cada tela é responsável por pré-ordenar (a tela do dia ordena ASC por
 * horário; o histórico/modal podem ordenar como quiserem).
 *
 * `compact` esconde as colunas Forma/Operador e embute esses dados na
 * coluna Descrição (uso em espaços apertados, ex. modais).
 */
function formatTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MovimentacoesTable({ rows, compact = false }: MovimentacoesTableProps) {
  const colSpan = compact ? 4 : 6;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/50">
            <TableHead className="w-[88px]">Horário</TableHead>
            <TableHead className="w-[140px]">Tipo</TableHead>
            <TableHead>Descrição</TableHead>
            {!compact && <TableHead className="w-[150px]">Forma</TableHead>}
            {!compact && <TableHead className="w-[160px]">Operador</TableHead>}
            <TableHead className="w-[140px] text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="py-12">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="rounded-full bg-slate-100 p-3">
                    <Wallet className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">Nenhuma movimentação ainda</p>
                  <p className="text-xs text-muted-foreground">
                    Vendas, sangrias e reforços aparecerão aqui em tempo real.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => <MovTableRow key={`${row.kind}-${row.id}`} row={row} compact={compact} />)
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function MovTableRow({ row, compact }: { row: MovRow; compact: boolean }) {
  // MOVEMENT vindo de recebimento de crediário: é dinheiro real que entra no caixa.
  if (row.kind === "MOVEMENT" && row.originType === "AccountReceivable") {
    const desc = compact
      ? `Recebimento · ${getMethodLabel(row.method)}`
      : row.note || "Recebimento";
    return (
      <TableRow className="transition-colors hover:bg-slate-50">
        <TableCell className="tabular-nums text-sm font-medium text-slate-700">
          {formatTime(row.createdAt)}
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className="flex w-fit items-center gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            Recebimento
          </Badge>
        </TableCell>
        <TableCell>
          <p className="text-sm text-slate-700">{desc}</p>
        </TableCell>
        {!compact && (
          <TableCell>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {getFormaPagamentoIcon(row.method)}
              <span>{getMethodLabel(row.method)}</span>
            </div>
          </TableCell>
        )}
        {!compact && (
          <TableCell>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <User className="h-3 w-3 text-muted-foreground" />
              <span>{row.createdByUser?.name || "-"}</span>
            </div>
          </TableCell>
        )}
        <TableCell className="text-right">
          <span
            className={`font-semibold tabular-nums ${
              row.direction === "IN" ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {row.direction === "IN" ? "+" : "−"}
            {formatCurrency(row.amount)}
          </span>
        </TableCell>
      </TableRow>
    );
  }

  if (row.kind === "MOVEMENT") {
    const desc = getMovementDescription(row);
    return (
      <TableRow className="transition-colors hover:bg-slate-50">
        <TableCell className="tabular-nums text-sm font-medium text-slate-700">
          {formatTime(row.createdAt)}
        </TableCell>
        <TableCell>
          <Badge variant={getTipoBadgeVariant(row.type)} className="flex w-fit items-center gap-1">
            {getTipoIcon(row.type)}
            {getTipoLabel(row.type)}
          </Badge>
        </TableCell>
        <TableCell>
          <p className="text-sm text-slate-700">
            {compact ? `${desc} · ${getMethodLabel(row.method)}` : desc}
          </p>
        </TableCell>
        {!compact && (
          <TableCell>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {getFormaPagamentoIcon(row.method)}
              <span>{getMethodLabel(row.method)}</span>
            </div>
          </TableCell>
        )}
        {!compact && (
          <TableCell>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <User className="h-3 w-3 text-muted-foreground" />
              <span>{row.createdByUser?.name || "-"}</span>
            </div>
          </TableCell>
        )}
        <TableCell className="text-right">
          <span
            className={`font-semibold tabular-nums ${
              row.direction === "IN" ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {row.direction === "IN" ? "+" : "−"}
            {formatCurrency(row.amount)}
          </span>
        </TableCell>
      </TableRow>
    );
  }

  if (row.kind === "RECEIVABLE") {
    const desc = compact
      ? `Venda #${row.saleNumber} · ${getMethodLabel(row.method)} · ${row.sellerName}`
      : `Venda #${row.saleNumber}`;
    return (
      <TableRow className="transition-colors hover:bg-slate-50">
        <TableCell className="tabular-nums text-sm font-medium text-slate-700">
          {formatTime(row.createdAt)}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <Badge variant="outline" className="flex w-fit items-center gap-1">
              Venda
            </Badge>
            <span className="text-[11px] text-amber-600">→ a receber</span>
          </div>
        </TableCell>
        <TableCell>
          <p className="text-sm text-slate-700">{desc}</p>
        </TableCell>
        {!compact && (
          <TableCell>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              {getFormaPagamentoIcon(row.method)}
              <span>{getMethodLabel(row.method)}</span>
            </div>
          </TableCell>
        )}
        {!compact && (
          <TableCell>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <User className="h-3 w-3 text-muted-foreground" />
              <span>{row.sellerName}</span>
            </div>
          </TableCell>
        )}
        <TableCell className="text-right">
          <span className="font-semibold tabular-nums text-amber-600">
            {formatCurrency(row.amount)}
          </span>
        </TableCell>
      </TableRow>
    );
  }

  // VOIDED
  const desc = compact
    ? `Venda #${row.saleNumber} · ${getMethodLabel(row.method)} · ${row.sellerName}`
    : `Venda #${row.saleNumber}`;
  return (
    <TableRow className="line-through text-slate-400 transition-colors hover:bg-slate-50">
      <TableCell className="tabular-nums text-sm font-medium">{formatTime(row.createdAt)}</TableCell>
      <TableCell>
        <Badge variant="secondary" className="flex w-fit items-center gap-1 bg-slate-100 text-slate-500 hover:bg-slate-100">
          Cancelada
        </Badge>
      </TableCell>
      <TableCell>
        <p className="text-sm">{desc}</p>
      </TableCell>
      {!compact && (
        <TableCell>
          <div className="flex items-center gap-2 text-sm">
            {getFormaPagamentoIcon(row.method)}
            <span>{getMethodLabel(row.method)}</span>
          </div>
        </TableCell>
      )}
      {!compact && (
        <TableCell>
          <div className="flex items-center gap-2 text-sm">
            <User className="h-3 w-3" />
            <span>{row.sellerName}</span>
          </div>
        </TableCell>
      )}
      <TableCell className="text-right">
        <span className="font-semibold tabular-nums text-slate-400">{formatCurrency(row.amount)}</span>
      </TableCell>
    </TableRow>
  );
}

export default MovimentacoesTable;
