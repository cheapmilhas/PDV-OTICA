"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  TrendingUp,
  Lock,
  Unlock,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Wallet,
  Loader2,
  History,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { MovimentacoesTable, type MovRow } from "@/components/caixa/movimentacoes-table";
import { getMethodLabel } from "@/components/caixa/mov-helpers";
import { ModalAberturaCaixa } from "@/components/caixa/modal-abertura-caixa";
import { ModalFechamentoCaixa } from "@/components/caixa/modal-fechamento-caixa";
import { ModalSangria } from "@/components/caixa/modal-sangria";
import { ModalReforco } from "@/components/caixa/modal-reforco";
import { CashShiftAlert } from "@/components/caixa/cash-shift-alert";
import ConferenciaFormas, {
  type SalesByMethodEntry,
} from "@/components/caixa/conferencia-formas";
import { usePermissions } from "@/hooks/usePermissions";
import { useBranchContext } from "@/hooks/use-branch-context";
import toast from "react-hot-toast";
import { computeCashOnHand } from "@/lib/cash-on-hand";

type CashShift = {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openingFloatAmount: number;
  openedByUser: { name: string };
  movements: CashMovement[];
  stalenessHours?: number;
  stalenessLevel?: "ok" | "warning" | "critical";
};

type CashMovement = {
  id: string;
  type: "OPENING_FLOAT" | "SALE_PAYMENT" | "WITHDRAWAL" | "SUPPLY" | "REFUND" | "ADJUSTMENT" | "CLOSING";
  direction: "IN" | "OUT";
  method: "CASH" | "PIX" | "DEBIT_CARD" | "CREDIT_CARD" | "BOLETO" | "STORE_CREDIT" | "CHEQUE" | "AGREEMENT" | "OTHER";
  amount: number;
  note?: string;
  originType?: string;
  createdAt: string;
  createdByUser?: { name: string };
  salePayment?: { sale: { id: string } };
};

type ReceivableRow = {
  id: string;
  method: string;
  amount: number;
  saleNumber: number;
  sellerName: string;
  createdAt: string;
};

function CaixaPage() {
  const { hasPermission } = usePermissions();
  const { isAllBranches, activeBranch } = useBranchContext();
  const branchLabel = activeBranch?.name
    ? `Caixa da loja ${activeBranch.name}`
    : "Caixa da loja atual";
  const [modalAberturaOpen, setModalAberturaOpen] = useState(false);
  const [modalFechamentoOpen, setModalFechamentoOpen] = useState(false);
  const [modalSangriaOpen, setModalSangriaOpen] = useState(false);
  const [modalReforcoOpen, setModalReforcoOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<CashShift | null>(null);
  const [salesByMethod, setSalesByMethod] = useState<SalesByMethodEntry[]>([]);
  const [receivableRows, setReceivableRows] = useState<ReceivableRow[]>([]);
  const [voidedReceivableRows, setVoidedReceivableRows] = useState<ReceivableRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchCashShift = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        isAllBranches ? "/api/cash/shift?branch=all" : "/api/cash/shift"
      );
      if (!response.ok) throw new Error("Erro ao buscar dados do caixa");
      const data = await response.json();
      setShift(data.shift);
      setSalesByMethod(data.salesByMethod || []);
      setReceivableRows(data.receivableRows || []);
      setVoidedReceivableRows(data.voidedReceivableRows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashShift();
    // Re-busca ao trocar de filial (modo "todas" não tem caixa do dia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllBranches]);

  const handleShiftAction = () => {
    fetchCashShift();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] gap-4">
        <p className="text-destructive">Erro: {error}</p>
        <Button onClick={fetchCashShift}>Tentar Novamente</Button>
      </div>
    );
  }

  const caixaAberto = shift?.status === "OPEN";
  const movements = shift?.movements || [];

  const calculatePaymentSummary = () => {
    const summary: Record<string, { quantidade: number; valor: number }> = {};

    movements
      .filter((m) => m.type === "SALE_PAYMENT" && m.direction === "IN")
      .forEach((m) => {
        const methodLabel = getMethodLabel(m.method);
        if (!summary[methodLabel]) {
          summary[methodLabel] = { quantidade: 0, valor: 0 };
        }
        summary[methodLabel].quantidade += 1;
        summary[methodLabel].valor += m.amount;
      });

    return Object.entries(summary).map(([forma, data]) => ({
      forma,
      ...data,
    }));
  };

  const resumoPagamentos = calculatePaymentSummary();
  const totalSangrias = movements
    .filter((m) => m.type === "WITHDRAWAL" && m.direction === "OUT")
    .reduce((sum, m) => sum + m.amount, 0);
  const totalReforcos = movements
    .filter((m) => m.type === "SUPPLY" && m.direction === "IN")
    .reduce((sum, m) => sum + m.amount, 0);

  // Saldo do caixa: apenas DINHEIRO FÍSICO (method="CASH").
  // PIX/débito/cartão aparecem na "Conferência por forma de pagamento", não na gaveta.
  const valorAtual = computeCashOnHand(movements);

  const caixaStatus = shift
    ? {
        aberto: caixaAberto,
        operador: shift.openedByUser.name,
        dataAbertura: new Date(shift.openedAt).toLocaleString("pt-BR"),
        valorAbertura: shift.openingFloatAmount,
        valorAtual,
      }
    : {
        aberto: false,
        operador: "-",
        dataAbertura: "-",
        valorAbertura: 0,
        valorAtual: 0,
      };

  const tempoAberto = (() => {
    if (!shift || shift.status !== "OPEN") return null;
    // Prefere staleness do servidor (autoritativa). Cai pro cliente se vier ausente.
    const totalHours =
      shift.stalenessHours ?? (Date.now() - new Date(shift.openedAt).getTime()) / (1000 * 60 * 60);
    const days = Math.floor(totalHours / 24);
    const hours = Math.floor(totalHours % 24);
    const minutes = Math.floor((totalHours - Math.floor(totalHours)) * 60);
    return {
      hours: totalHours,
      label:
        days > 0
          ? `${days}d ${hours}h`
          : hours > 0
            ? `${hours}h ${minutes}m`
            : `${minutes}m`,
    };
  })();
  const turnoCritico = shift?.stalenessLevel === "critical" || (tempoAberto?.hours ?? 0) >= 24;
  const turnoAtencao =
    !turnoCritico &&
    (shift?.stalenessLevel === "warning" || (tempoAberto?.hours ?? 0) >= 12);

  const allRows: MovRow[] = [
    ...movements.map(
      (m): MovRow => ({
        kind: "MOVEMENT",
        id: m.id,
        type: m.type,
        direction: m.direction,
        method: m.method,
        amount: m.amount,
        note: m.note,
        originType: m.originType,
        createdAt: m.createdAt,
        createdByUser: m.createdByUser,
      })
    ),
    ...receivableRows.map(
      (r): MovRow => ({
        kind: "RECEIVABLE",
        id: r.id,
        method: r.method,
        amount: r.amount,
        saleNumber: r.saleNumber,
        sellerName: r.sellerName,
        createdAt: r.createdAt,
      })
    ),
    ...voidedReceivableRows.map(
      (r): MovRow => ({
        kind: "VOIDED",
        id: r.id,
        method: r.method,
        amount: r.amount,
        saleNumber: r.saleNumber,
        sellerName: r.sellerName,
        createdAt: r.createdAt,
      })
    ),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const handleModalClose = () => {
    fetchCashShift();
    setModalAberturaOpen(false);
    setModalFechamentoOpen(false);
    setModalSangriaOpen(false);
    setModalReforcoOpen(false);
  };

  return (
    <>
      <ModalAberturaCaixa
        open={modalAberturaOpen}
        onOpenChange={(open) => {
          setModalAberturaOpen(open);
          if (!open) fetchCashShift();
        }}
      />
      <ModalFechamentoCaixa
        open={modalFechamentoOpen}
        onOpenChange={(open) => {
          setModalFechamentoOpen(open);
          if (!open) fetchCashShift();
        }}
        caixaInfo={caixaStatus}
        resumoPagamentos={resumoPagamentos}
        movements={movements}
        salesByMethod={salesByMethod}
        allRows={allRows}
      />
      <ModalSangria
        open={modalSangriaOpen}
        onOpenChange={(open) => {
          setModalSangriaOpen(open);
          if (!open) fetchCashShift();
        }}
      />
      <ModalReforco
        open={modalReforcoOpen}
        onOpenChange={(open) => {
          setModalReforcoOpen(open);
          if (!open) fetchCashShift();
        }}
      />

      <div className="space-y-6">
        {/* Alerta de caixa aberto há muito tempo */}
        <CashShiftAlert hideAction />

        {/* Modo "todas as lojas": não há caixa do dia consolidado */}
        {isAllBranches && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Você está vendo <span className="font-medium">todas as lojas</span>. O caixa do
            dia é por loja — selecione uma loja específica no topo para ver a conferência e
            operar o caixa.
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Fluxo de Caixa</h1>
            <p className="text-muted-foreground">
              Controle de abertura, fechamento e movimentações
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/caixa/historico" className="flex-1 md:flex-none">
              <Button variant="outline" className="w-full md:w-auto">
                <History className="mr-2 h-4 w-4" />
                Histórico
              </Button>
            </Link>
            {caixaStatus.aberto ? (
              <>
                {/* A3: sangria/reforço exigem cash_shift.open (mesma permissão
                    do POST /api/cash/movements). Antes o botão aparecia p/ quem
                    só tinha .view e dava 403 ao clicar. */}
                {hasPermission("cash_shift.open") && (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 md:flex-none"
                      onClick={() => setModalSangriaOpen(true)}
                    >
                      <ArrowDownCircle className="mr-2 h-4 w-4" />
                      Sangria
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 md:flex-none"
                      onClick={() => setModalReforcoOpen(true)}
                    >
                      <ArrowUpCircle className="mr-2 h-4 w-4" />
                      Reforço
                    </Button>
                  </>
                )}
                {hasPermission("cash_shift.close") && (
                  <Button
                    variant="destructive"
                    className="flex-1 md:flex-none"
                    onClick={() => setModalFechamentoOpen(true)}
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Fechar Caixa
                  </Button>
                )}
              </>
            ) : (
              hasPermission("cash_shift.open") && (
                <Button
                  onClick={() => {
                    if (isAllBranches) {
                      toast.error("Selecione uma loja específica para abrir o caixa");
                      return;
                    }
                    setModalAberturaOpen(true);
                  }}
                  variant={isAllBranches ? "outline" : "default"}
                  className="flex-1 md:flex-none"
                >
                  <Unlock className="mr-2 h-4 w-4" />
                  Abrir Caixa
                </Button>
              )
            )}
          </div>
        </div>

        {/* Status do Caixa */}
        <Card
          className={
            caixaStatus.aberto
              ? turnoCritico
                ? "border-red-300 bg-gradient-to-br from-red-50 to-white"
                : turnoAtencao
                  ? "border-amber-300 bg-gradient-to-br from-amber-50 to-white"
                  : "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
              : "border-slate-200 bg-slate-50"
          }
        >
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    caixaStatus.aberto
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {caixaStatus.aberto ? (
                    <Unlock className="h-5 w-5" />
                  ) : (
                    <Lock className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-lg">
                    {caixaStatus.aberto ? "Caixa aberto" : "Caixa fechado"}
                  </CardTitle>
                  <p className="text-xs font-medium text-slate-600">{branchLabel}</p>
                  {caixaStatus.aberto && tempoAberto && (
                    <p className="text-xs text-muted-foreground">
                      Há <span className="font-medium tabular-nums">{tempoAberto.label}</span> ·
                      operado por <span className="font-medium">{caixaStatus.operador}</span>
                    </p>
                  )}
                </div>
              </div>
              {caixaStatus.aberto && tempoAberto && (
                <Badge
                  variant={turnoCritico ? "destructive" : "secondary"}
                  className={
                    turnoCritico
                      ? ""
                      : turnoAtencao
                        ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                        : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                  }
                >
                  {turnoCritico ? "Fechar imediatamente" : turnoAtencao ? "Atenção: > 12h" : "Operação normal"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Abertura</span>
                </div>
                <p className="mt-1 text-sm font-medium tabular-nums">{caixaStatus.dataAbertura}</p>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>Valor inicial</span>
                </div>
                <p className="mt-1 text-sm font-medium tabular-nums">
                  {formatCurrency(caixaStatus.valorAbertura)}
                </p>
              </div>
              <div
                className={`rounded-lg border p-4 ${
                  caixaStatus.aberto
                    ? "border-emerald-200 bg-emerald-50"
                    : "bg-white"
                }`}
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-800">
                  <Wallet className="h-3.5 w-3.5" />
                  <span>Saldo em caixa</span>
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
                  {formatCurrency(caixaStatus.valorAtual)}
                </p>
                <p className="text-[11px] text-muted-foreground">Saldo em gaveta · Dinheiro</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conferência por forma de pagamento (2 blocos) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conferência por forma de pagamento</CardTitle>
            <CardDescription>
              Crédito, crediário e saldo a receber não entram no caixa físico — viram contas
              a receber e aparecem aqui só para conferência.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAllBranches && !shift ? (
              <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 py-8 text-center text-sm text-amber-800">
                Selecione uma loja específica para ver a conferência do caixa.
              </div>
            ) : (
              <ConferenciaFormas salesByMethod={salesByMethod} />
            )}
          </CardContent>
        </Card>

        {/* Resumo de Vendas */}
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="border-slate-200">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Total de vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-emerald-700">
                {formatCurrency(salesByMethod.reduce((s, r) => s + r.amount, 0))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {salesByMethod.reduce((s, r) => s + r.count, 0)} transaç
                {salesByMethod.reduce((s, r) => s + r.count, 0) === 1 ? "ão" : "ões"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ArrowDownCircle className="h-3.5 w-3.5" />
                Sangrias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-red-600">
                {totalSangrias > 0 ? `−${formatCurrency(totalSangrias)}` : formatCurrency(0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Retiradas do caixa</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ArrowUpCircle className="h-3.5 w-3.5" />
                Reforços
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-sky-600">
                {totalReforcos > 0 ? `+${formatCurrency(totalReforcos)}` : formatCurrency(0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Adições ao caixa</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-50">
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                Saldo atual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  caixaStatus.valorAtual < 0 ? "text-red-600" : "text-slate-900"
                }`}
              >
                {formatCurrency(caixaStatus.valorAtual)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Em caixa agora</p>
            </CardContent>
          </Card>
        </div>

        {/* Movimentações */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Movimentações do caixa</CardTitle>
            <CardDescription>
              Histórico de todas as operações do turno atual
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <MovimentacoesTable rows={allRows} />
            <div className="flex flex-col gap-1 border-t px-4 py-3 text-sm sm:flex-row sm:justify-end sm:gap-8">
              <div className="sm:text-right"><span className="text-muted-foreground">Saldo em gaveta</span>
                <span className="ml-2 font-semibold tabular-nums">{formatCurrency(valorAtual)}</span></div>
              <div className="sm:text-right"><span className="text-muted-foreground">Total vendido no turno</span>
                <span className="ml-2 font-semibold tabular-nums">{formatCurrency(salesByMethod.reduce((s, r) => s + r.amount, 0))}</span></div>
            </div>
            <p className="px-4 pb-3 text-[11px] text-muted-foreground">Recebimentos de crediário entram no caixa mas não contam como venda do turno.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="cash_shift.view">
      <CaixaPage />
    </ProtectedRoute>
  );
}
