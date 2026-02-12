"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  FileText,
  Eye,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  DollarSign,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Quote {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  discountTotal: number;
  validUntil: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
  };
  createdByUser: {
    id: string;
    name: string;
  };
  _count: {
    items: number;
  };
}

function OrcamentosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      pageSize: "20",
      status: "ativos",
    });

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
  }, [search, page]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: any; icon: any }> = {
      OPEN: { label: "Aberto", variant: "secondary", icon: Clock },
      SENT: { label: "Enviado", variant: "default", icon: CheckCircle2 },
      APPROVED: { label: "Aprovado", variant: "default", icon: CheckCircle2 },
      CONVERTED: { label: "Convertido", variant: "default", icon: DollarSign },
      EXPIRED: { label: "Expirado", variant: "secondary", icon: Clock },
      CANCELED: { label: "Cancelado", variant: "destructive", icon: XCircle },
    };

    const config = statusConfig[status] || statusConfig.PENDING;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const isExpired = (validUntil: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = new Date(validUntil);
    expiryDate.setHours(0, 0, 0, 0);
    return expiryDate < today;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orçamentos</h1>
          <p className="text-muted-foreground">Gerenciamento de orçamentos</p>
        </div>
        <Button onClick={() => router.push("/dashboard/pdv")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Orçamento
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Orçamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pagination?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aprovados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {quotes.filter((q) => q.status === "APPROVED").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Convertidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {quotes.filter((q) => q.status === "CONVERTED").length}
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
                quotes.reduce((sum, q) => sum + Number(q.total || 0), 0)
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
            <Button onClick={() => router.push("/dashboard/pdv")}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Orçamento
            </Button>
          }
        />
      )}

      {/* Table */}
      {!loading && quotes.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-left text-sm font-medium">Cliente</th>
                  <th className="p-4 text-left text-sm font-medium">Status</th>
                  <th className="p-4 text-right text-sm font-medium">Itens</th>
                  <th className="p-4 text-right text-sm font-medium">Total</th>
                  <th className="p-4 text-left text-sm font-medium">Validade</th>
                  <th className="p-4 text-left text-sm font-medium">Criado em</th>
                  <th className="p-4 text-center text-sm font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-muted/50 transition-colors">
                    <td className="p-4">
                      <div>
                        <p className="font-medium">{quote.customer.name}</p>
                        {quote.customer.cpf && (
                          <p className="text-sm text-muted-foreground">
                            CPF: {quote.customer.cpf}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(quote.status)}
                      {quote.status === "APPROVED" && isExpired(quote.validUntil) && (
                        <Badge variant="secondary" className="ml-2">
                          Expirado
                        </Badge>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-sm text-muted-foreground">
                        {quote._count.items} {quote._count.items === 1 ? "item" : "itens"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-semibold">{formatCurrency(quote.total)}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm">
                        {format(new Date(quote.validUntil), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm">
                        {format(new Date(quote.createdAt), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        por {quote.createdByUser.name}
                      </p>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/orcamentos/${quote.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="quotes.access">
      <OrcamentosPage />
    </ProtectedRoute>
  );
}
