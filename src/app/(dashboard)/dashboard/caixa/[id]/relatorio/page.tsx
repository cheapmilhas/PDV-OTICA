"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PrintHeader } from "@/components/print/print-header";
import { useCompanySettings } from "@/hooks/useCompanySettings";

function RelatorioFechamentoCaixaContent() {
  const params = useParams();
  const shiftId = params.id as string;
  const [shift, setShift] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { settings } = useCompanySettings();

  useEffect(() => {
    const fetchShift = async () => {
      try {
        const res = await fetch(`/api/cash/shift/${shiftId}`);
        if (!res.ok) throw new Error("Erro ao carregar dados do caixa");
        const data = await res.json();
        setShift(data.shift);
      } catch (error) {
        console.error("Erro:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchShift();
  }, [shiftId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Caixa não encontrado</p>
      </div>
    );
  }

  // Calcular totais
  const movements = shift.movements || [];
  const totalEntradas = movements
    .filter((m: any) => m.direction === "IN")
    .reduce((sum: number, m: any) => sum + Number(m.amount), 0);
  const totalSaidas = movements
    .filter((m: any) => m.direction === "OUT")
    .reduce((sum: number, m: any) => sum + Number(m.amount), 0);
  const saldoFinal = totalEntradas - totalSaidas;

  // Resumo por método de pagamento
  const paymentSummary: Record<string, number> = {};
  movements
    .filter((m: any) => m.type === "SALE_PAYMENT")
    .forEach((m: any) => {
      const method = m.method || "OUTROS";
      paymentSummary[method] = (paymentSummary[method] || 0) + Number(m.amount);
    });

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: "Dinheiro",
      CREDIT_CARD: "Crédito",
      DEBIT_CARD: "Débito",
      PIX: "PIX",
      BOLETO: "Boleto",
      STORE_CREDIT: "Crediário",
      BALANCE_DUE: "Saldo a Receber",
    };
    return labels[method] || method;
  };

  return (
    <div className="min-h-screen bg-white p-8">
      {/* Botão de Impressão - oculto na impressão */}
      <div className="mb-6 print:hidden">
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir
        </Button>
      </div>

      {/* Relatório */}
      <div className="max-w-4xl mx-auto">
        <PrintHeader
          logoUrl={settings?.logoUrl}
          companyName={settings?.displayName || undefined}
          cnpj={settings?.cnpj || undefined}
          address={settings?.address || undefined}
          city={settings?.city || undefined}
          state={settings?.state || undefined}
          phone={settings?.phone || undefined}
          email={settings?.email || undefined}
        />
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Relatório de Fechamento de Caixa</h1>
          <p className="text-muted-foreground">
            Caixa #{shift.id.substring(0, 8)}
          </p>
        </div>

        {/* Informações do Caixa */}
        <div className="border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Informações do Turno</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Aberto por</p>
              <p className="font-medium">{shift.openedByUser?.name || "N/A"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Abertura</p>
              <p className="font-medium">
                {format(new Date(shift.openedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            {shift.closedAt && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Fechado por</p>
                  <p className="font-medium">{shift.closedByUser?.name || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fechamento</p>
                  <p className="font-medium">
                    {format(new Date(shift.closedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Valor Inicial</p>
              <p className="font-medium">{formatCurrency(Number(shift.openingFloatAmount))}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-medium">{shift.status === "CLOSED" ? "Fechado" : "Aberto"}</p>
            </div>
          </div>
        </div>

        {/* Resumo por Forma de Pagamento */}
        <div className="border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Resumo de Vendas por Forma de Pagamento</h2>
          <ResponsiveTable minWidth={640}>
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="text-left py-2">Forma de Pagamento</TableHead>
                  <TableHead className="text-right py-2">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(paymentSummary).map(([method, value]) => (
                  <TableRow key={method} className="border-b">
                    <TableCell className="py-2">{getMethodLabel(method)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-bold">
                  <TableCell className="pt-2">Total</TableCell>
                  <TableCell className="text-right pt-2">
                    {formatCurrency(Object.values(paymentSummary).reduce((sum, val) => sum + val, 0))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </ResponsiveTable>
        </div>

        {/* Resumo Financeiro */}
        <div className="border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Resumo Financeiro</h2>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span>Total de Entradas</span>
              <span className="font-semibold text-green-600">{formatCurrency(totalEntradas)}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span>Total de Saídas</span>
              <span className="font-semibold text-red-600">{formatCurrency(totalSaidas)}</span>
            </div>
            <div className="flex justify-between py-2 text-lg font-bold">
              <span>Saldo Final</span>
              <span>{formatCurrency(saldoFinal)}</span>
            </div>
          </div>
        </div>

        {/* Observações */}
        {shift.notes && (
          <div className="border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Observações</h2>
            <p className="whitespace-pre-wrap">{shift.notes}</p>
          </div>
        )}

        {/* Rodapé */}
        <div className="text-center text-sm text-muted-foreground mt-8 pt-4 border-t">
          <p>Relatório gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
        </div>
      </div>
    </div>
  );
}

export default function RelatorioFechamentoCaixaPage() {
  return (
    <ProtectedRoute permission="cash_shift.view">
      <RelatorioFechamentoCaixaContent />
    </ProtectedRoute>
  );
}
