"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  CheckCircle2,
  Clock,
  Edit,
  Eye,
  Loader2,
  Search,
  XCircle,
  AlertCircle,
  Printer,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function OrdensServicoPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ativos");
  const [orders, setOrders] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      pageSize: "20",
      status: statusFilter,
    });

    fetch(`/api/service-orders?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data.data || []);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar ordens de serviço:", err);
        toast.error("Erro ao carregar ordens de serviço");
        setLoading(false);
      });
  }, [search, page, statusFilter]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: "Rascunho",
      APPROVED: "Aprovado",
      SENT_TO_LAB: "Enviado Lab",
      IN_PROGRESS: "Em Progresso",
      READY: "Pronto",
      DELIVERED: "Entregue",
      CANCELED: "Cancelado",
    };
    return labels[status] || status;
  };

  const getStatusVariant = (status: string) => {
    const variants: Record<string, any> = {
      DRAFT: "secondary",
      APPROVED: "default",
      SENT_TO_LAB: "outline",
      IN_PROGRESS: "default",
      READY: "default",
      DELIVERED: "default",
      CANCELED: "destructive",
    };
    return variants[status] || "secondary";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "IN_PROGRESS":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "SENT_TO_LAB":
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case "READY":
        return <CheckCircle2 className="h-4 w-4 text-blue-600" />;
      case "CANCELED":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const calcularDiasRestantes = (expectedDate?: string) => {
    if (!expectedDate) return null;
    const hoje = new Date();
    const prazo = new Date(expectedDate);
    const diff = Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // Contadores por status
  const statusCounts = orders.reduce((acc: any, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  const emAndamento = statusCounts.IN_PROGRESS || 0;
  const aguardandoLab = statusCounts.SENT_TO_LAB || 0;
  const prontos = statusCounts.READY || 0;
  const entregues = statusCounts.DELIVERED || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ordens de Serviço</h1>
          <p className="text-muted-foreground">
            Gerencie as ordens de serviço da ótica
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/ordens-servico/nova")}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Ordem de Serviço
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de OS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pagination?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Em Progresso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{emAndamento}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aguardando Lab
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{aguardandoLab}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prontos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{prontos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <SearchBar
          value={search}
          onSearch={setSearch}
          placeholder="Buscar por cliente, CPF ou telefone..."
          clearable
        />

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={statusFilter === "ativos" ? "default" : "outline"}
            onClick={() => setStatusFilter("ativos")}
          >
            Ativos
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "inativos" ? "default" : "outline"}
            onClick={() => setStatusFilter("inativos")}
          >
            Cancelados
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "todos" ? "default" : "outline"}
            onClick={() => setStatusFilter("todos")}
          >
            Todos
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && orders.length === 0 && (
        <EmptyState
          icon={<Clock className="h-12 w-12" />}
          title="Nenhuma ordem de serviço encontrada"
          description={
            search
              ? `Não encontramos resultados para "${search}"`
              : "Comece criando sua primeira ordem de serviço"
          }
          action={
            !search && (
              <Button onClick={() => router.push("/dashboard/ordens-servico/nova")}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Ordem de Serviço
              </Button>
            )
          }
        />
      )}

      {/* Lista de Ordens */}
      {!loading && orders.length > 0 && (
        <div className="grid gap-4">
          {orders.map((order) => {
            const diasRestantes = calcularDiasRestantes(order.expectedDate);
            const prazoVencido =
              diasRestantes !== null &&
              diasRestantes < 0 &&
              order.status !== "DELIVERED" &&
              order.status !== "CANCELED";

            return (
              <Card key={order.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(order.status)}
                            <h3 className="font-semibold text-lg">
                              {order.customer?.name || "Cliente não informado"}
                            </h3>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                              locale: ptBR,
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant={getStatusVariant(order.status)} className="mt-1">
                            {getStatusLabel(order.status)}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span>{order._count?.items || 0} itens/serviços</span>
                        </div>
                        {order.expectedDate && (
                          <div
                            className={`flex items-center gap-1 ${
                              prazoVencido ? "text-red-600 font-medium" : "text-muted-foreground"
                            }`}
                          >
                            <Clock className="h-4 w-4" />
                            {diasRestantes !== null && (
                              <span>
                                {prazoVencido
                                  ? `Atrasado ${Math.abs(diasRestantes)} dias`
                                  : diasRestantes === 0
                                  ? "Vence hoje"
                                  : diasRestantes === 1
                                  ? "Vence amanhã"
                                  : `${diasRestantes} dias restantes`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      {order.status !== "DELIVERED" && order.status !== "CANCELED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/dashboard/ordens-servico/${order.id}/editar`)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/ordens-servico/${order.id}/detalhes`)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Detalhes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/dashboard/ordens-servico/${order.id}/imprimir`, "_blank")}
                      >
                        <Printer className="h-4 w-4 mr-1" />
                        Imprimir OS
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
    <ProtectedRoute permission="service_orders.access">
      <OrdensServicoPage />
    </ProtectedRoute>
  );
}
