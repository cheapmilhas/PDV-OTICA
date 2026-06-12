"use client";

import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PaymentTrace = {
  paymentId: string;
  method: string;
  amount: number;
  enteredCashRegister: boolean;
  reversed: boolean;
  netCashAmount: number;
  destino: "cash_register" | "accounts_receivable" | "card_receivable" | "none";
  shift?: {
    shiftId: string;
    branchName: string;
    operador: string;
    openedAt: string | Date;
    status: "OPEN" | "CLOSED";
  };
};

interface PaymentDestinationBadgeProps {
  trace?: PaymentTrace;
  loading?: boolean;
}

export default function PaymentDestinationBadge({ trace, loading }: PaymentDestinationBadgeProps) {
  if (!trace) {
    if (loading) {
      return (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground animate-pulse">
          carregando…
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  // Estornado / cancelado (vermelho)
  if (trace.reversed) {
    return (
      <div className="space-y-0.5">
        <Badge className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50">
          🔴 Estornado / cancelado
        </Badge>
        <p className="text-xs text-muted-foreground">saiu do caixa no estorno</p>
      </div>
    );
  }

  // Entrou no caixa (verde)
  if (trace.enteredCashRegister) {
    const s = trace.shift;
    return (
      <div className="space-y-0.5">
        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
          🟢 Entrou no caixa
        </Badge>
        {s && (
          <p className="text-xs text-muted-foreground">
            Caixa {s.branchName} · {s.operador} ·{" "}
            {format(new Date(s.openedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
        {s && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {s.status === "OPEN" ? "turno aberto" : "turno fechado"}
          </Badge>
        )}
      </div>
    );
  }

  // A prazo — recebível de cartão (âmbar)
  if (trace.destino === "card_receivable") {
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
        🟡 A prazo — recebível de cartão
      </Badge>
    );
  }

  // A prazo — conta a receber (âmbar)
  if (trace.destino === "accounts_receivable") {
    return (
      <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
        🟡 A prazo — vira conta a receber
      </Badge>
    );
  }

  // Sem destino (cinza)
  return (
    <Badge className="border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50">
      ⚪ Sem destino registrado
    </Badge>
  );
}
