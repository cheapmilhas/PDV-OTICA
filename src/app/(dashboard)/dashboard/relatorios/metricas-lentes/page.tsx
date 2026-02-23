"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KPICard } from "@/components/reports/kpi-card";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  Eye,
  FlaskConical,
  Loader2,
  ArrowLeft,
  CalendarIcon,
  Activity,
  Package,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
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
  ResponsiveContainer,
  Legend,
} from "recharts";

interface LensType {
  type: string;
  count: number;
  revenue: number;
}

interface SphericalRange {
  range: string;
  count: number;
}

interface OpticalData {
  lensTypes: LensType[];
  sphericalRanges: {
    left: SphericalRange[];
    right: SphericalRange[];
  };
  presbyopia: {
    count: number;
    percentage: number;
  };
}

interface LabData {
  id: string;
  name: string;
  orderCount: number;
  deliveredCount: number;
  avgLeadDays: number | null;
}

interface Segment {
  type: string;
  label: string;
  revenue: number;
  cost: number;
  margin: number;
  qty: number;
  count: number;
}

interface LabsData {
  topLabs: LabData[];
  segments: Segment[];
  summary: {
    totalOS: number;
    totalRevenue: number;
    lensRevenue: number;
    lensPercentage: number;
  };
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

const LENS_TYPE_LABELS: Record<string, string> = {
  SINGLE_VISION: "Visão Simples",
  PROGRESSIVE: "Progressiva",
  BIFOCAL: "Bifocal",
  OTHER: "Outras",
};

export default function MetricasLentesPage() {
  const [loading, setLoading] = useState(false);
  const [optical, setOptical] = useState<OpticalData | null>(null);
  const [labsData, setLabsData] = useState<LabsData | null>(null);
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        period: "custom",
      });

      const [opticalRes, labsRes] = await Promise.all([
        fetch(`/api/reports/optical?${params}`),
        fetch(`/api/reports/optical/labs?${params}`),
      ]);

      if (!opticalRes.ok || !labsRes.ok) {
        throw new Error("Erro ao carregar dados");
      }

      const opticalJson = await opticalRes.json();
      const labsJson = await labsRes.json();

      setOptical(opticalJson.data);
      setLabsData(labsJson.data);
    } catch (error) {
      toast.error("Erro ao carregar métricas de lentes");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!optical || !labsData) return;
    const XLSX = await import("xlsx");

    // Sheet 1: Resumo
    const resumo = [
      ["Métrica", "Valor"],
      ["Total de OS", labsData.summary.totalOS],
      ["Receita Total", labsData.summary.totalRevenue],
      ["Receita de Lentes", labsData.summary.lensRevenue],
      ["% Lentes sobre Total", `${labsData.summary.lensPercentage.toFixed(1)}%`],
      ["Prescrições com Adição", optical.presbyopia.count],
      ["% Presbiopia", `${optical.presbyopia.percentage.toFixed(1)}%`],
    ];

    // Sheet 2: Tipos de Lente
    const lentes = [
      ["Tipo", "Quantidade", "Receita (R$)"],
      ...optical.lensTypes.map((l) => [
        LENS_TYPE_LABELS[l.type] || l.type,
        l.count,
        l.revenue,
      ]),
    ];

    // Sheet 3: Top Laboratórios
    const labs = [
      ["Laboratório", "Nº de OS", "Entregues", "Prazo Médio (dias)"],
      ...labsData.topLabs.map((l) => [
        l.name,
        l.orderCount,
        l.deliveredCount,
        l.avgLeadDays ?? "N/A",
      ]),
    ];

    // Sheet 4: Receita por Segmento
    const segmentos = [
      ["Segmento", "Receita (R$)", "Custo (R$)", "Margem (%)", "Qtd Itens"],
      ...labsData.segments.map((s) => [
        s.label,
        s.revenue,
        s.cost,
        `${s.margin.toFixed(1)}%`,
        s.qty,
      ]),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lentes), "Tipos de Lente");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(labs), "Laboratórios");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(segmentos), "Segmentos");

    const fileName = `metricas-lentes-${format(startDate, "yyyy-MM-dd")}_${format(endDate, "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleExportPDF = async () => {
    if (!optical || !labsData) return;
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(18);
    doc.text("Métricas de Lentes", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(
      `Período: ${format(startDate, "dd/MM/yyyy")} a ${format(endDate, "dd/MM/yyyy")}`,
      pageWidth / 2, 28, { align: "center" }
    );

    // KPIs
    doc.setFontSize(12);
    doc.text("Resumo", 14, 40);
    autoTable(doc, {
      startY: 44,
      head: [["Métrica", "Valor"]],
      body: [
        ["Total de OS", String(labsData.summary.totalOS)],
        ["Receita Total", formatCurrency(labsData.summary.totalRevenue)],
        ["Receita de Lentes", formatCurrency(labsData.summary.lensRevenue)],
        ["% Lentes sobre Total", `${labsData.summary.lensPercentage.toFixed(1)}%`],
        ["Prescrições com Adição", String(optical.presbyopia.count)],
        ["% Presbiopia", `${optical.presbyopia.percentage.toFixed(1)}%`],
      ],
      theme: "grid",
      styles: { fontSize: 9 },
    });

    // Tipos de Lente
    const y1 = (doc as any).lastAutoTable.finalY + 10;
    doc.text("Tipos de Lente", 14, y1);
    autoTable(doc, {
      startY: y1 + 4,
      head: [["Tipo", "Quantidade", "Receita"]],
      body: optical.lensTypes.map((l) => [
        LENS_TYPE_LABELS[l.type] || l.type,
        String(l.count),
        formatCurrency(l.revenue),
      ]),
      theme: "grid",
      styles: { fontSize: 9 },
    });

    // Top Labs
    const y2 = (doc as any).lastAutoTable.finalY + 10;
    doc.text("Top Laboratórios", 14, y2);
    autoTable(doc, {
      startY: y2 + 4,
      head: [["Laboratório", "Nº OS", "Entregues", "Prazo Médio"]],
      body: labsData.topLabs.map((l) => [
        l.name,
        String(l.orderCount),
        String(l.deliveredCount),
        l.avgLeadDays ? `${l.avgLeadDays} dias` : "N/A",
      ]),
      theme: "grid",
      styles: { fontSize: 9 },
    });

    // Segmentos
    const y3 = (doc as any).lastAutoTable.finalY + 10;
    if (y3 > 250) doc.addPage();
    const y3final = y3 > 250 ? 20 : y3;
    doc.text("Receita por Segmento", 14, y3final);
    autoTable(doc, {
      startY: y3final + 4,
      head: [["Segmento", "Receita", "Custo", "Margem", "Qtd"]],
      body: labsData.segments.map((s) => [
        s.label,
        formatCurrency(s.revenue),
        formatCurrency(s.cost),
        `${s.margin.toFixed(1)}%`,
        String(s.qty),
      ]),
      theme: "grid",
      styles: { fontSize: 9 },
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(
        `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")} - Página ${i} de ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: "center" }
      );
    }

    doc.save(`metricas-lentes-${format(startDate, "yyyy-MM-dd")}.pdf`);
  };

  const hasData = optical && labsData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/relatorios">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Métricas de Lentes</h1>
            <p className="text-muted-foreground">
              Análise de prescrições, laboratórios e segmentos óticos
            </p>
          </div>
        </div>
        {hasData && (
          <ExportButtons
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
            disabled={loading}
          />
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[180px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(startDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => d && setStartDate(d)}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[180px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(endDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => d && setEndDate(d)}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button onClick={fetchData} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Gerar Relatório
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {/* Dados */}
      {hasData && !loading && (
        <>
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KPICard
              title="Ordens de Serviço"
              value={labsData.summary.totalOS}
              subtitle="No período selecionado"
              icon={Activity}
            />
            <KPICard
              title="Receita Total"
              value={formatCurrency(labsData.summary.totalRevenue)}
              subtitle="Todas as categorias"
              icon={Package}
            />
            <KPICard
              title="Receita de Lentes"
              value={formatCurrency(labsData.summary.lensRevenue)}
              subtitle={`${labsData.summary.lensPercentage.toFixed(1)}% do total`}
              icon={Eye}
            />
            <KPICard
              title="Presbiopia"
              value={`${optical.presbyopia.percentage.toFixed(1)}%`}
              subtitle={`${optical.presbyopia.count} prescrições com adição`}
              icon={FlaskConical}
            />
          </div>

          {/* Gráficos: Tipos de Lente + Segmentos */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Tipos de Lente */}
            <Card>
              <CardHeader>
                <CardTitle>Tipos de Lente</CardTitle>
                <CardDescription>Distribuição por tipo de lente prescrita</CardDescription>
              </CardHeader>
              <CardContent>
                {optical.lensTypes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={optical.lensTypes.map((l) => ({
                          name: LENS_TYPE_LABELS[l.type] || l.type,
                          value: l.count,
                          revenue: l.revenue,
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                        }
                      >
                        {optical.lensTypes.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Sem dados de prescrições no período
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Receita por Segmento */}
            <Card>
              <CardHeader>
                <CardTitle>Receita por Segmento</CardTitle>
                <CardDescription>Distribuição de receita por tipo de produto</CardDescription>
              </CardHeader>
              <CardContent>
                {labsData.segments.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={labsData.segments.slice(0, 8)}
                      layout="vertical"
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={120}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar dataKey="revenue" name="Receita" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Sem dados de vendas no período
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Labs */}
          <Card>
            <CardHeader>
              <CardTitle>Top Laboratórios</CardTitle>
              <CardDescription>Laboratórios mais utilizados nas ordens de serviço</CardDescription>
            </CardHeader>
            <CardContent>
              {labsData.topLabs.length > 0 ? (
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={labsData.topLabs}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="orderCount" name="Ordens de Serviço" fill="#10b981" />
                      <Bar dataKey="deliveredCount" name="Entregues" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">#</th>
                          <th className="text-left py-2 px-3 font-medium">Laboratório</th>
                          <th className="text-right py-2 px-3 font-medium">Nº OS</th>
                          <th className="text-right py-2 px-3 font-medium">Entregues</th>
                          <th className="text-right py-2 px-3 font-medium">Prazo Médio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {labsData.topLabs.map((lab, idx) => (
                          <tr key={lab.id} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-3 font-medium">{idx + 1}</td>
                            <td className="py-2 px-3">{lab.name}</td>
                            <td className="py-2 px-3 text-right">{lab.orderCount}</td>
                            <td className="py-2 px-3 text-right">{lab.deliveredCount}</td>
                            <td className="py-2 px-3 text-right">
                              {lab.avgLeadDays ? `${lab.avgLeadDays} dias` : "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Sem dados de laboratórios no período
                </p>
              )}
            </CardContent>
          </Card>

          {/* Graus Esféricos */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Graus - OD</CardTitle>
                <CardDescription>Olho direito</CardDescription>
              </CardHeader>
              <CardContent>
                {optical.sphericalRanges.right.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={optical.sphericalRanges.right.map((r) => ({
                          name: r.range,
                          value: r.count,
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${(name || "").split(" ")[0]}: ${((percent || 0) * 100).toFixed(0)}%`
                        }
                      >
                        {optical.sphericalRanges.right.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Sem dados</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Graus - OE</CardTitle>
                <CardDescription>Olho esquerdo</CardDescription>
              </CardHeader>
              <CardContent>
                {optical.sphericalRanges.left.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={optical.sphericalRanges.left.map((r) => ({
                          name: r.range,
                          value: r.count,
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${(name || "").split(" ")[0]}: ${((percent || 0) * 100).toFixed(0)}%`
                        }
                      >
                        {optical.sphericalRanges.left.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Sem dados</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabela de Segmentos */}
          <Card>
            <CardHeader>
              <CardTitle>Margem por Segmento</CardTitle>
              <CardDescription>Receita, custo e margem por tipo de produto</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Segmento</th>
                      <th className="text-right py-2 px-3 font-medium">Receita</th>
                      <th className="text-right py-2 px-3 font-medium">Custo</th>
                      <th className="text-right py-2 px-3 font-medium">Margem</th>
                      <th className="text-right py-2 px-3 font-medium">Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labsData.segments.map((seg) => (
                      <tr key={seg.type} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 font-medium">{seg.label}</td>
                        <td className="py-2 px-3 text-right">
                          {formatCurrency(seg.revenue)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatCurrency(seg.cost)}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span
                            className={
                              seg.margin >= 30
                                ? "text-green-600 font-medium"
                                : seg.margin >= 15
                                ? "text-yellow-600"
                                : "text-red-600"
                            }
                          >
                            {seg.margin.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">{seg.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Sem dados */}
      {!hasData && !loading && (
        <Card>
          <CardContent className="py-16 text-center">
            <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Selecione o período e clique em Gerar Relatório</h3>
            <p className="text-muted-foreground mt-2">
              As métricas de lentes, laboratórios e segmentos serão exibidas aqui
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
