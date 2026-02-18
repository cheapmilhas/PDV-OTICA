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
  Loader2,
  CreditCard,
  Wrench,
  FlaskConical,
  FileText,
  ClipboardList,
  FileEdit,
  Wallet,
  Warehouse,
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
  const [metrics, setMetrics] = useState({
    salesToday: 0,
    salesYesterday: 0,
    salesMonth: 0,
    salesLastMonth: 0,
    salesMonthAccumulated: 0,
    customersTotal: 0,
    customersNew: 0,
    productsLowStock: 0,
    productsLowStockList: [] as Array<{ id: string; name: string; stockQty: number; stockMin: number }>,
    productsTotal: 0,
    salesCount: 0,
    avgTicket: 0,
    goalMonth: 0,
    osOpen: 0,
    osPending: 0,
    osDelayed: 0,
    osNearDeadline: 0,
    osDelayedList: [] as Array<{ id: string; number: number; promisedDate: string; customer: { name: string } }>,
  });
  const [loading, setLoading] = useState(true);

  // Buscar todos os dados da API
  useEffect(() => {
    const loadAllData = async () => {
      try {
        // Métricas
        const metricsRes = await fetch('/api/dashboard/metrics');
        const metricsData = await metricsRes.json();
        setMetrics(metricsData.metrics);

        // Vendas recentes (hoje)
        const salesRes = await fetch('/api/sales?pageSize=5&sortBy=createdAt&sortOrder=desc');
        const salesData = await salesRes.json();
        setRecentSales(salesData.data || []);

        // Produtos com estoque baixo
        const productsRes = await fetch('/api/products?lowStock=true&pageSize=4');
        const productsData = await productsRes.json();
        setLowStockProducts(productsData.data || []);

        // Ordens de serviço urgentes (buscar apenas APPROVED por enquanto)
        const osRes = await fetch('/api/service-orders?orderStatus=APPROVED&sortBy=promisedDate&sortOrder=asc&pageSize=3');
        const osData = await osRes.json();
        setOsUrgentes(osData.data || []);

        // Vendas dos últimos 7 dias (para gráfico)
        const salesChartRes = await fetch('/api/dashboard/sales-last-7-days');
        const salesChartData = await salesChartRes.json();
        setSalesChartData(salesChartData.data || []);

        // Top 5 produtos mais vendidos (para gráfico)
        const topProductsRes = await fetch('/api/dashboard/top-products');
        const topProductsData = await topProductsRes.json();
        setTopProductsData(topProductsData.data || []);

        // Distribuição de métodos de pagamento (para gráfico)
        const paymentDistRes = await fetch('/api/dashboard/payment-distribution');
        const paymentDistData = await paymentDistRes.json();
        setPaymentMethodsData(paymentDistData.data || []);

        setLoading(false);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        setLoading(false);
      }
    };

    loadAllData();
  }, []);

  // Atualizar relógio a cada minuto
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Calcular crescimento percentual
  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const monthGrowth = calculateGrowth(metrics.salesMonth, metrics.salesLastMonth);
  const monthProgress = (metrics.salesMonth / metrics.goalMonth) * 100;

  // Estados para dados dinâmicos
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [osUrgentes, setOsUrgentes] = useState<any[]>([]);
  const [salesChartData, setSalesChartData] = useState<any[]>([]);
  const [accumulatedSalesData, setAccumulatedSalesData] = useState<any[]>([]);
  const [topProductsData, setTopProductsData] = useState<any[]>([]);
  const [paymentMethodsData, setPaymentMethodsData] = useState<any[]>([]);

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
      {/* Header com Hora */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm hidden md:block">
            Visão geral das operações da ótica
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5 text-muted-foreground justify-end">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">
              {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-muted-foreground justify-end">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">
              {currentTime.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground md:hidden">
            {currentTime.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
          </p>
        </div>
      </div>

      {/* ===== MOBILE ONLY: Alertas ===== */}
      {(metrics.productsLowStock > 0 || metrics.osDelayed > 0) && (
        <div className="md:hidden space-y-2">
          {metrics.productsLowStock > 0 && (
            <Link href="/dashboard/estoque">
              <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-800">Estoque mínimo</span>
                </div>
                <span className="text-sm font-bold text-orange-700">{metrics.productsLowStock} produtos</span>
              </div>
            </Link>
          )}
          {metrics.osDelayed > 0 && (
            <Link href="/dashboard/ordens-servico?filter=atrasadas">
              <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-800">OS Atrasadas</span>
                </div>
                <span className="text-sm font-bold text-red-700">{metrics.osDelayed} OS</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ===== MOBILE ONLY: Grid de Ações Rápidas ===== */}
      <div className="md:hidden">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Acesso Rápido</p>
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: ShoppingCart, label: "PDV", href: "/dashboard/pdv", color: "bg-green-500" },
            { icon: FileText, label: "Vendas", href: "/dashboard/vendas", color: "bg-blue-500" },
            { icon: Users, label: "Clientes", href: "/dashboard/clientes", color: "bg-purple-500" },
            { icon: Warehouse, label: "Estoque", href: "/dashboard/estoque", color: "bg-orange-500" },
            { icon: ClipboardList, label: "OS", href: "/dashboard/ordens-servico", color: "bg-indigo-500" },
            { icon: FileEdit, label: "Orçamentos", href: "/dashboard/orcamentos", color: "bg-cyan-500" },
            { icon: DollarSign, label: "Financeiro", href: "/dashboard/financeiro", color: "bg-emerald-500" },
            { icon: Wallet, label: "Caixa", href: "/dashboard/caixa", color: "bg-amber-500" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1.5">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${item.color} shadow-sm`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="metrics-grid grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      {/* Alertas Críticos: OS Atrasadas */}
      {(metrics.osDelayed > 0 || metrics.osNearDeadline > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {metrics.osDelayed > 0 && (
            <Link href="/dashboard/ordens-servico?filter=atrasadas">
              <Card className="border-red-300 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-5 w-5" />
                    OS Atrasadas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-700 mb-2">{metrics.osDelayed}</div>
                  {metrics.osDelayedList.length > 0 && (
                    <div className="space-y-1">
                      {metrics.osDelayedList.slice(0, 3).map((os) => (
                        <p key={os.id} className="text-xs text-red-600">
                          OS #{String(os.number).padStart(5, "0")} — {os.customer?.name}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-red-500 mt-2 font-medium">Clique para ver todas →</p>
                </CardContent>
              </Card>
            </Link>
          )}
          {metrics.osNearDeadline > 0 && (
            <Link href="/dashboard/ordens-servico?filter=vencendo">
              <Card className="border-yellow-300 bg-yellow-50 cursor-pointer hover:bg-yellow-100 transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-yellow-700">
                    <Clock className="h-5 w-5" />
                    Vencem em 3 Dias
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-yellow-700 mb-2">{metrics.osNearDeadline}</div>
                  <p className="text-xs text-yellow-600 font-medium">Clique para ver todas →</p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

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
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : lowStockProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum produto com estoque baixo
                </p>
              ) : (
                lowStockProducts.map((product) => (
                  <div key={product.id} className="flex items-center justify-between rounded-lg border border-orange-200 bg-white p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {product.sku} • Mínimo: {product.stockMin}
                      </p>
                    </div>
                    <Badge variant="destructive">
                      {product.stockQty} un.
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Ordens de Serviço */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-blue-600" />
                <span>Ordens de Serviço</span>
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
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : osUrgentes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma OS com prazo próximo
                </p>
              ) : (
                osUrgentes.map((os: any) => {
                  const prazo = os.promisedDate ? new Date(os.promisedDate) : null;
                  const hoje = new Date();
                  const dias = prazo ? Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <div key={os.id} className="flex items-center justify-between rounded-lg border border-blue-200 bg-white p-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-mono font-medium">OS #{String(os.number).padStart(5, "0")}</p>
                          <Badge variant="outline">{os.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {os.customer?.name || 'Cliente não informado'}
                        </p>
                      </div>
                      <div className="text-right">
                        {dias !== null && (
                          <Badge variant={dias <= 0 ? "destructive" : dias <= 3 ? "secondary" : "outline"}>
                            {dias <= 0 ? "Atrasada" : `${dias}d`}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  {metrics.osOpen} em andamento
                </span>
                <span className="text-sm text-muted-foreground">
                  {metrics.osPending} no laboratório
                </span>
                {metrics.osDelayed > 0 && (
                  <span className="text-sm text-red-600 font-medium">
                    {metrics.osDelayed} atrasadas
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Card Comparação de Períodos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Comparação de Períodos</CardTitle>
              <CardDescription className="mt-1">
                Período atual vs período anterior
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Comparação Período Atual vs Anterior */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border bg-blue-50 p-4">
                  <div className="w-full">
                    <p className="text-xs text-muted-foreground">PERÍODO ATUAL</p>
                    <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                    <div className="mt-2">
                      <p className="text-2xl font-bold">{formatCurrency(metrics.salesMonth)}</p>
                      <Progress value={monthProgress} className="mt-2 h-2" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {monthProgress.toFixed(2)}% da meta
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
                  <div className="w-full">
                    <p className="text-xs text-muted-foreground">PERÍODO ANTERIOR</p>
                    <p className="text-sm text-muted-foreground">Mês passado</p>
                    <div className="mt-2">
                      <p className="text-2xl font-bold">{formatCurrency(metrics.salesLastMonth)}</p>
                      {Number(crescimentoMes) >= 0 ? (
                        <div className="flex items-center gap-1 mt-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="text-sm text-green-600 font-medium">
                            +{crescimentoMes}% de crescimento
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-2">
                          <TrendingDown className="h-4 w-4 text-red-600" />
                          <span className="text-sm text-red-600 font-medium">
                            {crescimentoMes}% de variação
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts - Dados vindos do banco */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Vendas dos Últimos 7 Dias</CardTitle>
            <CardDescription>Evolução do faturamento semanal</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : salesChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <ShoppingBag className="h-12 w-12 opacity-20 mb-2" />
                <p>Dados insuficientes para gerar gráfico</p>
                <p className="text-sm mt-1">Realize vendas para visualizar</p>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>

        {/* Top Products Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Produtos Mais Vendidos</CardTitle>
            <CardDescription>Top 5 do mês</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : topProductsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <Package className="h-12 w-12 opacity-20 mb-2" />
                <p>Dados insuficientes para gerar gráfico</p>
                <p className="text-sm mt-1">Realize vendas para visualizar</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProductsData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="vendas" fill="#82ca9d" name="Vendas" />
                </BarChart>
              </ResponsiveContainer>
            )}
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
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma venda hoje
                </p>
              ) : (
                recentSales.map((sale: any) => {
                  const saleTime = sale.createdAt ? new Date(sale.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                  const paymentMethod = sale.payments?.[0]?.method || 'N/A';

                  return (
                    <div key={sale.id} className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{sale.customer?.name || 'Cliente não informado'}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{saleTime}</p>
                          <Separator orientation="vertical" className="h-3" />
                          <Badge variant="outline" className="text-xs">
                            {paymentMethod}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatCurrency(sale.total)}</p>
                      </div>
                    </div>
                  );
                })
              )}
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
            {loading ? (
              <div className="flex items-center justify-center h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : paymentMethodsData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <CreditCard className="h-12 w-12 opacity-20 mb-2" />
                <p>Dados insuficientes para gerar gráfico</p>
                <p className="text-sm mt-1">Realize vendas para visualizar</p>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
