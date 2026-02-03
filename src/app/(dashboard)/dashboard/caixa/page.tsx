"use client";

import { useState } from "react";
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
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalAberturaCaixa } from "@/components/caixa/modal-abertura-caixa";
import { ModalFechamentoCaixa } from "@/components/caixa/modal-fechamento-caixa";
import { ModalSangria } from "@/components/caixa/modal-sangria";
import { ModalReforco } from "@/components/caixa/modal-reforco";

export default function CaixaPage() {
  const [modalAberturaOpen, setModalAberturaOpen] = useState(false);
  const [modalFechamentoOpen, setModalFechamentoOpen] = useState(false);
  const [modalSangriaOpen, setModalSangriaOpen] = useState(false);
  const [modalReforcoOpen, setModalReforcoOpen] = useState(false);

  // Mock data - status do caixa
  const caixaStatus = {
    aberto: true,
    operador: "Carlos Vendedor",
    dataAbertura: "2024-02-03 08:00",
    valorAbertura: 200.00,
    valorAtual: 5050.00,
  };

  // Mock data - movimentações do caixa
  const movimentacoes = [
    {
      id: "1",
      tipo: "venda",
      descricao: "Venda #0023 - Maria Silva",
      valor: 450.00,
      formaPagamento: "Crédito",
      horario: "14:30",
      operador: "Carlos Vendedor",
    },
    {
      id: "2",
      tipo: "venda",
      descricao: "Venda #0022 - João Santos",
      valor: 1200.00,
      formaPagamento: "PIX",
      horario: "13:15",
      operador: "Carlos Vendedor",
    },
    {
      id: "3",
      tipo: "sangria",
      descricao: "Sangria - Depósito bancário",
      valor: -1000.00,
      formaPagamento: "Dinheiro",
      horario: "12:00",
      operador: "Maria Atendente",
    },
    {
      id: "4",
      tipo: "venda",
      descricao: "Venda #0021 - Ana Costa",
      valor: 680.00,
      formaPagamento: "Débito",
      horario: "11:45",
      operador: "Carlos Vendedor",
    },
    {
      id: "5",
      tipo: "reforco",
      descricao: "Reforço - Troco",
      valor: 500.00,
      formaPagamento: "Dinheiro",
      horario: "10:30",
      operador: "João Caixa",
    },
    {
      id: "6",
      tipo: "venda",
      descricao: "Venda #0020 - Carlos Lima",
      valor: 899.90,
      formaPagamento: "Crédito",
      horario: "10:20",
      operador: "Carlos Vendedor",
    },
    {
      id: "7",
      tipo: "venda",
      descricao: "Venda #0019 - Fernanda Souza",
      valor: 1580.00,
      formaPagamento: "Crédito",
      horario: "09:30",
      operador: "Maria Atendente",
    },
    {
      id: "8",
      tipo: "abertura",
      descricao: "Abertura de Caixa",
      valor: 200.00,
      formaPagamento: "Dinheiro",
      horario: "08:00",
      operador: "Carlos Vendedor",
    },
  ];

  // Resumo por forma de pagamento
  const resumoPagamentos = [
    { forma: "Dinheiro", quantidade: 5, valor: 1850.00 },
    { forma: "Crédito", quantidade: 8, valor: 6780.50 },
    { forma: "Débito", quantidade: 4, valor: 2420.00 },
    { forma: "PIX", quantidade: 6, valor: 3200.00 },
  ];

  const totalVendas = resumoPagamentos.reduce((acc, item) => acc + item.valor, 0);
  const totalTransacoes = resumoPagamentos.reduce((acc, item) => acc + item.quantidade, 0);
  const totalSangrias = 1500.00;
  const totalReforcos = 500.00;

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case "venda":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "sangria":
        return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
      case "reforco":
        return <ArrowUpCircle className="h-4 w-4 text-blue-600" />;
      case "abertura":
        return <Unlock className="h-4 w-4 text-gray-600" />;
      case "fechamento":
        return <Lock className="h-4 w-4 text-gray-600" />;
      default:
        return null;
    }
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "venda":
        return "Venda";
      case "sangria":
        return "Sangria";
      case "reforco":
        return "Reforço";
      case "abertura":
        return "Abertura";
      case "fechamento":
        return "Fechamento";
      default:
        return tipo;
    }
  };

  const getTipoBadgeVariant = (tipo: string) => {
    switch (tipo) {
      case "venda":
        return "default" as const;
      case "sangria":
        return "destructive" as const;
      case "reforco":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  const getFormaPagamentoIcon = (forma: string) => {
    switch (forma) {
      case "Dinheiro":
        return <Banknote className="h-4 w-4" />;
      case "Crédito":
      case "Débito":
        return <CreditCard className="h-4 w-4" />;
      case "PIX":
        return <Wallet className="h-4 w-4" />;
      default:
        return <DollarSign className="h-4 w-4" />;
    }
  };

  return (
    <>
      <ModalAberturaCaixa
        open={modalAberturaOpen}
        onOpenChange={setModalAberturaOpen}
      />
      <ModalFechamentoCaixa
        open={modalFechamentoOpen}
        onOpenChange={setModalFechamentoOpen}
        caixaInfo={caixaStatus}
        resumoPagamentos={resumoPagamentos}
      />
      <ModalSangria
        open={modalSangriaOpen}
        onOpenChange={setModalSangriaOpen}
      />
      <ModalReforco
        open={modalReforcoOpen}
        onOpenChange={setModalReforcoOpen}
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
                <Button
                  variant="destructive"
                  onClick={() => setModalFechamentoOpen(true)}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Fechar Caixa
                </Button>
              </>
            ) : (
              <Button onClick={() => setModalAberturaOpen(true)}>
                <Unlock className="mr-2 h-4 w-4" />
                Abrir Caixa
              </Button>
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
                {movimentacoes.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-medium">{mov.horario}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getTipoBadgeVariant(mov.tipo)} className="flex items-center gap-1 w-fit">
                        {getTipoIcon(mov.tipo)}
                        {getTipoLabel(mov.tipo)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{mov.descricao}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFormaPagamentoIcon(mov.formaPagamento)}
                        <span className="text-sm">{mov.formaPagamento}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{mov.operador}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-bold ${
                        mov.valor > 0 ? "text-green-600" : "text-red-600"
                      }`}>
                        {mov.valor > 0 ? "+" : ""}{formatCurrency(Math.abs(mov.valor))}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
