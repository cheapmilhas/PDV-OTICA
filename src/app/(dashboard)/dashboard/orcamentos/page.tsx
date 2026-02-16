"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useCallback } from "react";
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
  MessageSquare,
  Phone,
  Send,
  ShoppingCart,
  Clock,
  AlertTriangle,
  Filter,
  X,
  Edit,
  BarChart3,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { format, subDays, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Status configs
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  PENDING: { label: "Pendente", className: "bg-blue-100 text-blue-800", icon: Clock },
  OPEN: { label: "Aberto", className: "bg-blue-100 text-blue-800", icon: FileText },
  SENT: { label: "Enviado", className: "bg-purple-100 text-purple-800", icon: Send },
  APPROVED: { label: "Aprovado", className: "bg-green-100 text-green-800", icon: CheckCircle2 },
  CONVERTED: { label: "Convertido", className: "bg-teal-100 text-teal-800", icon: ShoppingCart },
  EXPIRED: { label: "Expirado", className: "bg-orange-100 text-orange-800", icon: AlertTriangle },
  CANCELLED: { label: "Cancelado", className: "bg-red-100 text-red-800", icon: X },
  CANCELED: { label: "Cancelado", className: "bg-red-100 text-red-800", icon: X },
};

const PIPELINE_STAGES = [
  { key: "PENDING", label: "Pendentes", color: "text-blue-600 bg-blue-50 border-blue-200" },
  { key: "SENT", label: "Enviados", color: "text-purple-600 bg-purple-50 border-purple-200" },
  { key: "APPROVED", label: "Aprovados", color: "text-green-600 bg-green-50 border-green-200" },
  { key: "CONVERTED", label: "Convertidos", color: "text-teal-600 bg-teal-50 border-teal-200" },
];

// ============================================================================
// Component
// ============================================================================

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
  const [statusFilter, setStatusFilter] = useState<string>("ativos");
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");
  const [sendingWhatsapp, setSendingWhatsapp] = useState<string | null>(null);

  // Stats
  useEffect(() => {
    fetch("/api/quotes/stats")
      .then((res) => res.json())
      .then((data) => setStats(data.data))
      .catch(console.error);
  }, []);

  // Load quotes
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      pageSize: "20",
      status: statusFilter,
    });

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
      .catch(() => {
        toast.error("Erro ao carregar orçamentos");
        setLoading(false);
      });
  }, [search, page, daysFilter, customDate, statusFilter]);

  // ============================================================================
  // Actions
  // ============================================================================

  const handleDaysFilter = (days: number) => {
    setDaysFilter((prev) => (prev === days ? null : days));
    setCustomDate(undefined);
    setShowCustomDate(false);
    setPage(1);
  };

  const clearFilters = () => {
    setDaysFilter(null);
    setCustomDate(undefined);
    setShowCustomDate(false);
    setStatusFilter("ativos");
    setPage(1);
  };

  const sendFollowUpWhatsApp = async (quote: Quote) => {
    const customer = quote.customer;
    if (!customer?.phone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }

    setSendingWhatsapp(quote.id);

    const cleanPhone = customer.phone.replace(/\D/g, "");
    const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    const daysSince = differenceInDays(new Date(), new Date(quote.createdAt));
    const firstName = customer.name.split(" ")[0];

    let message = "";
    if (quote.status === "PENDING" || quote.status === "OPEN") {
      message = `Olá ${firstName}! Tudo bem?\n\nVi que preparamos um orçamento para você há ${daysSince} dia(s). Gostaria de tirar alguma dúvida ou ajustar algo?\n\nEstamos à disposição!`;
    } else if (quote.status === "SENT") {
      message = `Olá ${firstName}!\n\nEnviei um orçamento para você. Conseguiu analisar? Posso ajudar com alguma dúvida?\n\nFicamos à disposição!`;
    } else if (quote.status === "APPROVED") {
      message = `Olá ${firstName}!\n\nSeu orçamento foi aprovado! Quando gostaria de vir para finalizarmos?\n\nEstamos aguardando você!`;
    } else {
      message = `Olá ${firstName}! Tudo bem?\n\nPassando para saber se tem interesse em nossos produtos. Estamos com ótimas condições!\n\nFicamos à disposição!`;
    }

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${phoneWithCountry}?text=${encodedMessage}`, "_blank");

    // Marcar como enviado se estiver pendente
    if (quote.status === "PENDING" || quote.status === "OPEN") {
      try {
        await fetch(`/api/quotes/${quote.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SENT" }),
        });
        toast.success("WhatsApp aberto e orçamento marcado como Enviado");
        // Reload
        setPage((p) => p);
        window.location.reload();
      } catch {
        toast.success("WhatsApp aberto");
      }
    } else {
      toast.success("WhatsApp aberto!");
    }

    setSendingWhatsapp(null);
  };

  // ============================================================================
  // Helpers
  // ============================================================================

  const getUrgencyInfo = (quote: Quote) => {
    const validUntil = new Date(quote.validUntil);
    const daysLeft = differenceInDays(validUntil, new Date());
    const isExpired = isPast(validUntil);
    const daysSinceCreated = differenceInDays(new Date(), new Date(quote.createdAt));

    if (isExpired) {
      return { level: "expired", label: "Expirado", className: "text-red-600" };
    }
    if (daysLeft <= 2) {
      return { level: "urgent", label: `Expira em ${daysLeft}d`, className: "text-red-600 font-medium" };
    }
    if (daysLeft <= 5) {
      return { level: "warning", label: `Expira em ${daysLeft}d`, className: "text-orange-600" };
    }
    if (daysSinceCreated >= 7) {
      return { level: "stale", label: `Criado há ${daysSinceCreated}d`, className: "text-amber-600" };
    }
    return { level: "normal", label: `Expira em ${daysLeft}d`, className: "text-muted-foreground" };
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  // ============================================================================
  // Pipeline View
  // ============================================================================

  const PipelineView = () => {
    if (!stats) return null;

    return (
      <div className="grid grid-cols-4 gap-4">
        {PIPELINE_STAGES.map((stage) => {
          const count = stats.byStatus?.[stage.key] || 0;
          const stageQuotes = quotes.filter(
            (q) => q.status === stage.key || (stage.key === "PENDING" && q.status === "OPEN")
          );

          return (
            <div key={stage.key} className={`rounded-lg border p-3 ${stage.color}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">{stage.label}</h3>
                <Badge variant="secondary" className="text-xs">
                  {count}
                </Badge>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {stageQuotes.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Nenhum orçamento
                  </p>
                ) : (
                  stageQuotes.slice(0, 10).map((quote) => {
                    const urgency = getUrgencyInfo(quote);
                    return (
                      <Card
                        key={quote.id}
                        className="cursor-pointer hover:shadow-sm transition-shadow"
                        onClick={() => router.push(`/dashboard/orcamentos/${quote.id}`)}
                      >
                        <CardContent className="p-3">
                          <p className="font-medium text-sm truncate">
                            {quote.customer?.name || quote.customerName || "Sem cliente"}
                          </p>
                          <p className="text-lg font-bold text-primary">
                            {formatCurrency(quote.total)}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className={`text-[11px] ${urgency.className}`}>
                              {urgency.label}
                            </span>
                            {quote.customer?.phone && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sendFollowUpWhatsApp(quote);
                                }}
                              >
                                <MessageSquare className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ============================================================================
  // Quote Card
  // ============================================================================

  const QuoteCard = ({ quote }: { quote: Quote }) => {
    const urgency = getUrgencyInfo(quote);
    const daysSince = differenceInDays(new Date(), new Date(quote.createdAt));

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 space-y-2">
              {/* Nome + Status */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">
                    {quote.customer?.name || quote.customerName || "Cliente não informado"}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <span>
                      {format(new Date(quote.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </span>
                    {quote.customer?.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {quote.customer.phone}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(quote.total)}
                  </p>
                  {quote.discountTotal > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Desc: {formatCurrency(quote.discountTotal)}
                    </p>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-3 text-sm flex-wrap">
                {getStatusBadge(quote.status)}

                {/* Urgência */}
                {(urgency.level === "urgent" || urgency.level === "expired") && (
                  <Badge variant="destructive" className="text-[11px] gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {urgency.label}
                  </Badge>
                )}
                {urgency.level === "warning" && (
                  <Badge className="bg-orange-100 text-orange-800 text-[11px] gap-1">
                    <Clock className="h-3 w-3" />
                    {urgency.label}
                  </Badge>
                )}
                {urgency.level === "stale" && (
                  <Badge className="bg-amber-100 text-amber-800 text-[11px] gap-1">
                    <Clock className="h-3 w-3" />
                    {urgency.label}
                  </Badge>
                )}

                <span className="text-muted-foreground">
                  {quote.items.length} {quote.items.length === 1 ? "item" : "itens"}
                </span>
                <span className="text-muted-foreground">
                  Vendedor: {quote.sellerUser.name}
                </span>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/dashboard/orcamentos/${quote.id}`)}
              >
                <Eye className="h-4 w-4 mr-1" />
                Ver
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/dashboard/orcamentos/${quote.id}/editar`)}
              >
                <Edit className="h-4 w-4 mr-1" />
                Editar
              </Button>
              {quote.customer?.phone && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => sendFollowUpWhatsApp(quote)}
                  disabled={sendingWhatsapp === quote.id}
                >
                  {sendingWhatsapp === quote.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <MessageSquare className="h-4 w-4 mr-1" />
                      WhatsApp
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orçamentos</h1>
          <p className="text-muted-foreground">Gerenciamento e follow-up de orçamentos</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <FileText className="h-4 w-4 mr-1" />
            Lista
          </Button>
          <Button
            variant={viewMode === "pipeline" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("pipeline")}
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            Pipeline
          </Button>
          <Button onClick={() => router.push("/dashboard/orcamentos/novo")}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Orçamento
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Total</p>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.total || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Pendentes</p>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-600">
              {(stats?.byStatus?.PENDING || 0) + (stats?.byStatus?.OPEN || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Conversão</p>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {stats?.conversionRate?.toFixed(1) || "0"}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Valor Total</p>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(stats?.totalQuotedValue || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Tempo Médio</p>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-1">
              {stats?.avgTimeToConversion
                ? `${Math.round(stats.avgTimeToConversion)}d`
                : "-"}
            </p>
            <p className="text-[11px] text-muted-foreground">para conversão</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline View */}
      {viewMode === "pipeline" && <PipelineView />}

      {/* List View */}
      {viewMode === "list" && (
        <>
          {/* Filtros CRM */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros de Follow-up</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Filtro por status */}
                <div className="flex gap-1.5 border-r pr-3 mr-1">
                  {[
                    { key: "ativos", label: "Ativos" },
                    { key: "PENDING", label: "Pendentes" },
                    { key: "SENT", label: "Enviados" },
                    { key: "APPROVED", label: "Aprovados" },
                  ].map((f) => (
                    <Button
                      key={f.key}
                      variant={statusFilter === f.key ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setStatusFilter(f.key);
                        setPage(1);
                      }}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                {/* Filtro por dias */}
                {[3, 7, 15, 30].map((days) => (
                  <Button
                    key={days}
                    variant={daysFilter === days ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleDaysFilter(days)}
                  >
                    +{days}d
                  </Button>
                ))}

                {/* Data custom */}
                <Popover open={showCustomDate} onOpenChange={setShowCustomDate}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={customDate ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                    >
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {customDate
                        ? format(customDate, "dd/MM", { locale: ptBR })
                        : "Data"}
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

                {/* Limpar */}
                {(daysFilter !== null || customDate || statusFilter !== "ativos") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={clearFilters}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>

              {(daysFilter !== null || customDate) && (
                <p className="text-xs text-muted-foreground mt-2">
                  {daysFilter !== null
                    ? `Mostrando orçamentos criados há ${daysFilter} dias ou mais`
                    : `Criados antes de ${format(customDate!, "dd/MM/yyyy", { locale: ptBR })}`}
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
            <div className="space-y-3">
              {quotes.map((quote) => (
                <QuoteCard key={quote.id} quote={quote} />
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
        </>
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
