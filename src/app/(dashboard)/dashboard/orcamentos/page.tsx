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
  Send,
  Calendar as CalendarCheck,
  MessageCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Can } from "@/components/permissions/can";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  // CRM
  sentAt?: string | null;
  sentVia?: string | null;
  followUpDate?: string | null;
  followUpNotes?: string | null;
  contactCount?: number;
  lastContactAt?: string | null;
}

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  conversionRate: number;
  totalQuotedValue: number;
  avgTimeToConversion: number;
  sent: number;
  notSent: number;
  pendingFollowUp: number;
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
  const [selectedQuoteForFollowUp, setSelectedQuoteForFollowUp] = useState<Quote | null>(null);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [savingFollowUp, setSavingFollowUp] = useState(false);

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

  const handleMarkAsSent = async (quoteId: string, currentlySent: boolean) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/mark-sent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sent: !currentlySent,
          sentVia: currentlySent ? undefined : "whatsapp",
        }),
      });

      if (!response.ok) throw new Error("Erro ao atualizar");

      toast.success(currentlySent ? "Marcação removida" : "Orçamento marcado como enviado");

      // Atualizar a lista localmente
      setQuotes((prev) =>
        prev.map((q) =>
          q.id === quoteId
            ? {
                ...q,
                sentAt: currentlySent ? null : new Date().toISOString(),
                sentVia: currentlySent ? null : "whatsapp",
              }
            : q
        )
      );
    } catch (error) {
      toast.error("Erro ao atualizar orçamento");
    }
  };

  const handleSaveFollowUp = async () => {
    if (!selectedQuoteForFollowUp) return;

    setSavingFollowUp(true);
    try {
      const response = await fetch(`/api/quotes/${selectedQuoteForFollowUp.id}/follow-up`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followUpDate: followUpDate?.toISOString(),
          followUpNotes,
          incrementContact: true,
        }),
      });

      if (!response.ok) throw new Error("Erro ao salvar");

      toast.success("Follow-up agendado com sucesso!");

      // Atualizar a lista localmente
      setQuotes((prev) =>
        prev.map((q) =>
          q.id === selectedQuoteForFollowUp.id
            ? {
                ...q,
                followUpDate: followUpDate?.toISOString() || null,
                followUpNotes,
                contactCount: (q.contactCount || 0) + 1,
                lastContactAt: new Date().toISOString(),
              }
            : q
        )
      );

      // Fechar modal
      setSelectedQuoteForFollowUp(null);
      setFollowUpDate(undefined);
      setFollowUpNotes("");
    } catch (error) {
      toast.error("Erro ao agendar follow-up");
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleOpenFollowUpModal = (quote: Quote) => {
    setSelectedQuoteForFollowUp(quote);
    setFollowUpDate(quote.followUpDate ? new Date(quote.followUpDate) : undefined);
    setFollowUpNotes(quote.followUpNotes || "");
  };

  const handleWhatsApp = async (quote: Quote) => {
    const phone = quote.customer?.phone || "";
    const cleanPhone = phone.replace(/\D/g, "");
    const customerDisplayName = quote.customer?.name || quote.customerName || "Cliente";
    const total = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(quote.total);
    const validUntil = format(new Date(quote.validUntil), "dd/MM/yyyy", { locale: ptBR });
    const message = `Olá ${customerDisplayName}! Segue seu orçamento no valor de ${total}, válido até ${validUntil}. Em caso de dúvidas, estamos à disposição.`;

    const url = cleanPhone
      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank");

    // Registrar como follow-up via novo endpoint
    try {
      await fetch(`/api/quotes/${quote.id}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "WHATSAPP", direction: "outbound", notes: "Enviado via WhatsApp" }),
      });
      setQuotes((prev) =>
        prev.map((q) =>
          q.id === quote.id
            ? { ...q, sentAt: q.sentAt || new Date().toISOString(), sentVia: q.sentVia || "whatsapp", contactCount: (q.contactCount || 0) + 1 }
            : q
        )
      );
    } catch {
      // Silencioso — link já abriu
    }
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
        <Can permission="quotes.create">
          <Button onClick={() => router.push("/dashboard/orcamentos/novo")}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Orçamento
          </Button>
        </Can>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Send className="h-4 w-4" />
              Enviados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {stats?.sent || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.total ? Math.round(((stats?.sent || 0) / stats.total) * 100) : 0}% do total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" />
              Follow-up
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">
              {stats?.pendingFollowUp || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Pendentes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Convertidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-teal-600">
              {stats?.byStatus?.CONVERTED || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Conversão
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
            <p className="text-xl font-bold text-primary">
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

                      {/* Badge de Enviado */}
                      {quote.sentAt && (
                        <Badge className="bg-green-100 text-green-800">
                          <Send className="h-3 w-3 mr-1" />
                          Enviado {quote.sentVia && `via ${quote.sentVia}`}
                        </Badge>
                      )}

                      {/* Badge de Follow-up Pendente */}
                      {quote.followUpDate && new Date(quote.followUpDate) <= new Date() && (
                        <Badge className="bg-yellow-100 text-yellow-800">
                          <CalendarCheck className="h-3 w-3 mr-1" />
                          Follow-up Pendente
                        </Badge>
                      )}

                      {/* Badge de Contatos */}
                      {quote.contactCount && quote.contactCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          <MessageCircle className="h-3 w-3 mr-1" />
                          {quote.contactCount} contato{quote.contactCount !== 1 ? "s" : ""}
                        </Badge>
                      )}

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

                  <div className="ml-4 flex flex-col gap-2">
                    {/* Botão WhatsApp */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWhatsApp(quote);
                      }}
                      className="min-w-[140px] border-green-500 text-green-600 hover:bg-green-50"
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      WhatsApp
                    </Button>

                    {/* Botão Follow-up */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenFollowUpModal(quote);
                      }}
                      className="min-w-[140px]"
                    >
                      <CalendarCheck className="h-4 w-4 mr-1" />
                      Follow-up
                    </Button>

                    {/* Botão Ver Detalhes */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/dashboard/orcamentos/${quote.id}`)}
                      className="min-w-[140px]"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Ver Detalhes
                    </Button>
                  </div>
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

      {/* Modal de Follow-up */}
      <Dialog
        open={!!selectedQuoteForFollowUp}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedQuoteForFollowUp(null);
            setFollowUpDate(undefined);
            setFollowUpNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Follow-up</DialogTitle>
            <DialogDescription>
              Cliente: {selectedQuoteForFollowUp?.customer?.name || selectedQuoteForFollowUp?.customerName}
              <br />
              Valor: {selectedQuoteForFollowUp && formatCurrency(selectedQuoteForFollowUp.total)}
              <br />
              Contatos realizados: {selectedQuoteForFollowUp?.contactCount || 0}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Data para retornar contato</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {followUpDate ? format(followUpDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione uma data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={setFollowUpDate}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Observações do contato</Label>
              <Textarea
                placeholder="Ex: Cliente pediu para ligar na próxima semana, demonstrou interesse mas quer comparar preços..."
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedQuoteForFollowUp(null);
                setFollowUpDate(undefined);
                setFollowUpNotes("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveFollowUp} disabled={savingFollowUp}>
              {savingFollowUp ? "Salvando..." : "Salvar Follow-up"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
