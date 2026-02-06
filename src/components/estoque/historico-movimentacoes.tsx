"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Search, Filter, Loader2, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import toast from "react-hot-toast";
import { StockMovementType } from "@prisma/client";
import { getStockMovementTypeLabel } from "@/lib/validations/stock-movement.schema";
import { ModalHistoricoProduto } from "./modal-historico-produto";
import { ModalImprimirMovimentacao } from "./modal-imprimir-movimentacao";

interface StockMovement {
  id: string;
  type: StockMovementType;
  quantity: number;
  createdAt: string;
  invoiceNumber: string | null;
  reason: string | null;
  notes: string | null;
  product: {
    id: string;
    sku: string;
    name: string;
    type: string;
  };
  supplier: {
    id: string;
    name: string;
  } | null;
  sourceBranch: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  targetBranch: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export function HistoricoMovimentacoes() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; sku: string } | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);

  useEffect(() => {
    fetchMovements();
  }, [page, typeFilter]);

  // Categorizar movimentações
  const isEntrada = (type: StockMovementType) => {
    const entradas: StockMovementType[] = [
      StockMovementType.PURCHASE,
      StockMovementType.CUSTOMER_RETURN,
      StockMovementType.ADJUSTMENT,
    ];
    return entradas.includes(type);
  };

  const isSaida = (type: StockMovementType) => {
    const saidas: StockMovementType[] = [
      StockMovementType.SALE,
      StockMovementType.LOSS,
      StockMovementType.SUPPLIER_RETURN,
      StockMovementType.INTERNAL_USE,
      StockMovementType.OTHER,
    ];
    return saidas.includes(type);
  };

  const isTransferencia = (type: StockMovementType) => {
    const transferencias: StockMovementType[] = [
      StockMovementType.TRANSFER_IN,
      StockMovementType.TRANSFER_OUT,
    ];
    return transferencias.includes(type);
  };

  async function fetchMovements() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      // Não enviamos filtro para a API, filtraremos no frontend
      const res = await fetch(`/api/stock-movements?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar movimentações");

      const data = await res.json();
      setMovements(Array.isArray(data.data) ? data.data : []);
      setTotalPages(data.meta?.totalPages || 1);
    } catch (error: any) {
      console.error("Erro ao carregar movimentações:", error);
      toast.error("Erro ao carregar histórico de movimentações");
    } finally {
      setLoading(false);
    }
  }

  const getTypeIcon = (type: StockMovementType) => {
    if (isEntrada(type)) {
      return <ArrowUpCircle className="h-4 w-4 text-green-600" />;
    }
    if (isSaida(type)) {
      return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
    }
    if (isTransferencia(type)) {
      return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
    }
    return <ArrowRightLeft className="h-4 w-4 text-gray-600" />;
  };

  const getTypeBadgeVariant = (type: StockMovementType): "default" | "secondary" | "destructive" | "outline" => {
    if (isEntrada(type)) {
      return "default";
    }
    if (isSaida(type)) {
      return "destructive";
    }
    if (isTransferencia(type)) {
      return "secondary";
    }
    return "outline";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Filtrar por busca e tipo
  const filteredMovements = movements.filter((movement) => {
    // Filtro de busca
    if (search) {
      const searchLower = search.toLowerCase();
      const matchesSearch = (
        movement.product.name.toLowerCase().includes(searchLower) ||
        movement.product.sku.toLowerCase().includes(searchLower) ||
        movement.supplier?.name.toLowerCase().includes(searchLower) ||
        movement.invoiceNumber?.toLowerCase().includes(searchLower)
      );
      if (!matchesSearch) return false;
    }

    // Filtro de tipo
    if (typeFilter === "all") return true;
    if (typeFilter === "entradas") return isEntrada(movement.type);
    if (typeFilter === "saidas") return isSaida(movement.type);
    if (typeFilter === "transferencias") return isTransferencia(movement.type);

    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Filtre o histórico de movimentações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por produto, SKU, fornecedor..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Movimentação</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="entradas">Entradas</SelectItem>
                  <SelectItem value="saidas">Saídas</SelectItem>
                  <SelectItem value="transferencias">Transferências</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredMovements.length === 0 && (
        <EmptyState
          icon={<Filter className="h-12 w-12" />}
          title="Nenhuma movimentação encontrada"
          description={
            search || typeFilter !== "all"
              ? "Tente ajustar os filtros de busca"
              : "Não há movimentações de estoque registradas ainda"
          }
        />
      )}

      {/* Tabela de Histórico */}
      {!loading && filteredMovements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Movimentações</CardTitle>
            <CardDescription>
              {filteredMovements.length} movimentações encontradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Filiais</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(movement.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(movement.type)}
                        <Badge variant={getTypeBadgeVariant(movement.type)}>
                          {getStockMovementTypeLabel(movement.type)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setSelectedProduct({
                          id: movement.product.id,
                          name: movement.product.name,
                          sku: movement.product.sku
                        })}
                        className="text-left hover:underline focus:outline-none"
                      >
                        <p className="font-medium">{movement.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          SKU: {movement.product.sku}
                        </p>
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={
                        isEntrada(movement.type)
                          ? "text-green-600 font-semibold"
                          : isTransferencia(movement.type)
                          ? "text-blue-600 font-semibold"
                          : "text-red-600 font-semibold"
                      }>
                        {isEntrada(movement.type) && "+"}
                        {isSaida(movement.type) && "-"}
                        {isTransferencia(movement.type) && (
                          movement.type === StockMovementType.TRANSFER_IN ? "+" : "-"
                        )}
                        {movement.quantity}
                      </span>
                    </TableCell>
                    <TableCell>
                      {movement.supplier ? (
                        <span className="text-sm">{movement.supplier.name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {movement.sourceBranch || movement.targetBranch ? (
                        <div className="text-sm">
                          {movement.sourceBranch && (
                            <p>
                              <span className="text-muted-foreground">De:</span> {movement.sourceBranch.name}
                            </p>
                          )}
                          {movement.targetBranch && (
                            <p>
                              <span className="text-muted-foreground">Para:</span> {movement.targetBranch.name}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {movement.createdBy ? (
                        <span className="text-sm">{movement.createdBy.name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sistema</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        {movement.invoiceNumber && (
                          <p className="text-xs text-muted-foreground">
                            NF: {movement.invoiceNumber}
                          </p>
                        )}
                        {movement.reason && (
                          <p className="text-xs text-muted-foreground truncate" title={movement.reason}>
                            {movement.reason}
                          </p>
                        )}
                        {movement.notes && (
                          <p className="text-xs text-muted-foreground truncate" title={movement.notes}>
                            {movement.notes}
                          </p>
                        )}
                        {!movement.invoiceNumber && !movement.reason && !movement.notes && (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMovement(movement)}
                        title="Imprimir comprovante"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal de Histórico Detalhado do Produto */}
      {selectedProduct && (
        <ModalHistoricoProduto
          open={!!selectedProduct}
          onOpenChange={(open) => !open && setSelectedProduct(null)}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          productSku={selectedProduct.sku}
        />
      )}

      {/* Modal de Impressão de Movimentação */}
      <ModalImprimirMovimentacao
        open={!!selectedMovement}
        onOpenChange={(open) => !open && setSelectedMovement(null)}
        movement={selectedMovement}
      />
    </div>
  );
}
