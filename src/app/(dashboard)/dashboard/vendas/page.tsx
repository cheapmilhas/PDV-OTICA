"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  DollarSign,
  Eye,
  Loader2,
  Search,
  ShoppingCart,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ProtectedAction } from "@/components/auth/ProtectedAction";
import { VendasFilters, VendasFilterValues } from "@/components/vendas/vendas-filters";

export default function VendasPage() {
  return (
    <ProtectedRoute permission="sales.view">
      <VendasContent />
    </ProtectedRoute>
  );
}

function VendasContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [vendas, setVendas] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<VendasFilterValues>({
    startDate: undefined,
    endDate: undefined,
    sellerUserId: "",
    paymentMethod: "",
  });
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([]);

  // Verifica se o usuário tem permissão para ver vendas canceladas
  const canViewCanceled = ["ADMIN", "MANAGER"].includes(session?.user?.role || "");

  useEffect(() => {
    fetch("/api/users/sellers")
      .then((res) => res.json())
      .then((data) => setSellers(data.data || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      pageSize: "20",
      status: statusFilter,
    });

    if (filters.startDate) params.set("startDate", filters.startDate.toISOString());
    if (filters.endDate) params.set("endDate", filters.endDate.toISOString());
    if (filters.sellerUserId) params.set("sellerUserId", filters.sellerUserId);
    if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);

    fetch(`/api/sales?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setVendas(data.data || []);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar vendas:", err);
        toast.error("Erro ao carregar vendas");
        setLoading(false);
      });
  }, [search, page, statusFilter, filters]);

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: "Dinheiro",
      DEBIT_CARD: "Débito",
      CREDIT_CARD: "Crédito",
      PIX: "PIX",
      BANK_SLIP: "Boleto",
      STORE_CREDIT: "Crédito Loja",
    };
    return labels[method] || method;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendas</h1>
          <p className="text-muted-foreground">Histórico de vendas realizadas</p>
        </div>
        <ProtectedAction permission="sales.create">
          <Button onClick={() => router.push("/dashboard/pdv")}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Venda
          </Button>
        </ProtectedAction>
      </div>

      {/* Filtros Avançados */}
      <VendasFilters
        onFilterChange={setFilters}
        sellers={sellers}
      />

      {/* Tabs de Filtro */}
      {canViewCanceled && (
        <Tabs value={statusFilter} onValueChange={(v) => {
          setStatusFilter(v as "ativos" | "inativos" | "todos");
          setPage(1);
        }}>
          <TabsList>
            <TabsTrigger value="ativos">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Ativas
            </TabsTrigger>
            <TabsTrigger value="inativos">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Canceladas
            </TabsTrigger>
            <TabsTrigger value="todos">
              Todas
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pagination?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vendas Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {vendas.filter((v) => {
                const today = new Date().toDateString();
                const saleDate = new Date(v.createdAt).toDateString();
                return today === saleDate;
              }).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor Total (Página)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(
                vendas.reduce((sum, v) => sum + Number(v.total || 0), 0)
              )}
            </p>
          </CardContent>
        </Card>
      </div>

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
      {!loading && vendas.length === 0 && (
        <EmptyState
          icon={<ShoppingCart className="h-12 w-12" />}
          title="Nenhuma venda encontrada"
          description={
            search
              ? `Não encontramos resultados para "${search}"`
              : "Comece realizando sua primeira venda"
          }
          action={
            !search && (
              <ProtectedAction permission="sales.create">
                <Button onClick={() => router.push("/dashboard/pdv")}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Venda
                </Button>
              </ProtectedAction>
            )
          }
        />
      )}

      {/* Lista de Vendas */}
      {!loading && vendas.length > 0 && (
        <div className="grid gap-4">
          {vendas.map((venda) => (
            <Card key={venda.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">
                          {venda.customer?.name || "Cliente não informado"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(venda.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">
                          {formatCurrency(Number(venda.total))}
                        </p>
                        {Number(venda.discountTotal) > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Desconto: {formatCurrency(Number(venda.discountTotal))}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <ShoppingCart className="h-4 w-4" />
                        <span>{venda._count?.items || 0} itens</span>
                      </div>
                      {venda.payments && venda.payments.length > 0 && (
                        <div className="flex gap-2">
                          {venda.payments.map((payment: any, idx: number) => (
                            <Badge key={idx} variant="outline">
                              {getPaymentMethodLabel(payment.method)}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {venda.sellerUser && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span>Vendedor: {venda.sellerUser.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/dashboard/vendas/${venda.id}/detalhes`)}
                    className="ml-4"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Detalhes
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
