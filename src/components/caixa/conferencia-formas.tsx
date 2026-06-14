"use client";

import { formatCurrency } from "@/lib/utils";
import { METHODS_IN_CASH, PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";

export interface SalesByMethodEntry {
  method: string;
  amount: number;
  count: number;
}

interface ConferenciaFormasProps {
  salesByMethod: SalesByMethodEntry[];
}

function methodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

function BlocoFormas({
  titulo,
  entries,
  nota,
}: {
  titulo: string;
  entries: SalesByMethodEntry[];
  nota?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="p-4 border rounded-lg space-y-2">
      <div className="text-sm font-medium">{titulo}</div>
      <div className="space-y-1">
        {entries.map((entry) => (
          <div
            key={entry.method}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">
              {methodLabel(entry.method)}
              <span className="ml-1 text-xs text-muted-foreground/70">
                ({entry.count} {entry.count === 1 ? "venda" : "vendas"})
              </span>
            </span>
            <span className="font-medium">{formatCurrency(entry.amount)}</span>
          </div>
        ))}
      </div>
      {nota && (
        <div className="text-xs text-muted-foreground/70 pt-1">{nota}</div>
      )}
    </div>
  );
}

export default function ConferenciaFormas({
  salesByMethod,
}: ConferenciaFormasProps) {
  if (!salesByMethod || salesByMethod.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">Sem vendas no turno</div>
    );
  }

  const naGaveta = salesByMethod.filter((s) =>
    (METHODS_IN_CASH as readonly string[]).includes(s.method)
  );
  const aPrazo = salesByMethod.filter(
    (s) => !(METHODS_IN_CASH as readonly string[]).includes(s.method)
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <BlocoFormas titulo="💵 Na gaveta / conferível" entries={naGaveta} />
      <BlocoFormas
        titulo="📄 Vendido no turno · a prazo"
        entries={aPrazo}
        nota="Não entra no caixa físico — só conferência"
      />
    </div>
  );
}
