"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Lock,
  Unlock,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  User,
  CreditCard,
  Banknote,
  Wallet,
  Loader2,
  History,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { ModalAberturaCaixa } from "@/components/caixa/modal-abertura-caixa";
import { ModalFechamentoCaixa } from "@/components/caixa/modal-fechamento-caixa";
import { ModalSangria } from "@/components/caixa/modal-sangria";
import { ModalReforco } from "@/components/caixa/modal-reforco";
import { CashShiftAlert } from "@/components/caixa/cash-shift-alert";
import { usePermissions } from "@/hooks/usePermissions";
import { useBranchContext } from "@/hooks/use-branch-context";
import toast from "react-hot-toast";
import { METHODS_A_PRAZO } from "@/lib/payment-methods";

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
  createdAt: string;
  createdByUser?: { name: string };
  salePayment?: { sale: { id: string } };
};

function CaixaPage() {
  const { hasPermission } = usePermissions();
  const { isAllBranches } = useBranchContext();
  const [modalAberturaOpen, setModalAberturaOpen] = useState(false);
  const [modalFechamentoOpen, setModalFechamentoOpen] = useState(false);
  const [modalSangriaOpen, setModalSangriaOpen] = useState(false);
  const [modalReforcoOpen, setModalReforcoOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<CashShift | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCashShift = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/cash/shift");
      if (!response.ok) throw new Error("Erro ao buscar dados do caixa");
      const data = await response.json();
      setShift(data.shift);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashShift();
  }, []);

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

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: "Dinheiro",
      CREDIT_CARD: "Crédito",
      DEBIT_CARD: "Débito",
      PIX: "PIX",
      BOLETO: "Boleto",
      STORE_CREDIT: "Crediário",
      BALANCE_DUE: "Saldo a Receber",
      CHEQUE: "Cheque",
      AGREEMENT: "Convenio",
      OTHER: "Outro",
    };
    return labels[method] || method;
  };

  const resumoPagamentos = calculatePaymentSummary();
  const totalVendas = resumoPagamentos.reduce((acc, item) => acc + item.valor, 0);
  const totalTransacoes = resumoPagamentos.reduce((acc, item) => acc + item.quantidade, 0);
  const totalSangrias = movements
    .filter((m) => m.type === "WITHDRAWAL" && m.direction === "OUT")
    .reduce((sum, m) => sum + m.amount, 0);
  const totalReforcos = movements
    .filter((m) => m.type === "SUPPLY" && m.direction === "IN")
    .reduce((sum, m) => sum + m.amount, 0);

  // Saldo do caixa: apenas pagamentos à vista (exclui crediário e cartão crédito)
  const methodsAPrazo: readonly string[] = METHODS_A_PRAZO;
  const valorAtual = movements.reduce((sum, m) => {
    if (m.type === "SALE_PAYMENT" && methodsAPrazo.includes(m.method)) return sum; // Ignora a prazo
    return sum + (m.direction === "IN" ? m.amount : -m.amount);
  }, 0);
  // Total de vendas a prazo (crediário + crédito) para exibição separada
  const totalAPrazo = movements
    .filter((m) => m.type === "SALE_PAYMENT" && m.direction === "IN" && methodsAPrazo.includes(m.method))
    .reduce((sum, m) => sum + m.amount, 0);

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

  const getTipoIcon = (type: string) => {
    switch (type) {
      case "SALE_PAYMENT":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "WITHDRAWAL":
        return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
      case "SUPPLY":
        return <ArrowUpCircle className="h-4 w-4 text-blue-600" />;
      case "OPENING_FLOAT":
        return <Unlock className="h-4 w-4 text-gray-600" />;
      case "CLOSING":
        return <Lock className="h-4 w-4 text-gray-600" />;
      case "REFUND":
        return <TrendingDown className="h-4 w-4 text-orange-600" />;
      default:
        return <DollarSign className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTipoLabel = (type: string) => {
    const labels: Record<string, string> = {
      SALE_PAYMENT: "Venda",
      WITHDRAWAL: "Sangria",
      SUPPLY: "Reforco",
      OPENING_FLOAT: "Abertura",
      CLOSING: "Fechamento",
      REFUND: "Reembolso",
      ADJUSTMENT: "Ajuste",
    };
    return labels[type] || type;
  };

  const getTipoBadgeVariant = (type: string) => {
    switch (type) {
      case "SALE_PAYMENT":
        return "default" as const;
      case "WITHDRAWAL":
      case "REFUND":
        return "destructive" as const;
      case "SUPPLY":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  const getFormaPagamentoIcon = (method: string) => {
    switch (method) {
      case "CASH":
        return <Banknote className="h-4 w-4" />;
      case "CREDIT_CARD":
      case "DEBIT_CARD":
        return <CreditCard className="h-4 w-4" />;
      case "PIX":
        return <Wallet className="h-4 w-4" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };

  const getMovementDescription = (movement: CashMovement) => {
    if (movement.note) return movement.note;
    if (movement.type === "SALE_PAYMENT" && movement.salePayment) {
      return `Venda`;
    }
    return getTipoLabel(movement.type);
  };

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

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Fluxo de Caixa</h1>
            <p className="text-muted-foreground">
              Controle de abertura, fechamento e movimentações
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/caixa/historico">
              <Button variant="outline">
                <History className="mr-2 h-4 w-4" />
                Histórico
              </Button>
            </Link>
            {caixaStatus.aberto ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setModalSangriaOpen(true)}
                >
                  <ArrowDownCircle className="mr-2 h-4 w-4" />
                  Sangria
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setModalReforcoOpen(true)}
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Reforço
                </Button>
                {hasPermission("cash_shift.close") && (
                  <Button
                    variant="destructive"
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
                <p className="text-[11px] text-muted-foreground">Dinheiro · PIX · Débito</p>
              </div>
              <div
                className={`rounded-lg border p-4 ${
                  totalAPrazo > 0 ? "border-amber-200 bg-amber-50" : "bg-white opacity-60"
                }`}
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-amber-800">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>A prazo · informativo</span>
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700">
                  {formatCurrency(totalAPrazo)}
                </p>
                <p className="text-[11px] text-muted-foreground">Crediário / cartão de crédito · não entra no caixa</p>
              </div>
            </div>
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
                {formatCurrency(totalVendas)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {totalTransacoes} transaç{totalTransacoes === 1 ? "ão" : "ões"}
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

        {/* Resumo por Forma de Pagamento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo por forma de pagamento</CardTitle>
            <CardDescription>Distribuição das vendas do turno por método</CardDescription>
          </CardHeader>
          <CardContent>
            {resumoPagamentos.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                Ainda não há pagamentos registrados neste turno.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {resumoPagamentos.map((item) => {
                  const percentual = totalVendas > 0 ? (item.valor / totalVendas) * 100 : 0;
                  return (
                    <div
                      key={item.forma}
                      className="rounded-lg border bg-white p-4 transition-colors hover:border-slate-300"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          {getFormaPagamentoIcon(item.forma)}
                          <span>{item.forma}</span>
                        </div>
                        <Badge variant="secondary" className="tabular-nums">
                          {item.quantidade}
                        </Badge>
                      </div>
                      <p className="text-2xl font-bold tabular-nums text-slate-900">
                        {formatCurrency(item.valor)}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="tabular-nums">
                          Ticket: {formatCurrency(item.valor / item.quantidade)}
                        </span>
                        <span className="tabular-nums font-medium text-slate-600">
                          {percentual.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.min(percentual, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Movimentações */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Movimentações do caixa</CardTitle>
            <CardDescription>
              Histórico de todas as operações do turno atual
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="w-[88px]">Horário</TableHead>
                    <TableHead className="w-[140px]">Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[150px]">Forma</TableHead>
                    <TableHead className="w-[160px]">Operador</TableHead>
                    <TableHead className="w-[140px] text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12">
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
                    movements.map((mov) => (
                      <TableRow
                        key={mov.id}
                        className="transition-colors hover:bg-slate-50"
                      >
                        <TableCell className="tabular-nums text-sm font-medium text-slate-700">
                          {new Date(mov.createdAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getTipoBadgeVariant(mov.type)} className="flex w-fit items-center gap-1">
                            {getTipoIcon(mov.type)}
                            {getTipoLabel(mov.type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-slate-700">{getMovementDescription(mov)}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            {getFormaPagamentoIcon(mov.method)}
                            <span>{getMethodLabel(mov.method)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span>{mov.createdByUser?.name || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`font-semibold tabular-nums ${
                              mov.direction === "IN" ? "text-emerald-700" : "text-red-600"
                            }`}
                          >
                            {mov.direction === "IN" ? "+" : "−"}
                            {formatCurrency(mov.amount)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
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
