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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Loader2, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

interface CashTransaction {
  id: string;
  type: "SALE" | "EXPENSE" | "WITHDRAWAL" | "SUPPLY";
  amount: number;
  description: string;
  createdAt: string;
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
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
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
        setTransactions(result.data || []);
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

  function handleDownloadReport() {
    if (!caixa) return;

    // TODO: Implementar geração de PDF
    toast.info("Gerando relatório...");
  }

  if (!caixa) return null;

  const transactionTypeLabels: Record<string, string> = {
    SALE: "Venda",
    EXPENSE: "Despesa",
    WITHDRAWAL: "Sangria",
    SUPPLY: "Suprimento",
  };

  const transactionTypeColors: Record<string, string> = {
    SALE: "text-green-600",
    EXPENSE: "text-red-600",
    WITHDRAWAL: "text-orange-600",
    SUPPLY: "text-blue-600",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Caixa</DialogTitle>
          <DialogDescription>
            Caixa aberto em {format(new Date(caixa.openedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma movimentação registrada
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(transaction.createdAt), "dd/MM HH:mm", {
                            locale: ptBR,
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {transactionTypeLabels[transaction.type]}
                          </Badge>
                        </TableCell>
                        <TableCell>{transaction.description}</TableCell>
                        <TableCell className={cn("text-right font-medium", transactionTypeColors[transaction.type])}>
                          {transaction.type === "EXPENSE" || transaction.type === "WITHDRAWAL" ? "-" : "+"}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {caixa.status === "CLOSED" && (
              <Button onClick={handleDownloadReport}>
                <Download className="mr-2 h-4 w-4" />
                Baixar Relatório
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
