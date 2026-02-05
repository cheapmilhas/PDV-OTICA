"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus,
  Phone,
  Building2,
  Edit,
  Trash2,
  Loader2,
} from "lucide-react";
import { ModalDetalhesCliente } from "@/components/clientes/modal-detalhes-cliente";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Can } from "@/components/shared/can";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function ClientesPage() {
  const router = useRouter();
  const [clienteSelecionado, setClienteSelecionado] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [clientes, setClientes] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Buscar clientes da API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      pageSize: "20",
      status: "ativos",
    });

    fetch(`/api/customers?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setClientes(data.data || []);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar clientes:", err);
        toast.error("Erro ao carregar clientes");
        setLoading(false);
      });
  }, [search, page]);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este cliente?")) return;

    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao deletar cliente");

      toast.success("Cliente deletado com sucesso!");
      // Recarrega a lista
      setPage(1);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">Gerencie os clientes da ótica</p>
        </div>
        <Button onClick={() => router.push("/dashboard/clientes/novo")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pagination?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Página Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{clientes.length} registros</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Páginas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pagination?.totalPages || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onSearch={setSearch}
        placeholder="Buscar por nome, email, CPF ou telefone..."
        clearable
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && clientes.length === 0 && (
        <EmptyState
          title="Nenhum cliente encontrado"
          description={
            search
              ? `Não encontramos resultados para "${search}"`
              : "Comece adicionando seu primeiro cliente"
          }
          action={
            !search && (
              <Button onClick={() => router.push("/dashboard/clientes/novo")}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Cliente
              </Button>
            )
          }
        />
      )}

      {/* Lista de Clientes */}
      {!loading && clientes.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clientes.map((cliente) => (
            <Card key={cliente.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-lg">
                      {getInitials(cliente.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 space-y-2">
                    <div>
                      <h3 className="font-semibold text-lg">{cliente.name}</h3>
                      {cliente.city && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {cliente.city} - {cliente.state}
                        </p>
                      )}
                    </div>

                    {cliente.phone && (
                      <p className="text-sm flex items-center gap-1">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {cliente.phone}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/clientes/${cliente.id}/editar`)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </Button>

                      <Can roles={["ADMIN", "GERENTE"]}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(cliente.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </Button>
                      </Can>
                    </div>
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

      <ModalDetalhesCliente
        open={modalOpen}
        onOpenChange={setModalOpen}
        cliente={clienteSelecionado}
      />
    </div>
  );
}
