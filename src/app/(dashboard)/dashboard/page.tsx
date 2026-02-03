"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Eye,
  ArrowRight,
  Calendar,
  Target,
  ShoppingBag,
  Percent,
  CheckCircle2,
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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import Link from "next/link";

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Atualizar relógio a cada minuto
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Mock data - será substituído por dados reais do banco
  const metrics = {
    salesToday: 4850.00,
    salesYesterday: 3920.00,
    salesMonth: 14380.00,
    salesLastMonth: 660.00,
    salesMonthAccumulated: 75400.20,
    customersTotal: 342,
    customersNew: 12,
    productsLowStock: 12,
    productsTotal: 156,
    salesCount: 23,
    avgTicket: 545.50,
    goalMonth: 75400.20,
    osOpen: 8,
    osPending: 3,
  };

  // Calcular crescimento percentual
  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const monthGrowth = calculateGrowth(metrics.salesMonth, metrics.salesLastMonth);
  const monthProgress = (metrics.salesMonth / metrics.goalMonth) * 100;

  const recentSales = [
    { id: "1", customer: "Maria Silva", value: 450.00, status: "completed", time: "14:30", paymentMethod: "Crédito" },
    { id: "2", customer: "João Santos", value: 1200.00, status: "completed", time: "13:15", paymentMethod: "PIX" },
    { id: "3", customer: "Ana Costa", value: 680.00, status: "completed", time: "11:45", paymentMethod: "Débito" },
    { id: "4", customer: "Carlos Lima", value: 899.90, status: "completed", time: "10:20", paymentMethod: "Crédito" },
    { id: "5", customer: "Fernanda Souza", value: 1580.00, status: "completed", time: "09:30", paymentMethod: "Crédito" },
  ];

  const lowStockProducts = [
    { id: "1", name: "Ray-Ban Aviador Clássico", stock: 2, min: 5, categoria: "Armações" },
    { id: "2", name: "Lente Transitions Gen 8", stock: 1, min: 3, categoria: "Lentes" },
    { id: "3", name: "Oakley Holbrook", stock: 3, min: 5, categoria: "Armações" },
    { id: "4", name: "Lente Multifocal Varilux", stock: 1, min: 2, categoria: "Lentes" },
  ];

  const osUrgentes = [
    { id: "OS-001", cliente: "Maria Silva Santos", tipo: "Montagem", prazo: "2024-02-02", dias: 1 },
    { id: "OS-004", cliente: "Carlos Eduardo Lima", tipo: "Reparo", prazo: "2024-02-01", dias: 0 },
    { id: "OS-007", cliente: "Paula Fernandes", tipo: "Ajuste", prazo: "2024-02-03", dias: 2 },
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

  // Dados para gráfico acumulativo mensal (como no SSÓtica)
  const accumulatedSalesData = [
    { dia: 1, atual: 880, anterior: 650 },
    { dia: 2, atual: 1920, anterior: 1180 },
    { dia: 3, atual: 4200, anterior: 1850 },
    { dia: 4, atual: 5800, anterior: 2400 },
    { dia: 5, atual: 7650, anterior: 3100 },
    { dia: 6, atual: 9420, anterior: 3850 },
    { dia: 7, atual: 10580, anterior: 4200 },
    { dia: 8, atual: 11840, anterior: 4650 },
    { dia: 9, atual: 12920, anterior: 5100 },
    { dia: 10, atual: 14380, anterior: 5450 },
  ];

  // Dados para produtos mais vendidos
  const topProductsData = [
    { name: "Ray-Ban Aviador", vendas: 45 },
    { name: "Lentes AR", vendas: 38 },
    { name: "Oakley Sport", vendas: 32 },
    { name: "Armação Infantil", vendas: 28 },
    { name: "Óculos de Sol", vendas: 25 },
  ];

  // Dados para métodos de pagamento
  const paymentMethodsData = [
    { name: "Crédito", value: 45, color: "#8884d8" },
    { name: "PIX", value: 30, color: "#82ca9d" },
    { name: "Débito", value: 20, color: "#ffc658" },
    { name: "Dinheiro", value: 5, color: "#ff8042" },
  ];

  const calcularCrescimento = (atual: number, anterior: number) => {
    const crescimento = ((atual - anterior) / anterior) * 100;
    return crescimento.toFixed(1);
  };

  const calcularProgressoMeta = () => {
    return (metrics.salesMonth / metrics.goalMonth) * 100;
  };

  const crescimentoDia = calcularCrescimento(metrics.salesToday, metrics.salesYesterday);
  const crescimentoMes = calcularCrescimento(metrics.salesMonth, metrics.salesLastMonth);
  const progressoMeta = calcularProgressoMeta();

  return (
    <div className="space-y-6">
      {/* Aviso/Notificação - Estilo SSÓtica */}
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-200">
              <AlertTriangle className="h-5 w-5 text-yellow-700" />
            </div>
            <div>
              <p className="font-medium text-yellow-900">
                <strong>Aviso:</strong> Estamos adotando uma nova política de senhas para proteger ainda mais sua conta. Atualize sua senha agora e mantenha sua segurança em dia.
              </p>
            </div>
          </div>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
            Alterar Senha
          </Button>
        </div>
      </div>

      {/* Header com Hora */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral das operações da ótica
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm">
              {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">
              {currentTime.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          </div>
        </div>
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
            <div className="flex items-center gap-1 text-xs mt-1">
              {Number(crescimentoDia) >= 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-green-600 font-medium">+{crescimentoDia}%</span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 text-red-600" />
                  <span className="text-red-600 font-medium">{crescimentoDia}%</span>
                </>
              )}
              <span className="text-muted-foreground">vs ontem</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.salesCount} vendas • Ticket: {formatCurrency(metrics.avgTicket)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Período Atual</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.salesMonth)}</div>
            <div className="flex items-center gap-1 text-xs mt-1">
              {monthGrowth >= 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 text-green-600" />
                  <span className="text-green-600 font-medium">+{monthGrowth.toFixed(2)}%</span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 text-red-600" />
                  <span className="text-red-600 font-medium">{monthGrowth.toFixed(2)}%</span>
                </>
              )}
              <span className="text-muted-foreground">vs mês anterior</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.customersTotal}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{metrics.customersNew} novos este mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estoque</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.productsTotal}</div>
            <div className="flex items-center gap-1 text-xs mt-1">
              <AlertTriangle className="h-3 w-3 text-orange-600" />
              <span className="text-orange-600 font-medium">
                {metrics.productsLowStock} com estoque baixo
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Meta do Mês */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Meta do Mês
              </CardTitle>
              <CardDescription>
                Acompanhe o progresso em relação à meta estabelecida
              </CardDescription>
            </div>
            <Badge variant={progressoMeta >= 100 ? "default" : "secondary"} className="text-lg px-3 py-1">
              {progressoMeta.toFixed(1)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progressoMeta} className="h-3" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Realizado: {formatCurrency(metrics.salesMonth)}
            </span>
            <span className="font-medium">
              Meta: {formatCurrency(metrics.goalMonth)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Faltam: {formatCurrency(metrics.goalMonth - metrics.salesMonth)}
            </span>
            {progressoMeta >= 100 && (
              <span className="text-green-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Meta atingida!
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alertas e OS Urgentes */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Produtos em Estoque Baixo */}
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <span>Produtos em Estoque Baixo</span>
              </div>
              <Link href="/dashboard/estoque">
                <Button variant="outline" size="sm">
                  Ver Todos
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between rounded-lg border border-orange-200 bg-white p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.categoria} • Mínimo: {product.min}
                    </p>
                  </div>
                  <Badge variant="destructive">
                    {product.stock} un.
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Ordens de Serviço Urgentes */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <span>Ordens de Serviço Urgentes</span>
              </div>
              <Link href="/dashboard/ordens-servico">
                <Button variant="outline" size="sm">
                  Ver Todas
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {osUrgentes.map((os) => (
                <div key={os.id} className="flex items-center justify-between rounded-lg border border-blue-200 bg-white p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-mono font-medium">{os.id}</p>
                      <Badge variant="outline">{os.tipo}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {os.cliente}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={os.dias === 0 ? "destructive" : "secondary"}>
                      {os.dias === 0 ? "Hoje" : `${os.dias}d`}
                    </Badge>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  {metrics.osOpen} OS em andamento
                </span>
                <span className="text-sm text-muted-foreground">
                  {metrics.osPending} aguardando material
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Card Vendas Acumuladas - Estilo SSÓtica */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">VENDAS ACUMULADAS</CardTitle>
              <CardDescription className="mt-1">
                Total de vendas acumuladas no mês anterior: {formatCurrency(metrics.salesMonthAccumulated)}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Mês anterior</Button>
              <Button variant="outline" size="sm">Fevereiro de 2025</Button>
              <Button variant="outline" size="sm">Últimos 12 meses</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Comparação Período Atual vs Anterior */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border bg-blue-50 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">PERÍODO ATUAL</p>
                    <p className="text-sm text-muted-foreground">01/02 a 03/02</p>
                    <div className="mt-2">
                      <p className="text-2xl font-bold">{formatCurrency(metrics.salesMonth)}</p>
                      <Progress value={monthProgress} className="mt-2 h-2" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {monthProgress.toFixed(2)}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(metrics.salesMonth)} / {formatCurrency(metrics.goalMonth)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">PERÍODO ANTERIOR</p>
                    <p className="text-sm text-muted-foreground">01/01 a 03/01</p>
                    <div className="mt-2">
                      <p className="text-2xl font-bold">{formatCurrency(metrics.salesLastMonth)}</p>
                      <Progress value={0.88} className="mt-2 h-2" />
                      <p className="mt-1 text-xs text-muted-foreground">0,88%</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(metrics.salesLastMonth)} / {formatCurrency(metrics.goalMonth)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Gráfico Acumulativo */}
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={accumulatedSalesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dia" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  <Line
                    type="monotone"
                    dataKey="atual"
                    stroke="#FF8C42"
                    strokeWidth={2}
                    name="Período Atual"
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="anterior"
                    stroke="#4A90E2"
                    strokeWidth={2}
                    name="Período Anterior"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Vendas dos Últimos 7 Dias</CardTitle>
            <CardDescription>Evolução do faturamento semanal</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip
                  formatter={(value: any, name?: string) => {
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
            <CardDescription>Top 5 do mês</CardDescription>
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
            <div className="flex items-center justify-between">
              <CardTitle>Últimas Vendas</CardTitle>
              <Link href="/dashboard/pdv">
                <Button variant="ghost" size="sm">
                  <Eye className="mr-2 h-4 w-4" />
                  Ver Todas
                </Button>
              </Link>
            </div>
            <CardDescription>Vendas realizadas hoje</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{sale.customer}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">{sale.time}</p>
                      <Separator orientation="vertical" className="h-3" />
                      <Badge variant="outline" className="text-xs">
                        {sale.paymentMethod}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatCurrency(sale.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle>Métodos de Pagamento</CardTitle>
            <CardDescription>Distribuição das formas de pagamento</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentMethodsData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentMethodsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
