"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KPICard } from "@/components/reports/kpi-card";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  Package,
  DollarSign,
  TrendingUp,
  CalendarIcon,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ProductTopSellerData {
  productId: string;
  productName: string;
  sku: string;
  categoryName: string | null;
  brandName: string | null;
  type: string;
  qtySold: number;
  revenue: number;
  totalCost: number;
  margin: number;
  marginPercent: number;
  abcClass: "A" | "B" | "C";
}

interface ReportData {
  summary: {
    totalProducts: number;
    totalRevenue: number;
    totalCost: number;
    averageMargin: number;
    classACount: number;
    classBCount: number;
    classCCount: number;
  };
  products: ProductTopSellerData[];
  abcDistribution: Array<{
    class: "A" | "B" | "C";
    count: number;
    revenue: number;
    percentage: number;
  }>;
  categoryBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    revenue: number;
    productCount: number;
  }>;
}

interface Category {
  id: string;
  name: string;
}

interface Brand {
  id: string;
  name: string;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

const ABC_COLORS = {
  A: "#22c55e",
  B: "#f59e0b",
  C: "#ef4444",
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  FRAME: "Armação",
  LENS: "Lente",
  SUNGLASSES: "Óculos de Sol",
  ACCESSORY: "Acessório",
  SERVICE: "Serviço",
  OTHER: "Outro",
};

export default function RelatorioProdutosVendidosPage() {
  const [startDate, setStartDate] = useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(100);

  // Filters
  const [categoryId, setCategoryId] = useState<string>("ALL");
  const [brandId, setBrandId] = useState<string>("ALL");
  const [productType, setProductType] = useState<string>("ALL");

  // Options for selects
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);

  useEffect(() => {
    // Fetch categories and brands
    const fetchOptions = async () => {
      try {
        const [categoriesRes, brandsRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/brands"),
        ]);

        if (categoriesRes.ok) {
          const categoriesData = await categoriesRes.json();
          // Handle both array and paginated response
          if (Array.isArray(categoriesData)) {
            setCategories(categoriesData);
          } else if (categoriesData.data && Array.isArray(categoriesData.data)) {
            setCategories(categoriesData.data);
          } else {
            setCategories([]);
          }
        }

        if (brandsRes.ok) {
          const brandsData = await brandsRes.json();
          // Handle both array and paginated response
          if (Array.isArray(brandsData)) {
            setBrands(brandsData);
          } else if (brandsData.data && Array.isArray(brandsData.data)) {
            setBrands(brandsData.data);
          } else {
            setBrands([]);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar opções:", error);
      }
    };

    fetchOptions();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
        limit: limit.toString(),
      });

      if (categoryId && categoryId !== "ALL") params.set("categoryId", categoryId);
      if (brandId && brandId !== "ALL") params.set("brandId", brandId);
      if (productType && productType !== "ALL") params.set("productType", productType);

      const res = await fetch(`/api/reports/products/top-sellers?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao gerar relatório");
      }

      const reportData = await res.json();
      setData(reportData);
      toast.success("Relatório gerado com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!data) return;
    const { exportToPDF } = await import("@/lib/report-export");
    await exportToPDF({
      title: "Produtos Vendidos (Top Sellers)",
      subtitle: `Total: ${data.summary.totalProducts} produtos | Receita: ${formatCurrency(data.summary.totalRevenue)} | Custo: ${formatCurrency(data.summary.totalCost)} | Margem Média: ${data.summary.averageMargin.toFixed(2)}%`,
      period: { start: startDate, end: endDate },
      sections: [
        {
          title: "Classificação ABC",
          columns: [
            { header: "Classe", key: "class" },
            { header: "Produtos", key: "count", format: "number" },
            { header: "Receita", key: "revenue", format: "currency" },
            { header: "% do Total", key: "percentage", format: "percent" },
          ],
          data: data.abcDistribution,
        },
        {
          title: `Produtos Detalhados (${data.products.length})`,
          columns: [
            { header: "ABC", key: "abcClass" },
            { header: "SKU", key: "sku" },
            { header: "Produto", key: "productName" },
            { header: "Categoria", key: "categoryName" },
            { header: "Marca", key: "brandName" },
            { header: "Qtd", key: "qtySold", format: "number" },
            { header: "Receita", key: "revenue", format: "currency" },
            { header: "Custo", key: "totalCost", format: "currency" },
            { header: "Margem", key: "margin", format: "currency" },
            { header: "Margem %", key: "marginPercent", format: "percent" },
          ],
          data: data.products.map((p) => ({
            ...p,
            categoryName: p.categoryName || "N/A",
            brandName: p.brandName || "N/A",
          })),
        },
      ],
    });
  };

  const handleExportExcel = () => {
    if (!data) return;

    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        data.products.map((product) => ({
          SKU: product.sku,
          Produto: product.productName,
          Categoria: product.categoryName || "N/A",
          Marca: product.brandName || "N/A",
          Tipo: PRODUCT_TYPE_LABELS[product.type] || product.type,
          "Qtd Vendida": product.qtySold,
          Receita: product.revenue,
          Custo: product.totalCost,
          Margem: product.margin,
          "Margem %": product.marginPercent.toFixed(2) + "%",
          "Classe ABC": product.abcClass,
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Produtos Vendidos");
      XLSX.writeFile(
        wb,
        `relatorio-produtos-vendidos-${format(new Date(), "yyyy-MM-dd")}.xlsx`
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Produtos Vendidos (Top Sellers)</h1>
          <p className="text-muted-foreground">
            Análise de produtos mais vendidos com classificação ABC
          </p>
        </div>
        <ExportButtons
          onExportPDF={handleExportPDF}
          onExportExcel={handleExportExcel}
          disabled={!data}
        />
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Data Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Marca</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Produto</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {Object.entries(PRODUCT_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Limite de Produtos</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
              />
            </div>

            <div className="space-y-2 flex items-end">
              <Button onClick={fetchReport} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  "Gerar Relatório"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Total de Produtos"
              value={data.summary.totalProducts}
              subtitle={`${data.summary.classACount}A / ${data.summary.classBCount}B / ${data.summary.classCCount}C`}
              icon={Package}
            />
            <KPICard
              title="Receita Total"
              value={formatCurrency(data.summary.totalRevenue)}
              icon={DollarSign}
            />
            <KPICard
              title="Custo Total"
              value={formatCurrency(data.summary.totalCost)}
              icon={DollarSign}
            />
            <KPICard
              title="Margem Média"
              value={`${data.summary.averageMargin.toFixed(2)}%`}
              icon={TrendingUp}
            />
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top 10 Produtos */}
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Produtos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.products.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="productName"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis />
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Receita" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Curva ABC */}
            <Card>
              <CardHeader>
                <CardTitle>Classificação ABC</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.abcDistribution}
                      dataKey="revenue"
                      nameKey="class"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry: any) =>
                        `Classe ${entry.class}: ${entry.percentage.toFixed(1)}%`
                      }
                    >
                      {data.abcDistribution.map((entry) => (
                        <Cell
                          key={`cell-${entry.class}`}
                          fill={ABC_COLORS[entry.class]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {data.abcDistribution.map((item) => (
                    <div
                      key={item.class}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: ABC_COLORS[item.class] }}
                        />
                        <span>Classe {item.class}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {item.count} produtos ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Categorias */}
            {data.categoryBreakdown.length > 0 && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Vendas por Categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.categoryBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="categoryName" />
                      <YAxis />
                      <Tooltip formatter={(value: any) => formatCurrency(value)} />
                      <Legend />
                      <Bar dataKey="revenue" name="Receita" fill="#00C49F" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Tabela de Produtos */}
          <Card>
            <CardHeader>
              <CardTitle>Produtos Detalhados ({data.products.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">ABC</th>
                      <th className="text-left p-2">SKU</th>
                      <th className="text-left p-2">Produto</th>
                      <th className="text-left p-2">Categoria</th>
                      <th className="text-left p-2">Marca</th>
                      <th className="text-center p-2">Qtd</th>
                      <th className="text-right p-2">Receita</th>
                      <th className="text-right p-2">Custo</th>
                      <th className="text-right p-2">Margem</th>
                      <th className="text-right p-2">Margem %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((product) => (
                      <tr key={product.productId} className="border-b hover:bg-muted/50">
                        <td className="p-2">
                          <span
                            className="px-2 py-1 rounded text-xs font-bold text-white"
                            style={{
                              backgroundColor: ABC_COLORS[product.abcClass],
                            }}
                          >
                            {product.abcClass}
                          </span>
                        </td>
                        <td className="p-2 font-mono text-xs">{product.sku}</td>
                        <td className="p-2">{product.productName}</td>
                        <td className="p-2">{product.categoryName || "—"}</td>
                        <td className="p-2">{product.brandName || "—"}</td>
                        <td className="p-2 text-center font-medium">
                          {product.qtySold}
                        </td>
                        <td className="p-2 text-right font-medium">
                          {formatCurrency(product.revenue)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(product.totalCost)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(product.margin)}
                        </td>
                        <td className="p-2 text-right">
                          <span
                            className={
                              product.marginPercent >= 30
                                ? "text-green-600 font-medium"
                                : product.marginPercent >= 15
                                ? "text-yellow-600"
                                : "text-red-600"
                            }
                          >
                            {product.marginPercent.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecione o período e clique em "Gerar Relatório" para visualizar os
            dados
          </CardContent>
        </Card>
      )}
    </div>
  );
}
