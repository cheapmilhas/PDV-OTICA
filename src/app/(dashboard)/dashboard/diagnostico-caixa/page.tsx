"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DebugData {
  branchId: string;
  companyId: string;
  openShift: {
    id: string;
    status: string;
    openedAt: string;
    movementsCount: number;
  } | null;
  allShifts: Array<{
    id: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    _count: { movements: number };
  }>;
  movements: Array<{
    id: string;
    type: string;
    method: string;
    amount: number;
    cashShiftId: string;
    salePaymentId: string | null;
    salePayment: {
      id: string;
      saleId: string;
      method: string;
      amount: number;
    } | null;
    createdAt: string;
  }>;
  recentSales: Array<{
    id: string;
    total: number;
    createdAt: string;
    payments: Array<{
      id: string;
      method: string;
      amount: number;
      cashMovementsCount: number;
    }>;
  }>;
}

export default function DiagnosticoCaixaPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DebugData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDebug = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cash/debug");
      if (!res.ok) {
        throw new Error(`Erro ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json.debug);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebug();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Erro ao carregar diagnóstico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
            <Button onClick={fetchDebug} className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // Diagnóstico automático
  const problemas: string[] = [];

  if (!data.openShift) {
    problemas.push("⚠️ NENHUM CAIXA ABERTO - Abra um caixa antes de fazer vendas");
  }

  if (data.openShift && data.movements.length === 0) {
    problemas.push("⚠️ CAIXA ABERTO MAS SEM MOVIMENTOS - CashMovements não estão sendo criados");
  }

  data.recentSales.forEach((sale) => {
    // STORE_CREDIT não gera CashMovement na venda (só quando a parcela for paga)
    const paymentsWithoutCashMovement = sale.payments.filter(
      p => p.cashMovementsCount === 0 && p.method !== "STORE_CREDIT"
    );
    if (paymentsWithoutCashMovement.length > 0) {
      problemas.push(
        `❌ VENDA ${sale.id.substring(0, 8)} tem ${paymentsWithoutCashMovement.length} pagamento(s) SEM CashMovement`
      );
    }
  });

  const statusCaixa = data.openShift ? "ABERTO" : "FECHADO";
  const statusColor = data.openShift ? "text-green-600" : "text-red-600";

  return (
    <div className="space-y-6 p-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">🔍 Diagnóstico do Caixa</h1>
        <Button onClick={fetchDebug} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Status Geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {problemas.length === 0 ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            )}
            Status Geral
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p>
              <strong>Empresa ID:</strong> {data.companyId}
            </p>
            <p>
              <strong>Filial ID:</strong> {data.branchId}
            </p>
            <p>
              <strong>Status do Caixa:</strong>{" "}
              <span className={`font-bold ${statusColor}`}>{statusCaixa}</span>
            </p>
          </div>

          {problemas.length > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h3 className="font-bold text-yellow-800 mb-2">⚠️ Problemas Detectados:</h3>
              <ul className="list-disc list-inside space-y-1">
                {problemas.map((problema, idx) => (
                  <li key={idx} className="text-yellow-700">
                    {problema}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Caixa Aberto */}
      <Card>
        <CardHeader>
          <CardTitle>💰 Caixa Aberto</CardTitle>
        </CardHeader>
        <CardContent>
          {data.openShift ? (
            <div className="space-y-2">
              <p>
                <strong>ID:</strong> {data.openShift.id}
              </p>
              <p>
                <strong>Status:</strong>{" "}
                <Badge className="bg-green-600">{data.openShift.status}</Badge>
              </p>
              <p>
                <strong>Aberto em:</strong>{" "}
                {format(new Date(data.openShift.openedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
              <p>
                <strong>Movimentos:</strong> {data.openShift.movementsCount}
              </p>
            </div>
          ) : (
            <p className="text-red-600 font-semibold">Nenhum caixa aberto</p>
          )}
        </CardContent>
      </Card>

      {/* Histórico de Caixas */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Últimos 5 Caixas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.allShifts.map((shift) => (
              <div key={shift.id} className="border-b pb-2">
                <div className="flex justify-between">
                  <span className="font-mono text-sm">{shift.id.substring(0, 8)}</span>
                  <Badge className={shift.status === "OPEN" ? "bg-green-600" : "bg-gray-600"}>
                    {shift.status}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">
                  Aberto: {format(new Date(shift.openedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  {shift.closedAt && ` | Fechado: ${format(new Date(shift.closedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}`}
                </p>
                <p className="text-sm">Movimentos: {shift._count.movements}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Movimentos do Caixa */}
      <Card>
        <CardHeader>
          <CardTitle>📊 Últimos 10 Movimentos do Caixa Aberto</CardTitle>
        </CardHeader>
        <CardContent>
          {data.movements.length === 0 ? (
            <p className="text-yellow-600 font-semibold">⚠️ Nenhum movimento encontrado</p>
          ) : (
            <div className="space-y-3">
              {data.movements.map((mov) => (
                <div key={mov.id} className="border p-3 rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span className="font-mono text-sm">{mov.id.substring(0, 8)}</span>
                    <Badge>{mov.type}</Badge>
                  </div>
                  <p className="text-sm">
                    <strong>Método:</strong> {mov.method}
                  </p>
                  <p className="text-sm">
                    <strong>Valor:</strong> R$ {mov.amount.toFixed(2)}
                  </p>
                  {mov.salePayment && (
                    <p className="text-sm text-green-600">
                      ✅ Vinculado à Venda: {mov.salePayment.saleId.substring(0, 8)}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    {format(new Date(mov.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimas Vendas */}
      <Card>
        <CardHeader>
          <CardTitle>🛒 Últimas 5 Vendas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.recentSales.map((sale) => (
              <div key={sale.id} className="border p-3 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="font-mono">{sale.id.substring(0, 8)}</span>
                  <span className="font-bold">R$ {sale.total.toFixed(2)}</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  {format(new Date(sale.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Pagamentos:</p>
                  {sale.payments.map((payment) => (
                    <div key={payment.id} className="flex justify-between text-sm pl-4">
                      <span>
                        {payment.method} - R$ {payment.amount.toFixed(2)}
                      </span>
                      {payment.cashMovementsCount > 0 ? (
                        <Badge className="bg-green-600">
                          ✓ {payment.cashMovementsCount} movimento(s)
                        </Badge>
                      ) : payment.method === "STORE_CREDIT" ? (
                        <Badge className="bg-blue-600">
                          ✓ Crediário (sem movimento na venda)
                        </Badge>
                      ) : (
                        <Badge className="bg-red-600">✗ SEM movimento</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* JSON Completo */}
      <Card>
        <CardHeader>
          <CardTitle>🔧 JSON Completo (para debug técnico)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-xs max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
