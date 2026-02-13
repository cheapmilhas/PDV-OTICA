"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { TrendingUp, Users, ShoppingCart, Clock } from "lucide-react";

type PeriodType = "today" | "week" | "month" | "quarter" | "year";

interface DashboardSummary {
  revenue: {
    current: number;
    previous: number;
    growth: number;
  };
  sales: {
    current: number;
    previous: number;
    growth: number;
  };
  customers: {
    current: number;
    previous: number;
    growth: number;
  };
  peakHour: {
    hour: number;
    count: number;
    revenue: number;
  };
}

interface ProductReport {
  ranking: Array<{
    productId: string;
    name: string;
    sku: string;
    category: string | null;
    revenue: number;
    quantity: number;
    averagePrice: number;
  }>;
  byCategory: Array<{
    category: string;
    revenue: number;
    quantity: number;
    products: number;
  }>;
}

interface CustomerReport {
  byAge: Array<{
    range: string;
    count: number;
    revenue: number;
  }>;
  byGender: Array<{
    gender: string;
    count: number;
    revenue: number;
  }>;
  byCity: Array<{
    city: string;
    count: number;
    revenue: number;
  }>;
}

interface TemporalReport {
  data: Array<{
    group: string;
    count: number;
    revenue: number;
  }>;
}

interface OpticalReport {
  lensTypes: Array<{
    type: string;
    count: number;
    revenue: number;
  }>;
  sphericalRanges: {
    left: Array<{
      range: string;
      count: number;
    }>;
    right: Array<{
      range: string;
      count: number;
    }>;
  };
  presbyopia: {
    count: number;
    percentage: number;
  };
}

const periodLabels: Record<PeriodType, string> = {
  today: "Hoje",
  week: "Esta Semana",
  month: "Este Mês",
  quarter: "Este Trimestre",
  year: "Este Ano",
};

export default function ReportsPage() {
  const [period, setPeriod] = useState<PeriodType>("month");
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [products, setProducts] = useState<ProductReport | null>(null);
  const [customers, setCustomers] = useState<CustomerReport | null>(null);
  const [temporal, setTemporal] = useState<TemporalReport | null>(null);
  const [optical, setOptical] = useState<OpticalReport | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });

      const [dashRes, prodRes, custRes, tempRes, optRes] = await Promise.all([
        fetch(`/api/reports/dashboard?${params}`),
        fetch(`/api/reports/products?${params}&limit=10`),
        fetch(`/api/reports/customers?${params}`),
        fetch(`/api/reports/temporal?${params}&groupBy=dayOfWeek`),
        fetch(`/api/reports/optical?${params}`),
      ]);

      if (!dashRes.ok || !prodRes.ok || !custRes.ok || !tempRes.ok || !optRes.ok) {
        throw new Error("Erro ao carregar relatórios");
      }

      const [dashData, prodData, custData, tempData, optData] = await Promise.all([
        dashRes.json(),
        prodRes.json(),
        custRes.json(),
        tempRes.json(),
        optRes.json(),
      ]);

      setDashboard(dashData.data);
      setProducts(prodData.data);
      setCustomers(custData.data);
      setTemporal(tempData.data);
      setOptical(optData.data);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os relatórios.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function getGrowthColor(growth: number) {
    if (growth > 0) return "text-green-600";
    if (growth < 0) return "text-red-600";
    return "text-gray-600";
  }

  function getGrowthSign(growth: number) {
    if (growth > 0) return "+";
    return "";
  }

  return (
    <ProtectedRoute
      permission={["reports.sales", "reports.financial", "reports.inventory", "reports.customers"]}
      requireAny
      message="Você não tem permissão para acessar relatórios. Entre em contato com o administrador do sistema."
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Relatórios e Tendências</h1>
            <p className="text-muted-foreground">Análise de vendas, clientes e produtos</p>
          </div>
          <div className="flex gap-2">
            {(["today", "week", "month", "quarter", "year"] as PeriodType[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                onClick={() => setPeriod(p)}
                size="sm"
              >
                {periodLabels[p]}
              </Button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        {dashboard && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(dashboard.revenue.current)}</div>
                <p className={`text-xs ${getGrowthColor(dashboard.revenue.growth)}`}>
                  {getGrowthSign(dashboard.revenue.growth)}
                  {dashboard.revenue.growth.toFixed(1)}% vs período anterior
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vendas</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.sales.current}</div>
                <p className={`text-xs ${getGrowthColor(dashboard.sales.growth)}`}>
                  {getGrowthSign(dashboard.sales.growth)}
                  {dashboard.sales.growth.toFixed(1)}% vs período anterior
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Novos Clientes</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.customers.current}</div>
                <p className={`text-xs ${getGrowthColor(dashboard.customers.growth)}`}>
                  {getGrowthSign(dashboard.customers.growth)}
                  {dashboard.customers.growth.toFixed(1)}% vs período anterior
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Horário de Pico</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.peakHour.hour}h</div>
                <p className="text-xs text-muted-foreground">
                  {dashboard.peakHour.count} vendas - {formatCurrency(dashboard.peakHour.revenue)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="products" className="space-y-4">
          <TabsList>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="customers">Clientes</TabsTrigger>
            <TabsTrigger value="temporal">Temporal</TabsTrigger>
            <TabsTrigger value="optical">Óptico</TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ranking de Produtos</CardTitle>
                <CardDescription>Top 10 produtos por faturamento no período</CardDescription>
              </CardHeader>
              <CardContent>
                {products && products.ranking.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Preço Médio</TableHead>
                        <TableHead className="text-right">Faturamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.ranking.map((item, idx) => (
                        <TableRow key={item.productId}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.sku}</TableCell>
                          <TableCell>{item.category || "-"}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.averagePrice)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.revenue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nenhum dado disponível</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Vendas por Categoria</CardTitle>
                <CardDescription>Distribuição do faturamento por categoria</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {products && products.byCategory.length > 0 ? (
                  products.byCategory.map((cat) => {
                    const maxRevenue = Math.max(...products.byCategory.map((c) => c.revenue));
                    const percentage = (cat.revenue / maxRevenue) * 100;
                    return (
                      <div key={cat.category} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{cat.category}</span>
                          <span className="text-muted-foreground">
                            {cat.products} produtos • {cat.quantity} un
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress value={percentage} className="flex-1" />
                          <span className="font-medium min-w-[100px] text-right">
                            {formatCurrency(cat.revenue)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nenhum dado disponível</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Por Faixa Etária</CardTitle>
                  <CardDescription>Distribuição de clientes e faturamento</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {customers && customers.byAge.length > 0 ? (
                    customers.byAge.map((age) => {
                      const maxRevenue = Math.max(...customers.byAge.map((a) => a.revenue));
                      const percentage = (age.revenue / maxRevenue) * 100;
                      return (
                        <div key={age.range} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{age.range}</span>
                            <span className="text-muted-foreground">{age.count} clientes</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={percentage} className="flex-1" />
                            <span className="text-sm min-w-[80px] text-right">
                              {formatCurrency(age.revenue)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-muted-foreground py-4">Nenhum dado</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Por Gênero</CardTitle>
                  <CardDescription>Distribuição de clientes e faturamento</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {customers && customers.byGender.length > 0 ? (
                    customers.byGender.map((gender) => {
                      const maxRevenue = Math.max(...customers.byGender.map((g) => g.revenue));
                      const percentage = (gender.revenue / maxRevenue) * 100;
                      const genderLabels: Record<string, string> = {
                        M: "Masculino",
                        F: "Feminino",
                        OTHER: "Outro",
                        UNKNOWN: "Não Informado",
                      };
                      return (
                        <div key={gender.gender} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{genderLabels[gender.gender] || gender.gender}</span>
                            <span className="text-muted-foreground">{gender.count} clientes</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={percentage} className="flex-1" />
                            <span className="text-sm min-w-[80px] text-right">
                              {formatCurrency(gender.revenue)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-muted-foreground py-4">Nenhum dado</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Por Cidade</CardTitle>
                  <CardDescription>Top cidades por faturamento</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {customers && customers.byCity.length > 0 ? (
                    customers.byCity.slice(0, 5).map((city) => {
                      const maxRevenue = Math.max(...customers.byCity.map((c) => c.revenue));
                      const percentage = (city.revenue / maxRevenue) * 100;
                      return (
                        <div key={city.city} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{city.city}</span>
                            <span className="text-muted-foreground">{city.count} clientes</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={percentage} className="flex-1" />
                            <span className="text-sm min-w-[80px] text-right">
                              {formatCurrency(city.revenue)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-muted-foreground py-4">Nenhum dado</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Temporal Tab */}
          <TabsContent value="temporal" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Vendas por Dia da Semana</CardTitle>
                <CardDescription>Padrão de vendas ao longo da semana</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {temporal && temporal.data.length > 0 ? (
                  temporal.data.map((item) => {
                    const maxRevenue = Math.max(...temporal.data.map((d) => d.revenue));
                    const percentage = (item.revenue / maxRevenue) * 100;
                    const dayLabels: Record<string, string> = {
                      "1": "Segunda-feira",
                      "2": "Terça-feira",
                      "3": "Quarta-feira",
                      "4": "Quinta-feira",
                      "5": "Sexta-feira",
                      "6": "Sábado",
                      "0": "Domingo",
                    };
                    return (
                      <div key={item.group} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{dayLabels[item.group] || item.group}</span>
                          <span className="text-muted-foreground">{item.count} vendas</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress value={percentage} className="flex-1" />
                          <span className="font-medium min-w-[100px] text-right">
                            {formatCurrency(item.revenue)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nenhum dado disponível</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Optical Tab */}
          <TabsContent value="optical" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Tipos de Lente</CardTitle>
                  <CardDescription>Distribuição por tipo de lente vendida</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {optical && optical.lensTypes.length > 0 ? (
                    optical.lensTypes.map((lens) => {
                      const maxRevenue = Math.max(...optical.lensTypes.map((l) => l.revenue));
                      const percentage = (lens.revenue / maxRevenue) * 100;
                      const lensLabels: Record<string, string> = {
                        SINGLE_VISION: "Monofocal",
                        BIFOCAL: "Bifocal",
                        PROGRESSIVE: "Progressiva",
                        CONTACT: "Contato",
                      };
                      return (
                        <div key={lens.type} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{lensLabels[lens.type] || lens.type}</span>
                            <span className="text-muted-foreground">{lens.count} vendas</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={percentage} className="flex-1" />
                            <span className="text-sm min-w-[100px] text-right">
                              {formatCurrency(lens.revenue)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-muted-foreground py-4">Nenhum dado</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Presbiopia</CardTitle>
                  <CardDescription>Clientes com presbiopia (vista cansada)</CardDescription>
                </CardHeader>
                <CardContent>
                  {optical && optical.presbyopia ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-4xl font-bold">{optical.presbyopia.count}</div>
                        <p className="text-sm text-muted-foreground">
                          {optical.presbyopia.percentage.toFixed(1)}% dos clientes
                        </p>
                      </div>
                      <Progress value={optical.presbyopia.percentage} />
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">Nenhum dado</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Grau Esférico</CardTitle>
                <CardDescription>Faixas de grau mais comuns</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium mb-3">Olho Esquerdo</h4>
                    <div className="space-y-2">
                      {optical && optical.sphericalRanges.left.length > 0 ? (
                        optical.sphericalRanges.left.map((range) => {
                          const maxCount = Math.max(
                            ...optical.sphericalRanges.left.map((r) => r.count),
                            ...optical.sphericalRanges.right.map((r) => r.count)
                          );
                          const percentage = (range.count / maxCount) * 100;
                          return (
                            <div key={range.range} className="flex items-center gap-3">
                              <span className="text-sm font-medium min-w-[100px]">{range.range}</span>
                              <Progress value={percentage} className="flex-1" />
                              <span className="text-sm text-muted-foreground min-w-[40px] text-right">
                                {range.count}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-muted-foreground py-4">Nenhum dado</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Olho Direito</h4>
                    <div className="space-y-2">
                      {optical && optical.sphericalRanges.right.length > 0 ? (
                        optical.sphericalRanges.right.map((range) => {
                          const maxCount = Math.max(
                            ...optical.sphericalRanges.left.map((r) => r.count),
                            ...optical.sphericalRanges.right.map((r) => r.count)
                          );
                          const percentage = (range.count / maxCount) * 100;
                          return (
                            <div key={range.range} className="flex items-center gap-3">
                              <span className="text-sm font-medium min-w-[100px]">{range.range}</span>
                              <Progress value={percentage} className="flex-1" />
                              <span className="text-sm text-muted-foreground min-w-[40px] text-right">
                                {range.count}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-muted-foreground py-4">Nenhum dado</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
