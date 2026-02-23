"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react";
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
import { format } from "date-fns";

interface ProductNoMovementData {
  productId: string;
  sku: string;
  productName: string;
  categoryName: string | null;
  brandName: string | null;
  type: string;
  currentStock: number;
  costPrice: number;
  salePrice: number;
  stockValue: number;
  daysWithoutMovement: number;
  lastMovementDate: Date | null;
  lastMovementType: string | null;
  lastSaleDate: Date | null;
}

interface ReportData {
  summary: {
    totalProducts: number;
    totalStockValue: number;
    totalStockQty: number;
    averageDaysWithoutMovement: number;
    productsNeverSold: number;
  };
  products: ProductNoMovementData[];
  categoryBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    productCount: number;
    stockValue: number;
  }>;
  typeBreakdown: Array<{
    type: string;
    productCount: number;
    stockValue: number;
  }>;
  daysRangeBreakdown: Array<{
    range: string;
    count: number;
    value: number;
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

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  FRAME: "Armação",
  LENS: "Lente",
  SUNGLASSES: "Óculos de Sol",
  ACCESSORY: "Acessório",
  SERVICE: "Serviço",
  OTHER: "Outro",
};

export default function RelatorioProdutosSemGiroPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [days, setDays] = useState(90);
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
        days: days.toString(),
      });

      if (categoryId && categoryId !== "ALL") params.set("categoryId", categoryId);
      if (brandId && brandId !== "ALL") params.set("brandId", brandId);
      if (productType && productType !== "ALL") params.set("productType", productType);

      const res = await fetch(`/api/reports/stock/no-movement?${params}`);
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
      title: "Produtos sem Giro",
      subtitle: `${data.summary.totalProducts} produtos parados | Valor imobilizado: ${formatCurrency(data.summary.totalStockValue)} | Média: ${data.summary.averageDaysWithoutMovement} dias | Nunca vendidos: ${data.summary.productsNeverSold}`,
      sections: [
        {
          title: "Distribuição por Período",
          columns: [
            { header: "Período", key: "range" },
            { header: "Produtos", key: "count", format: "number" },
            { header: "Valor", key: "value", format: "currency" },
          ],
          data: data.daysRangeBreakdown,
        },
        {
          title: "Valor por Categoria",
          columns: [
            { header: "Categoria", key: "categoryName" },
            { header: "Produtos", key: "productCount", format: "number" },
            { header: "Valor Estoque", key: "stockValue", format: "currency" },
          ],
          data: data.categoryBreakdown,
        },
        {
          title: `Produtos Detalhados (${data.products.length})`,
          columns: [
            { header: "SKU", key: "sku" },
            { header: "Produto", key: "productName" },
            { header: "Categoria", key: "categoryName" },
            { header: "Tipo", key: "type" },
            { header: "Estoque", key: "currentStock", format: "number" },
            { header: "Custo", key: "costPrice", format: "currency" },
            { header: "Valor Estoque", key: "stockValue", format: "currency" },
            { header: "Dias Parado", key: "daysLabel" },
            { header: "Última Venda", key: "lastSaleLabel" },
          ],
          data: data.products.map((p) => ({
            ...p,
            categoryName: p.categoryName || "N/A",
            type: PRODUCT_TYPE_LABELS[p.type] || p.type,
            daysLabel: p.daysWithoutMovement === 9999 ? "Nunca" : `${p.daysWithoutMovement} dias`,
            lastSaleLabel: p.lastSaleDate
              ? format(new Date(p.lastSaleDate), "dd/MM/yyyy")
              : "Nunca",
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
          "Estoque Atual": product.currentStock,
          "Preço Custo": product.costPrice,
          "Valor Estoque": product.stockValue,
          "Dias sem Movimento": product.daysWithoutMovement === 9999 ? "Nunca vendido" : product.daysWithoutMovement,
          "Última Venda": product.lastSaleDate
            ? format(new Date(product.lastSaleDate), "dd/MM/yyyy")
            : "Nunca",
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Produtos sem Giro");
      XLSX.writeFile(
        wb,
        `relatorio-produtos-sem-giro-${format(new Date(), "yyyy-MM-dd")}.xlsx`
      );
    });
  };

  useEffect(() => {
    fetchReport();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Produtos sem Giro</h1>
          <p className="text-muted-foreground">
            Identificação de produtos parados no estoque
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
              <Label>Dias sem Movimento</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 90)}
              />
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
          </div>

          <div className="mt-4">
            <Button onClick={fetchReport} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                "Atualizar Relatório"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Produtos Parados"
              value={data.summary.totalProducts}
              subtitle={`${data.summary.totalStockQty} unidades`}
              icon={AlertTriangle}
            />
            <KPICard
              title="Valor Imobilizado"
              value={formatCurrency(data.summary.totalStockValue)}
              icon={DollarSign}
            />
            <KPICard
              title="Média de Dias Parados"
              value={data.summary.averageDaysWithoutMovement}
              icon={Clock}
            />
            <KPICard
              title="Nunca Vendidos"
              value={data.summary.productsNeverSold}
              subtitle="Produtos sem venda"
              icon={Package}
            />
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Days Range Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por Período</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.daysRangeBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="Produtos" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Valor por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.categoryBreakdown}
                      dataKey="stockValue"
                      nameKey="categoryName"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={(entry: any) =>
                        `${entry.categoryName}: ${formatCurrency(entry.stockValue)}`
                      }
                    >
                      {data.categoryBreakdown.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
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
                      <th className="text-left p-2">SKU</th>
                      <th className="text-left p-2">Produto</th>
                      <th className="text-left p-2">Categoria</th>
                      <th className="text-center p-2">Estoque</th>
                      <th className="text-right p-2">Valor Estoque</th>
                      <th className="text-center p-2">Dias Parado</th>
                      <th className="text-center p-2">Última Venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.slice(0, 100).map((product) => (
                      <tr
                        key={product.productId}
                        className="border-b hover:bg-muted/50"
                      >
                        <td className="p-2 font-mono text-xs">{product.sku}</td>
                        <td className="p-2">{product.productName}</td>
                        <td className="p-2">{product.categoryName || "—"}</td>
                        <td className="p-2 text-center font-medium">
                          {product.currentStock}
                        </td>
                        <td className="p-2 text-right font-medium">
                          {formatCurrency(product.stockValue)}
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              product.daysWithoutMovement === 9999
                                ? "bg-red-100 text-red-800"
                                : product.daysWithoutMovement > 180
                                ? "bg-orange-100 text-orange-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {product.daysWithoutMovement === 9999
                              ? "Nunca"
                              : `${product.daysWithoutMovement}d`}
                          </span>
                        </td>
                        <td className="p-2 text-center text-muted-foreground">
                          {product.lastSaleDate
                            ? format(new Date(product.lastSaleDate), "dd/MM/yyyy")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.products.length > 100 && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    Mostrando 100 de {data.products.length} produtos. Use os
                    filtros para refinar.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
