"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Edit,
  Loader2,
  Package,
  Search,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Can } from "@/components/shared/can";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function ProdutosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [produtos, setProdutos] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Buscar produtos da API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      pageSize: "50",
      status: "ativos",
    });

    if (typeFilter && typeFilter !== "all") {
      params.set("type", typeFilter);
    }

    fetch(`/api/products?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setProdutos(data.data || []);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar produtos:", err);
        toast.error("Erro ao carregar produtos");
        setLoading(false);
      });
  }, [search, page, typeFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este produto?")) return;

    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao deletar produto");

      toast.success("Produto deletado com sucesso!");
      setPage(1);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const typeLabels: Record<string, string> = {
    FRAME: "Armação",
    LENS_SERVICE: "Lente",
    SUNGLASSES: "Óculos de Sol",
    CONTACT_LENS: "Lente de Contato",
    ACCESSORY: "Acessório",
    SERVICE: "Serviço",
  };

  const getTypeVariant = (type: string) => {
    switch (type) {
      case "FRAME":
        return "default";
      case "LENS_SERVICE":
      case "CONTACT_LENS":
        return "secondary";
      case "SUNGLASSES":
        return "outline";
      case "ACCESSORY":
      case "SERVICE":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStockStatus = (produto: any) => {
    // Se não controla estoque, não mostrar status
    if (!produto.stockControlled) return null;

    const { stockQty, stockMin = 0 } = produto;
    if (stockQty === 0) return { variant: "destructive" as const, label: "Esgotado" };
    if (stockQty <= stockMin) return { variant: "destructive" as const, label: "Baixo" };
    if (stockQty <= stockMin * 2) return { variant: "default" as const, label: "Médio" };
    return { variant: "secondary" as const, label: "Normal" };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground">Gerencie o catálogo de produtos da ótica</p>
        </div>
        <Button onClick={() => router.push("/dashboard/produtos/novo")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Produtos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pagination?.total || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Armações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {produtos.filter((p) => p.type === "FRAME" || p.type === "SUNGLASSES").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {produtos.filter((p) => p.type === "LENS_SERVICE" || p.type === "CONTACT_LENS").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Estoque Baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {produtos.filter((p) => p.stockQty <= (p.stockMin || 0)).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1">
          <SearchBar
            value={search}
            onSearch={setSearch}
            placeholder="Buscar por nome, SKU, marca ou código de barras..."
            clearable
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="FRAME">Armação</SelectItem>
            <SelectItem value="LENS_SERVICE">Lente</SelectItem>
            <SelectItem value="SUNGLASSES">Óculos de Sol</SelectItem>
            <SelectItem value="CONTACT_LENS">Lente de Contato</SelectItem>
            <SelectItem value="ACCESSORY">Acessório</SelectItem>
            <SelectItem value="SERVICE">Serviço</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && produtos.length === 0 && (
        <EmptyState
          icon={<Package className="h-12 w-12" />}
          title="Nenhum produto encontrado"
          description={
            search
              ? `Não encontramos resultados para "${search}"`
              : "Comece adicionando seu primeiro produto"
          }
          action={
            !search && (
              <Button onClick={() => router.push("/dashboard/produtos/novo")}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Produto
              </Button>
            )
          }
        />
      )}

      {/* Lista de Produtos */}
      {!loading && produtos.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {produtos.map((produto) => {
            const stockStatus = getStockStatus(produto);
            return (
              <Card key={produto.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1 min-w-0">
                        <Badge variant={getTypeVariant(produto.type)} className="text-xs">
                          {typeLabels[produto.type]}
                        </Badge>
                        <h3 className="font-semibold text-base line-clamp-2">{produto.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{produto.sku}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xl font-bold text-primary">
                        {formatCurrency(produto.salePrice)}
                      </p>
                      {produto.stockControlled && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Estoque:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{produto.stockQty}</span>
                            {stockStatus && (
                              <Badge variant={stockStatus.variant} className="text-xs">
                                {stockStatus.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/produtos/${produto.id}/editar`)}
                        className="flex-1"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </Button>

                      <Can roles={["ADMIN", "GERENTE"]}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(produto.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </Can>
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
