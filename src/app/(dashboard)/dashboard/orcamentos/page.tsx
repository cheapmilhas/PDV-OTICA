"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Eye,
  Loader2,
  TrendingUp,
  FileText,
  CheckCircle2,
  DollarSign,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";

interface Quote {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  discountTotal: number;
  validUntil: string;
  createdAt: string;
  customerName?: string;
  customer?: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
  };
  sellerUser: {
    id: string;
    name: string;
  };
  items: any[];
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  conversionRate: number;
  totalQuotedValue: number;
  avgTimeToConversion: number;
}

function OrcamentosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState<Date | undefined>();
  const [showCustomDate, setShowCustomDate] = useState(false);

  useEffect(() => {
    // Carregar estatísticas
    fetch("/api/quotes/stats")
      .then((res) => res.json())
      .then((data) => setStats(data.data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      pageSize: "20",
      status: "ativos",
    });

    // Adicionar filtro de data se houver
    if (daysFilter !== null) {
      const filterDate = subDays(new Date(), daysFilter);
      params.set("createdBefore", filterDate.toISOString());
    } else if (customDate) {
      params.set("createdBefore", customDate.toISOString());
    }

    fetch(`/api/quotes?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setQuotes(data.data || []);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar orçamentos:", err);
        toast.error("Erro ao carregar orçamentos");
        setLoading(false);
      });
  }, [search, page, daysFilter, customDate]);

  const handleDaysFilter = (days: number) => {
    setDaysFilter(days);
    setCustomDate(undefined);
    setShowCustomDate(false);
    setPage(1); // Reset para primeira página
  };

  const handleCustomDateFilter = () => {
    setShowCustomDate(true);
    setDaysFilter(null);
  };

  const clearFilters = () => {
    setDaysFilter(null);
    setCustomDate(undefined);
    setShowCustomDate(false);
    setPage(1);
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { label: string; className: string }> = {
      PENDING: { label: "Pendente", className: "bg-blue-100 text-blue-800" },
      SENT: { label: "Enviado", className: "bg-purple-100 text-purple-800" },
      APPROVED: { label: "Aprovado", className: "bg-green-100 text-green-800" },
      CONVERTED: { label: "Convertido", className: "bg-teal-100 text-teal-800" },
      EXPIRED: { label: "Expirado", className: "bg-orange-100 text-orange-800" },
      CANCELLED: { label: "Cancelado", className: "bg-red-100 text-red-800" },
      OPEN: { label: "Aberto", className: "bg-blue-100 text-blue-800" },
      CANCELED: { label: "Cancelado", className: "bg-red-100 text-red-800" },
    };

    const config = configs[status] || configs.PENDING;

    return (
      <Badge className={config.className}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orçamentos</h1>
          <p className="text-muted-foreground">Gerenciamento de orçamentos</p>
        </div>
        <Button onClick={() => router.push("/dashboard/orcamentos/novo")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Orçamento
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total de Orçamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Aprovados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {stats?.byStatus?.APPROVED || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {stats?.conversionRate?.toFixed(1) || "0"}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Valor Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(stats?.totalQuotedValue || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtro por Dias */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtrar orçamentos antigos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Identificar clientes que fizeram orçamento e não compraram
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={daysFilter === 3 ? "default" : "outline"}
              size="sm"
              onClick={() => handleDaysFilter(3)}
            >
              Há 3 dias
            </Button>
            <Button
              variant={daysFilter === 7 ? "default" : "outline"}
              size="sm"
              onClick={() => handleDaysFilter(7)}
            >
              Há 7 dias
            </Button>
            <Button
              variant={daysFilter === 15 ? "default" : "outline"}
              size="sm"
              onClick={() => handleDaysFilter(15)}
            >
              Há 15 dias
            </Button>
            <Button
              variant={daysFilter === 30 ? "default" : "outline"}
              size="sm"
              onClick={() => handleDaysFilter(30)}
            >
              Há 30 dias
            </Button>

            {/* Data Personalizada */}
            <Popover open={showCustomDate} onOpenChange={setShowCustomDate}>
              <PopoverTrigger asChild>
                <Button
                  variant={customDate ? "default" : "outline"}
                  size="sm"
                  onClick={handleCustomDateFilter}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customDate ? format(customDate, "dd/MM/yyyy", { locale: ptBR }) : "Data específica"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={(date) => {
                    setCustomDate(date);
                    setDaysFilter(null);
                    setShowCustomDate(false);
                    setPage(1);
                  }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>

            {/* Limpar Filtros */}
            {(daysFilter !== null || customDate) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtro
              </Button>
            )}
          </div>

          {(daysFilter !== null || customDate) && (
            <p className="text-sm text-muted-foreground mt-2">
              {daysFilter !== null
                ? `Mostrando orçamentos criados há ${daysFilter} dias ou mais`
                : `Mostrando orçamentos criados antes de ${format(customDate!, "dd/MM/yyyy", { locale: ptBR })}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Search */}
      <SearchBar
        value={search}
        onSearch={setSearch}
        placeholder="Buscar por cliente, CPF ou telefone..."
        clearable
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && quotes.length === 0 && (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="Nenhum orçamento encontrado"
          description={
            search
              ? `Não encontramos resultados para "${search}"`
              : "Comece criando seu primeiro orçamento"
          }
          action={
            !search && (
              <Button onClick={() => router.push("/dashboard/orcamentos/novo")}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Orçamento
              </Button>
            )
          }
        />
      )}

      {/* Lista */}
      {!loading && quotes.length > 0 && (
        <div className="grid gap-4">
          {quotes.map((quote) => (
            <Card key={quote.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {quote.customer?.name || quote.customerName || "Cliente não informado"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(quote.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(quote.total)}
                        </p>
                        {quote.discountTotal > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Desconto: {formatCurrency(quote.discountTotal)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      {getStatusBadge(quote.status)}
                      <span className="text-muted-foreground">
                        {quote.items.length} {quote.items.length === 1 ? "item" : "itens"}
                      </span>
                      <span className="text-muted-foreground">
                        Válido até: {format(new Date(quote.validUntil), "dd/MM/yyyy")}
                      </span>
                      <span className="text-muted-foreground">
                        Vendedor: {quote.sellerUser.name}
                      </span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/orcamentos/${quote.id}`)}
                    className="ml-4"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver Detalhes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Paginação */}
      {!loading && pagination && pagination.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
          showInfo
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="quotes.view">
      <OrcamentosPage />
    </ProtectedRoute>
  );
}
