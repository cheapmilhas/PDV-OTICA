"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Loader2, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ConferenciaFormas, {
  type SalesByMethodEntry,
} from "@/components/caixa/conferencia-formas";
import {
  MovimentacoesTable,
  type MovRow,
} from "@/components/caixa/movimentacoes-table";
import { buildPrintHtml } from "@/components/caixa/cash-print";

interface CashRegister {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: "OPEN" | "CLOSED";
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  difference: number | null;
  totalSales: number;
  totalExpenses: number;
  openedByUser: {
    name: string;
    email: string;
  };
  closedByUser?: {
    name: string;
    email: string;
  } | null;
  branch: {
    name: string;
  };
}

interface ModalDetalhesCaixaProps {
  caixa: CashRegister | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModalDetalhesCaixa({
  caixa,
  open,
  onOpenChange,
}: ModalDetalhesCaixaProps) {
  const [transactions, setTransactions] = useState<MovRow[]>([]);
  const [salesByMethod, setSalesByMethod] = useState<SalesByMethodEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (caixa && open) {
      loadTransactions();
    }
  }, [caixa, open]);

  async function loadTransactions() {
    if (!caixa) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/cash-registers/${caixa.id}/transactions`);
      const result = await response.json();

      if (response.ok) {
        const movs = (result.data?.movements || []).map((m: any) => ({ ...m, kind: "MOVEMENT" as const }));
        const recs = (result.data?.receivableRows || []).map((r: any) => ({ ...r, kind: "RECEIVABLE" as const }));
        const voids = (result.data?.voidedReceivableRows || []).map((r: any) => ({ ...r, kind: "VOIDED" as const }));
        const all = [...movs, ...recs, ...voids].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() // DESC: mais recente primeiro
        );
        setTransactions(all);
        setSalesByMethod(result.data?.salesByMethod || []);
      } else {
        toast.error("Erro ao carregar transações");
      }
    } catch (error) {
      toast.error("Erro ao carregar transações");
    } finally {
      setIsLoading(false);
    }
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  function handlePrint() {
    if (!caixa) return;

    const win = window.open("", "_blank");
    if (!win) return;

    // Rotina 21/06: o relatório saía "desestruturado" porque copiava o innerHTML
    // (classes Tailwind) para uma janela SEM Tailwind. Aqui montamos o HTML a
    // partir dos DADOS com CSS próprio — independente do Tailwind.
    win.document.write(buildPrintHtml(caixa, transactions, salesByMethod));
    win.document.close();
  }

  if (!caixa) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Caixa</DialogTitle>
          <DialogDescription>
            Caixa aberto em {format(new Date(caixa.openedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        <div id={`print-caixa-${caixa.id}`} className="space-y-6">
          {/* Informações Gerais */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Aberto por</div>
              <div className="font-medium">{caixa.openedByUser.name}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Fechado por</div>
              <div className="font-medium">{caixa.closedByUser?.name || "-"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Data/Hora Abertura</div>
              <div className="font-medium">
                {format(new Date(caixa.openedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Data/Hora Fechamento</div>
              <div className="font-medium">
                {caixa.closedAt
                  ? format(new Date(caixa.closedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })
                  : "Caixa aberto"}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Filial</div>
              <div className="font-medium">{caixa.branch.name}</div>
            </div>
          </div>

          <Separator />

          {/* Resumo Financeiro */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <DollarSign className="h-4 w-4" />
                Saldo Inicial
              </div>
              <div className="text-2xl font-bold">
                {formatCurrency(caixa.openingBalance)}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Total Vendas
              </div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(caixa.totalSales)}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                Total Despesas
              </div>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(caixa.totalExpenses)}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <DollarSign className="h-4 w-4" />
                Saldo Esperado
              </div>
              <div className="text-2xl font-bold">
                {caixa.expectedBalance !== null
                  ? formatCurrency(caixa.expectedBalance)
                  : "-"}
              </div>
            </div>
          </div>

          {caixa.status === "CLOSED" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-2">
                    Saldo Contado
                  </div>
                  <div className="text-2xl font-bold">
                    {caixa.closingBalance !== null
                      ? formatCurrency(caixa.closingBalance)
                      : "-"}
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-2">
                    Diferença
                  </div>
                  <div
                    className={cn(
                      "text-2xl font-bold",
                      caixa.difference !== null && caixa.difference > 0 && "text-green-600",
                      caixa.difference !== null && caixa.difference < 0 && "text-red-600"
                    )}
                  >
                    {caixa.difference !== null ? formatCurrency(caixa.difference) : "-"}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Conferência de formas de pagamento (histórico — fonte: SalePayment) */}
          {caixa.status === "CLOSED" && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Conferência por forma de pagamento</h3>
              <ConferenciaFormas salesByMethod={salesByMethod} />
            </div>
          )}

          <Separator />

          {/* Transações */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Movimentações</h3>
              <Badge variant="outline">
                {transactions.length} {transactions.length === 1 ? "transação" : "transações"}
              </Badge>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <MovimentacoesTable rows={transactions} compact />
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {caixa.status === "CLOSED" && (
              <Button onClick={handlePrint}>
                <Download className="mr-2 h-4 w-4" />
                Imprimir Relatório
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
