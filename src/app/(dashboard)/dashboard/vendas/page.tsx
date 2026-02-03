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
import {
  Search,
  Eye,
  Printer,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Download,
  CreditCard,
  Calendar,
  User,
  Package,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function VendasPage() {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todas");

  // Mock data - vendas
  const vendas = [
    {
      id: "1",
      numero: "VD-0001",
      data: "2024-02-03T14:30:00",
      cliente: "Maria Silva Santos",
      cpf: "123.456.789-01",
      vendedor: "Carlos Vendedor",
      itens: 2,
      subtotal: 1479.80,
      desconto: 0,
      total: 1479.80,
      formaPagamento: "PIX",
      parcelas: null,
      status: "concluida",
    },
    {
      id: "2",
      numero: "VD-0002",
      data: "2024-02-03T15:45:00",
      cliente: "João Pedro Oliveira",
      cpf: "234.567.890-12",
      vendedor: "Maria Atendente",
      itens: 1,
      subtotal: 899.90,
      desconto: 50.00,
      total: 849.90,
      formaPagamento: "Crédito",
      parcelas: 3,
      status: "concluida",
    },
    {
      id: "3",
      numero: "VD-0003",
      data: "2024-02-03T16:20:00",
      cliente: "Ana Paula Costa",
      cpf: "345.678.901-23",
      vendedor: "Carlos Vendedor",
      itens: 3,
      subtotal: 1180.00,
      desconto: 0,
      total: 1180.00,
      formaPagamento: "Dinheiro",
      parcelas: null,
      status: "concluida",
    },
    {
      id: "4",
      numero: "VD-0004",
      data: "2024-02-03T17:10:00",
      cliente: "Carlos Eduardo Lima",
      cpf: "456.789.012-34",
      vendedor: "João Caixa",
      itens: 4,
      subtotal: 640.00,
      desconto: 40.00,
      total: 600.00,
      formaPagamento: "Débito",
      parcelas: null,
      status: "concluida",
    },
    {
      id: "5",
      numero: "VD-0005",
      data: "2024-02-02T11:30:00",
      cliente: "Fernanda Souza",
      cpf: "567.890.123-45",
      vendedor: "Maria Atendente",
      itens: 1,
      subtotal: 1249.90,
      desconto: 0,
      total: 1249.90,
      formaPagamento: "Crédito",
      parcelas: 6,
      status: "concluida",
    },
    {
      id: "6",
      numero: "VD-0006",
      data: "2024-02-02T14:00:00",
      cliente: "Roberto Santos",
      cpf: "678.901.234-56",
      vendedor: "Carlos Vendedor",
      itens: 2,
      subtotal: 325.00,
      desconto: 25.00,
      total: 300.00,
      formaPagamento: "PIX",
      parcelas: null,
      status: "cancelada",
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "concluida":
        return { variant: "default" as const, label: "Concluída", icon: <CheckCircle2 className="h-3 w-3" /> };
      case "pendente":
        return { variant: "secondary" as const, label: "Pendente", icon: <Clock className="h-3 w-3" /> };
      case "cancelada":
        return { variant: "destructive" as const, label: "Cancelada", icon: <XCircle className="h-3 w-3" /> };
      default:
        return { variant: "outline" as const, label: status, icon: null };
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const vendasFiltradas = vendas.filter((venda) => {
    const matchBusca =
      venda.numero.toLowerCase().includes(busca.toLowerCase()) ||
      venda.cliente.toLowerCase().includes(busca.toLowerCase()) ||
      venda.cpf.includes(busca);

    const matchStatus = filtroStatus === "todas" || venda.status === filtroStatus;

    return matchBusca && matchStatus;
  });

  const totalVendas = vendasFiltradas.filter(v => v.status === "concluida").length;
  const totalFaturamento = vendasFiltradas
    .filter(v => v.status === "concluida")
    .reduce((acc, v) => acc + v.total, 0);
  const ticketMedio = totalVendas > 0 ? totalFaturamento / totalVendas : 0;
  const totalCanceladas = vendasFiltradas.filter(v => v.status === "cancelada").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendas</h1>
          <p className="text-muted-foreground">
            Histórico e gerenciamento de vendas realizadas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalVendas}</p>
            <p className="text-xs text-muted-foreground">
              {totalCanceladas} canceladas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(totalFaturamento)}
            </p>
            <p className="text-xs text-muted-foreground">
              Vendas concluídas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket Médio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(ticketMedio)}
            </p>
            <p className="text-xs text-muted-foreground">
              Por venda
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Itens Vendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {vendasFiltradas.filter(v => v.status === "concluida").reduce((acc, v) => acc + v.itens, 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Total de produtos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Busque e filtre as vendas realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, cliente ou CPF..."
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Tabs value={filtroStatus} onValueChange={setFiltroStatus}>
              <TabsList>
                <TabsTrigger value="todas">Todas</TabsTrigger>
                <TabsTrigger value="concluida">Concluídas</TabsTrigger>
                <TabsTrigger value="cancelada">Canceladas</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Vendas */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Vendas</CardTitle>
          <CardDescription>
            {vendasFiltradas.length} vendas encontradas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendasFiltradas.map((venda) => {
                const status = getStatusBadge(venda.status);

                return (
                  <TableRow key={venda.id}>
                    <TableCell>
                      <div>
                        <p className="font-mono font-medium">{venda.numero}</p>
                        <p className="text-xs text-muted-foreground">
                          {venda.cpf}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatDate(venda.data)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{venda.cliente}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground">{venda.vendedor}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{venda.itens}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="text-sm">{formatCurrency(venda.subtotal)}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      {venda.desconto > 0 ? (
                        <p className="text-sm text-green-600">-{formatCurrency(venda.desconto)}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="font-bold">{formatCurrency(venda.total)}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{venda.formaPagamento}</p>
                          {venda.parcelas && (
                            <p className="text-xs text-muted-foreground">
                              {venda.parcelas}x de {formatCurrency(venda.total / venda.parcelas)}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={status.variant} className="flex items-center gap-1 w-fit mx-auto">
                        {status.icon}
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
