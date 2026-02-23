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
import { usePermissions } from "@/hooks/usePermissions";

type CashShift = {
  id: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  openingFloatAmount: number;
  openedByUser: { name: string };
  movements: CashMovement[];
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
      CREDIT_CARD: "Credito",
      DEBIT_CARD: "Debito",
      PIX: "PIX",
      BOLETO: "Boleto",
      STORE_CREDIT: "Credito Loja",
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

  const valorAtual = movements.reduce((sum, m) => {
    return sum + (m.direction === "IN" ? m.amount : -m.amount);
  }, 0);

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
                <Button onClick={() => setModalAberturaOpen(true)}>
                  <Unlock className="mr-2 h-4 w-4" />
                  Abrir Caixa
                </Button>
              )
            )}
          </div>
        </div>

        {/* Status do Caixa */}
        <Card className={caixaStatus.aberto ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {caixaStatus.aberto ? (
                  <>
                    <Unlock className="h-5 w-5 text-green-600" />
                    <span className="text-green-900">Caixa Aberto</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-5 w-5 text-red-600" />
                    <span className="text-red-900">Caixa Fechado</span>
                  </>
                )}
              </CardTitle>
              <Badge variant={caixaStatus.aberto ? "default" : "destructive"} className="text-lg px-3 py-1">
                {caixaStatus.aberto ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <User className="h-4 w-4" />
                  <span>Operador</span>
                </div>
                <p className="font-semibold">{caixaStatus.operador}</p>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Clock className="h-4 w-4" />
                  <span>Abertura</span>
                </div>
                <p className="font-semibold">{caixaStatus.dataAbertura}</p>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span>Valor Abertura</span>
                </div>
                <p className="font-semibold">{formatCurrency(caixaStatus.valorAbertura)}</p>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Wallet className="h-4 w-4" />
                  <span>Valor Atual</span>
                </div>
                <p className="text-xl font-bold text-green-600">{formatCurrency(caixaStatus.valorAtual)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo de Vendas */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalVendas)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {totalTransacoes} transações
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sangrias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">-{formatCurrency(totalSangrias)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Retiradas do caixa
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Reforços
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">+{formatCurrency(totalReforcos)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Adições ao caixa
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Saldo Atual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(caixaStatus.valorAtual)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Em caixa
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Resumo por Forma de Pagamento */}
        <Card>
          <CardHeader>
            <CardTitle>Resumo por Forma de Pagamento</CardTitle>
            <CardDescription>
              Distribuição das vendas por método
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {resumoPagamentos.map((item) => (
                <div key={item.forma} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getFormaPagamentoIcon(item.forma)}
                      <span className="font-medium">{item.forma}</span>
                    </div>
                    <Badge variant="secondary">{item.quantidade}</Badge>
                  </div>
                  <Separator className="my-2" />
                  <p className="text-2xl font-bold">{formatCurrency(item.valor)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ticket médio: {formatCurrency(item.valor / item.quantidade)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Movimentações */}
        <Card>
          <CardHeader>
            <CardTitle>Movimentações do Caixa</CardTitle>
            <CardDescription>
              Histórico de todas as operações do dia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Forma de Pagamento</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma movimentacao registrada
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {new Date(mov.createdAt).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTipoBadgeVariant(mov.type)} className="flex items-center gap-1 w-fit">
                          {getTipoIcon(mov.type)}
                          {getTipoLabel(mov.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{getMovementDescription(mov)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getFormaPagamentoIcon(mov.method)}
                          <span className="text-sm">{getMethodLabel(mov.method)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{mov.createdByUser?.name || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${
                          mov.direction === "IN" ? "text-green-600" : "text-red-600"
                        }`}>
                          {mov.direction === "IN" ? "+" : "-"}{formatCurrency(mov.amount)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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
