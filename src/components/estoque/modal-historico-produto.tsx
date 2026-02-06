"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, Calendar, Printer } from "lucide-react";
import toast from "react-hot-toast";
import { StockMovementType } from "@prisma/client";
import { getStockMovementTypeLabel } from "@/lib/validations/stock-movement.schema";
import { ModalImprimirMovimentacao } from "./modal-imprimir-movimentacao";
import { Button } from "@/components/ui/button";

interface ModalHistoricoProdutoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  productSku: string;
}

export function ModalHistoricoProduto({
  open,
  onOpenChange,
  productId,
  productName,
  productSku,
}: ModalHistoricoProdutoProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [selectedMovement, setSelectedMovement] = useState<any>(null);

  useEffect(() => {
    if (open && productId) {
      fetchMovements();
    }
  }, [open, productId, typeFilter]);

  async function fetchMovements() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        productId: productId,
        pageSize: "100",
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      if (typeFilter && typeFilter !== "all") {
        params.set("type", typeFilter);
      }

      const res = await fetch(`/api/stock-movements?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar movimentações");

      const data = await res.json();
      setMovements(Array.isArray(data.data) ? data.data : []);
    } catch (error: any) {
      console.error("Erro ao carregar movimentações:", error);
      toast.error("Erro ao carregar histórico do produto");
    } finally {
      setLoading(false);
    }
  }

  const isEntrada = (type: StockMovementType) => {
    return [
      StockMovementType.PURCHASE,
      StockMovementType.CUSTOMER_RETURN,
      StockMovementType.TRANSFER_IN,
      StockMovementType.ADJUSTMENT,
    ].includes(type);
  };

  const isSaida = (type: StockMovementType) => {
    return [
      StockMovementType.SALE,
      StockMovementType.LOSS,
      StockMovementType.SUPPLIER_RETURN,
      StockMovementType.INTERNAL_USE,
      StockMovementType.TRANSFER_OUT,
      StockMovementType.OTHER,
    ].includes(type);
  };

  const isTransferencia = (type: StockMovementType) => {
    return [
      StockMovementType.TRANSFER_IN,
      StockMovementType.TRANSFER_OUT,
    ].includes(type);
  };

  const getTypeIcon = (type: StockMovementType) => {
    if (isEntrada(type)) {
      return <ArrowUpCircle className="h-4 w-4 text-green-600" />;
    }
    if (isSaida(type)) {
      return <ArrowDownCircle className="h-4 w-4 text-red-600" />;
    }
    return <ArrowRightLeft className="h-4 w-4 text-blue-600" />;
  };

  const getTypeBadgeVariant = (type: StockMovementType): "default" | "secondary" | "destructive" => {
    if (isEntrada(type)) return "default";
    if (isSaida(type)) return "destructive";
    return "secondary";
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

  const formatDateOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  // Filtrar por data local
  const filteredMovements = movements.filter((movement) => {
    if (!dateFilter) return true;
    return formatDateOnly(movement.createdAt) === formatDateOnly(dateFilter);
  });

  // Calcular estatísticas
  const totalEntradas = filteredMovements
    .filter(m => isEntrada(m.type))
    .reduce((acc, m) => acc + m.quantity, 0);

  const totalSaidas = filteredMovements
    .filter(m => isSaida(m.type))
    .reduce((acc, m) => acc + m.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Histórico de Movimentações - {productName}
          </DialogTitle>
          <DialogDescription>
            SKU: {productSku} • {filteredMovements.length} movimentações encontradas
          </DialogDescription>
        </DialogHeader>

        {/* Estatísticas */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total de Entradas</p>
            <p className="text-2xl font-bold text-green-600">+{totalEntradas}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total de Saídas</p>
            <p className="text-2xl font-bold text-red-600">-{totalSaidas}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Saldo</p>
            <p className="text-2xl font-bold">{totalEntradas - totalSaidas}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 gap-4">
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

          <div className="space-y-2">
            <Label>Filtrar por Data</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                className="pl-9"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Tabela */}
        {!loading && (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhuma movimentação encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.map((movement) => (
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
                      <TableCell className="text-center">
                        <span
                          className={
                            isEntrada(movement.type)
                              ? "text-green-600 font-semibold"
                              : isTransferencia(movement.type)
                              ? "text-blue-600 font-semibold"
                              : "text-red-600 font-semibold"
                          }
                        >
                          {isEntrada(movement.type) && "+"}
                          {isSaida(movement.type) && "-"}
                          {isTransferencia(movement.type) &&
                            (movement.type === StockMovementType.TRANSFER_IN ? "+" : "-")}
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Modal de Impressão */}
        <ModalImprimirMovimentacao
          open={!!selectedMovement}
          onOpenChange={(open) => !open && setSelectedMovement(null)}
          movement={selectedMovement}
        />
      </DialogContent>
    </Dialog>
  );
}
