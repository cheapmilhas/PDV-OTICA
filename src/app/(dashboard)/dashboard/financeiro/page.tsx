"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, TrendingDown, TrendingUp, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function FinanceiroPage() {
  // Mock data - contas a pagar
  const contasPagar = [
    {
      id: "1",
      descricao: "Compra de produtos - Ray-Ban",
      fornecedor: "Ray-Ban do Brasil",
      valor: 8500.00,
      vencimento: "2024-02-05",
      status: "pendente",
      categoria: "Fornecedores",
    },
    {
      id: "2",
      descricao: "Aluguel - Fevereiro 2024",
      fornecedor: "Imobiliária Centro",
      valor: 3500.00,
      vencimento: "2024-02-10",
      status: "pendente",
      categoria: "Aluguel",
    },
    {
      id: "3",
      descricao: "Energia Elétrica - Janeiro",
      fornecedor: "Companhia Elétrica",
      valor: 450.00,
      vencimento: "2024-02-01",
      status: "vencida",
      categoria: "Utilidades",
    },
    {
      id: "4",
      descricao: "Salários - Janeiro 2024",
      fornecedor: "Folha de Pagamento",
      valor: 12000.00,
      vencimento: "2024-02-05",
      status: "pendente",
      categoria: "Pessoal",
    },
    {
      id: "5",
      descricao: "Compra de lentes - Essilor",
      fornecedor: "Essilor do Brasil",
      valor: 5400.00,
      vencimento: "2024-01-28",
      status: "paga",
      categoria: "Fornecedores",
    },
  ];

  // Mock data - contas a receber
  const contasReceber = [
    {
      id: "1",
      descricao: "Venda #0123 - Maria Silva",
      cliente: "Maria Silva Santos",
      valor: 1200.00,
      vencimento: "2024-02-15",
      status: "pendente",
      parcela: "1/3",
    },
    {
      id: "2",
      descricao: "Venda #0118 - João Pedro",
      cliente: "João Pedro Oliveira",
      valor: 800.00,
      vencimento: "2024-02-10",
      status: "pendente",
      parcela: "2/4",
    },
    {
      id: "3",
      descricao: "Venda #0095 - Ana Costa",
      cliente: "Ana Paula Costa",
      valor: 450.00,
      vencimento: "2024-02-01",
      status: "vencida",
      parcela: "3/3",
    },
    {
      id: "4",
      descricao: "Venda #0130 - Carlos Lima",
      cliente: "Carlos Eduardo Lima",
      valor: 600.00,
      vencimento: "2024-02-20",
      status: "pendente",
      parcela: "1/2",
    },
    {
      id: "5",
      descricao: "Venda #0105 - Fernanda Souza",
      cliente: "Fernanda Souza",
      valor: 900.00,
      vencimento: "2024-01-30",
      status: "recebida",
      parcela: "2/2",
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paga":
      case "recebida":
        return { variant: "default" as const, label: status === "paga" ? "Paga" : "Recebida", icon: <CheckCircle2 className="h-3 w-3" /> };
      case "pendente":
        return { variant: "secondary" as const, label: "Pendente", icon: <Clock className="h-3 w-3" /> };
      case "vencida":
        return { variant: "destructive" as const, label: "Vencida", icon: <AlertCircle className="h-3 w-3" /> };
      default:
        return { variant: "outline" as const, label: status, icon: null };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  const calcularDiasVencimento = (vencimento: string) => {
    const hoje = new Date();
    const dataVenc = new Date(vencimento);
    const diff = Math.ceil((dataVenc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Resumos
  const totalPagar = contasPagar.filter(c => c.status === "pendente").reduce((acc, c) => acc + c.valor, 0);
  const totalPagarVencidas = contasPagar.filter(c => c.status === "vencida").reduce((acc, c) => acc + c.valor, 0);
  const totalReceber = contasReceber.filter(c => c.status === "pendente").reduce((acc, c) => acc + c.valor, 0);
  const totalReceberVencidas = contasReceber.filter(c => c.status === "vencida").reduce((acc, c) => acc + c.valor, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financeiro</h1>
          <p className="text-muted-foreground">
            Contas a pagar e a receber
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <TrendingDown className="mr-2 h-4 w-4" />
            Nova Conta a Pagar
          </Button>
          <Button>
            <TrendingUp className="mr-2 h-4 w-4" />
            Nova Conta a Receber
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              A Pagar (Pendente)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(totalPagar)}
            </p>
            <p className="text-xs text-muted-foreground">
              {contasPagar.filter(c => c.status === "pendente").length} contas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              A Pagar (Vencidas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-800">
              {formatCurrency(totalPagarVencidas)}
            </p>
            <p className="text-xs text-muted-foreground">
              {contasPagar.filter(c => c.status === "vencida").length} contas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              A Receber (Pendente)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(totalReceber)}
            </p>
            <p className="text-xs text-muted-foreground">
              {contasReceber.filter(c => c.status === "pendente").length} contas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              A Receber (Vencidas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">
              {formatCurrency(totalReceberVencidas)}
            </p>
            <p className="text-xs text-muted-foreground">
              {contasReceber.filter(c => c.status === "vencida").length} contas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Saldo Projetado */}
      <Card className={totalReceber - totalPagar >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Saldo Projetado</span>
            <Badge variant={totalReceber - totalPagar >= 0 ? "default" : "destructive"} className="text-lg px-3 py-1">
              {formatCurrency(totalReceber - totalPagar)}
            </Badge>
          </CardTitle>
          <CardDescription>
            Diferença entre contas a receber e a pagar (pendentes)
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="pagar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pagar">
            <TrendingDown className="mr-2 h-4 w-4" />
            Contas a Pagar
          </TabsTrigger>
          <TabsTrigger value="receber">
            <TrendingUp className="mr-2 h-4 w-4" />
            Contas a Receber
          </TabsTrigger>
        </TabsList>

        {/* Tab Contas a Pagar */}
        <TabsContent value="pagar" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contas a Pagar</CardTitle>
                  <CardDescription>
                    {contasPagar.length} contas cadastradas
                  </CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar..." className="pl-9 w-64" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-center">Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contasPagar.map((conta) => {
                    const diasVenc = calcularDiasVencimento(conta.vencimento);
                    const status = getStatusBadge(conta.status);

                    return (
                      <TableRow key={conta.id}>
                        <TableCell>
                          <p className="font-medium">{conta.descricao}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{conta.fornecedor}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{conta.categoria}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {formatDate(conta.vencimento)}
                            </p>
                            {conta.status === "pendente" && (
                              <p className={`text-xs ${
                                diasVenc < 3 ? "text-orange-600" : "text-muted-foreground"
                              }`}>
                                {diasVenc === 0 ? "Vence hoje" : diasVenc > 0 ? `${diasVenc} dias` : `${Math.abs(diasVenc)} dias atrás`}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-bold">{formatCurrency(conta.valor)}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={status.variant} className="flex items-center gap-1 w-fit mx-auto">
                            {status.icon}
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {conta.status === "pendente" && (
                            <Button size="sm" variant="outline">
                              Pagar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Contas a Receber */}
        <TabsContent value="receber" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contas a Receber</CardTitle>
                  <CardDescription>
                    {contasReceber.length} contas cadastradas
                  </CardDescription>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Buscar..." className="pl-9 w-64" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-center">Parcela</TableHead>
                    <TableHead className="text-center">Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contasReceber.map((conta) => {
                    const diasVenc = calcularDiasVencimento(conta.vencimento);
                    const status = getStatusBadge(conta.status);

                    return (
                      <TableRow key={conta.id}>
                        <TableCell>
                          <p className="font-medium">{conta.descricao}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{conta.cliente}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{conta.parcela}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {formatDate(conta.vencimento)}
                            </p>
                            {conta.status === "pendente" && (
                              <p className={`text-xs ${
                                diasVenc < 3 ? "text-orange-600" : "text-muted-foreground"
                              }`}>
                                {diasVenc === 0 ? "Vence hoje" : diasVenc > 0 ? `${diasVenc} dias` : `${Math.abs(diasVenc)} dias atrás`}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="font-bold">{formatCurrency(conta.valor)}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={status.variant} className="flex items-center gap-1 w-fit mx-auto">
                            {status.icon}
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {conta.status === "pendente" && (
                            <Button size="sm">
                              Receber
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
