"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import {
  Download,
  TrendingUp,
  Loader2,
  DollarSign,
  ShoppingBag,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [resumoMensal, setResumoMensal] = useState({
    vendas: 0,
    lucro: 0,
    crescimento: 0,
    ticketMedio: 0,
    totalVendas: 0,
    novosClientes: 0,
  });
  const [vendasMensais, setVendasMensais] = useState<any[]>([]);
  const [vendasCategoria, setVendasCategoria] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [topProdutos, setTopProdutos] = useState<any[]>([]);
  const [topVendedores, setTopVendedores] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Buscar todos os dados em paralelo
        const [summaryRes, evolutionRes, categoryRes, paymentsRes, productsRes, teamRes] = await Promise.all([
          fetch('/api/reports/summary'),
          fetch('/api/reports/sales-evolution?months=6'),
          fetch('/api/reports/category-distribution'),
          fetch('/api/reports/payment-methods'),
          fetch('/api/reports/top-products?limit=3'),
          fetch('/api/reports/team-performance'),
        ]);

        const [summary, evolution, category, payments, products, team] = await Promise.all([
          summaryRes.json(),
          evolutionRes.json(),
          categoryRes.json(),
          paymentsRes.json(),
          productsRes.json(),
          teamRes.json(),
        ]);

        setResumoMensal(summary.summary || resumoMensal);
        setVendasMensais(evolution.data || []);
        setVendasCategoria(category.data || []);
        setPagamentos(payments.data || []);
        setTopProdutos(products.data || []);
        setTopVendedores(team.data || []);

        setLoading(false);
      } catch (error) {
        console.error('Erro ao carregar relatórios:', error);
        toast.error('Erro ao carregar relatórios');
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground">
            Análises e métricas do negócio
          </p>
        </div>
        <Button>
          <Download className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      {/* Resumo Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas do Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(resumoMensal.vendas)}</div>
            <div className="flex items-center gap-1 text-xs">
              <TrendingUp className="h-3 w-3 text-green-600" />
              <span className="text-green-600 font-medium">+{resumoMensal.crescimento}%</span>
              <span className="text-muted-foreground">vs mês anterior</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lucro Bruto</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(resumoMensal.lucro)}
            </div>
            <p className="text-xs text-muted-foreground">
              Margem de {((resumoMensal.lucro / resumoMensal.vendas) * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Vendas</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumoMensal.totalVendas}</div>
            <p className="text-xs text-muted-foreground">
              Ticket médio: {formatCurrency(resumoMensal.ticketMedio)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Novos Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{resumoMensal.novosClientes}</div>
            <p className="text-xs text-muted-foreground">
              Cadastrados este mês
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs com diferentes relatórios */}
      <Tabs defaultValue="vendas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>

        {/* Tab Vendas */}
        <TabsContent value="vendas" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Evolução de Vendas</CardTitle>
                <CardDescription>Últimos 6 meses</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : vendasMensais.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <p className="text-muted-foreground">Nenhum dado disponível</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={vendasMensais}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                      <Legend />
                      <Line type="monotone" dataKey="vendas" stroke="#8884d8" strokeWidth={2} name="Vendas" />
                      <Line type="monotone" dataKey="lucro" stroke="#82ca9d" strokeWidth={2} name="Lucro" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Vendas por Categoria</CardTitle>
                <CardDescription>Distribuição de produtos vendidos</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : vendasCategoria.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <p className="text-muted-foreground">Nenhum dado disponível</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={vendasCategoria}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {vendasCategoria.map((entry, index) => (
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
        </TabsContent>

        {/* Tab Produtos */}
        <TabsContent value="produtos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance de Produtos</CardTitle>
              <CardDescription>Análise de vendas por produto</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : topProdutos.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum produto vendido este mês</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    {topProdutos.map((produto, index) => (
                      <div key={index} className="flex items-center justify-between rounded-lg border p-4">
                        <div>
                          <p className="font-medium">{produto.name}</p>
                          <p className="text-sm text-muted-foreground">{produto.unidadesVendidas} unidades vendidas</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatCurrency(produto.valorTotal)}</p>
                          <Badge variant={index === 0 ? "default" : "secondary"}>Top #{produto.rank}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Pagamentos */}
        <TabsContent value="pagamentos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Métodos de Pagamento</CardTitle>
              <CardDescription>Distribuição por forma de pagamento</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : pagamentos.length === 0 ? (
                <div className="flex items-center justify-center h-[300px]">
                  <p className="text-muted-foreground">Nenhum dado disponível</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pagamentos}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="metodo" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="valor" fill="#8884d8" name="Valor Total" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Equipe */}
        <TabsContent value="equipe" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance da Equipe</CardTitle>
              <CardDescription>Ranking de vendedores do mês</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : topVendedores.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma venda registrada este mês</p>
              ) : (
                <div className="space-y-3">
                  {topVendedores.map((vendedor, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                          {index + 1}º
                        </div>
                        <div>
                          <p className="font-medium">{vendedor.nome}</p>
                          <p className="text-sm text-muted-foreground">{vendedor.vendas} vendas realizadas</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{formatCurrency(vendedor.valor)}</p>
                        <p className="text-sm text-muted-foreground">
                          Ticket médio: {formatCurrency(vendedor.ticketMedio)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
