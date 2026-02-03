"use client";

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
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Users,
  Package,
} from "lucide-react";

export default function RelatoriosPage() {
  // Dados de vendas por mês
  const vendasMensais = [
    { mes: "Jan", vendas: 85420, lucro: 42710 },
    { mes: "Fev", vendas: 92350, lucro: 46175 },
    { mes: "Mar", vendas: 78900, lucro: 39450 },
    { mes: "Abr", vendas: 95600, lucro: 47800 },
    { mes: "Mai", vendas: 102340, lucro: 51170 },
    { mes: "Jun", vendas: 125340, lucro: 62670 },
  ];

  // Vendas por categoria
  const vendasCategoria = [
    { name: "Armações", value: 45, color: "#8884d8" },
    { name: "Lentes", value: 30, color: "#82ca9d" },
    { name: "Óculos de Sol", value: 20, color: "#ffc658" },
    { name: "Acessórios", value: 5, color: "#ff8042" },
  ];

  // Top vendedores
  const topVendedores = [
    { nome: "Carlos Vendedor", vendas: 45, valor: 52340 },
    { nome: "Maria Atendente", vendas: 38, valor: 45220 },
    { nome: "João Caixa", vendas: 32, valor: 38900 },
  ];

  // Métodos de pagamento
  const pagamentos = [
    { metodo: "Crédito", quantidade: 45, valor: 67500 },
    { metodo: "Débito", quantidade: 25, valor: 28750 },
    { metodo: "PIX", quantidade: 30, valor: 35400 },
    { metodo: "Dinheiro", quantidade: 20, valor: 15600 },
  ];

  const resumoMensal = {
    vendas: 125340.50,
    lucro: 62670.25,
    crescimento: 12.5,
    ticketMedio: 545.50,
    totalVendas: 230,
    novosClientes: 45,
  };

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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Vendas por Categoria</CardTitle>
                <CardDescription>Distribuição de produtos vendidos</CardDescription>
              </CardHeader>
              <CardContent>
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
              <div className="space-y-4">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Ray-Ban Aviador Clássico</p>
                      <p className="text-sm text-muted-foreground">45 unidades vendidas</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(40495.50)}</p>
                      <Badge variant="default">Top #1</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Lente Transitions Gen 8</p>
                      <p className="text-sm text-muted-foreground">38 unidades vendidas</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(22040.00)}</p>
                      <Badge variant="secondary">Top #2</Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Oakley Holbrook</p>
                      <p className="text-sm text-muted-foreground">32 unidades vendidas</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(39996.80)}</p>
                      <Badge variant="secondary">Top #3</Badge>
                    </div>
                  </div>
                </div>
              </div>
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
                        Ticket médio: {formatCurrency(vendedor.valor / vendedor.vendas)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
