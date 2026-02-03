"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

export default function DashboardPage() {
  // Mock data - será substituído por dados reais do banco
  const metrics = {
    salesToday: 4850.00,
    salesMonth: 125340.50,
    customersTotal: 342,
    productsLowStock: 12,
    salesCount: 23,
    avgTicket: 545.50,
  };

  const recentSales = [
    { id: "1", customer: "Maria Silva", value: 450.00, status: "completed", time: "14:30" },
    { id: "2", customer: "João Santos", value: 1200.00, status: "completed", time: "13:15" },
    { id: "3", customer: "Ana Costa", value: 680.00, status: "completed", time: "11:45" },
    { id: "4", customer: "Carlos Lima", value: 899.90, status: "completed", time: "10:20" },
    { id: "5", customer: "Fernanda Souza", value: 1580.00, status: "completed", time: "09:30" },
  ];

  const lowStockProducts = [
    { id: "1", name: "Ray-Ban Aviador Clássico", stock: 2, min: 5 },
    { id: "2", name: "Lente Transitions Gen 8", stock: 1, min: 3 },
    { id: "3", name: "Oakley Holbrook", stock: 3, min: 5 },
    { id: "4", name: "Tommy Hilfiger TH 1770", stock: 1, min: 5 },
  ];

  // Dados para gráfico de vendas dos últimos 7 dias
  const salesChartData = [
    { day: "Seg", vendas: 8, valor: 6850 },
    { day: "Ter", vendas: 12, valor: 9240 },
    { day: "Qua", vendas: 15, valor: 12350 },
    { day: "Qui", vendas: 10, valor: 8450 },
    { day: "Sex", vendas: 18, valor: 15890 },
    { day: "Sáb", vendas: 22, valor: 18750 },
    { day: "Dom", vendas: 5, valor: 4200 },
  ];

  // Dados para produtos mais vendidos
  const topProductsData = [
    { name: "Ray-Ban Aviador", vendas: 45 },
    { name: "Lentes AR", vendas: 38 },
    { name: "Oakley Sport", vendas: 32 },
    { name: "Armação Infantil", vendas: 28 },
    { name: "Óculos de Sol", vendas: 25 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral das operações da ótica
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas Hoje</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.salesToday)}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.salesCount} vendas realizadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas do Mês</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.salesMonth)}</div>
            <p className="text-xs text-muted-foreground">
              +12% em relação ao mês anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.customersTotal}</div>
            <p className="text-xs text-muted-foreground">
              Total de clientes cadastrados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estoque Baixo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{metrics.productsLowStock}</div>
            <p className="text-xs text-muted-foreground">
              Produtos precisam reposição
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Vendas dos Últimos 7 Dias</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === "valor") return formatCurrency(value);
                    return value;
                  }}
                  labelFormatter={(label) => `Dia: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="#8884d8"
                  strokeWidth={2}
                  name="Valor (R$)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Products Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Produtos Mais Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topProductsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="vendas" fill="#82ca9d" name="Vendas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle>Últimas Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{sale.customer}</p>
                    <p className="text-xs text-muted-foreground">{sale.time}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatCurrency(sale.value)}</p>
                    <Badge variant="secondary" className="mt-1">
                      Concluída
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Produtos em Estoque Baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lowStockProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Mínimo: {product.min} unidades
                    </p>
                  </div>
                  <Badge variant="destructive">
                    {product.stock} em estoque
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
