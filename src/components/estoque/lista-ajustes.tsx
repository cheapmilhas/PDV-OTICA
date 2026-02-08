"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getStockAdjustmentTypeLabel,
  getStockAdjustmentStatusLabel,
  getStockAdjustmentStatusColor,
} from "@/lib/validations/stock-adjustment.schema";
import type { StockAdjustmentType, StockAdjustmentStatus } from "@prisma/client";

interface Adjustment {
  id: string;
  type: StockAdjustmentType;
  status: StockAdjustmentStatus;
  quantityChange: number;
  totalValue: number;
  reason: string;
  createdAt: string;
  product: {
    id: string;
    sku: string;
    name: string;
  };
  createdBy: {
    id: string;
    name: string;
  };
}

interface ListaAjustesProps {
  canApprove?: boolean;
  onViewDetails?: (adjustmentId: string) => void;
}

export function ListaAjustes({ canApprove = false, onViewDetails }: ListaAjustesProps) {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function loadAdjustments() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const response = await fetch(`/api/stock-adjustments?${params}`);
      const result = await response.json();

      if (response.ok) {
        setAdjustments(result.data || []);
      } else {
        toast.error("Erro ao carregar ajustes");
      }
    } catch (error) {
      toast.error("Erro ao carregar ajustes");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAdjustments();
  }, [statusFilter]);

  async function handleApprove(adjustmentId: string) {
    setProcessingId(adjustmentId);
    try {
      const response = await fetch(`/api/stock-adjustments/${adjustmentId}/approve`, {
        method: "POST",
      });

      const result = await response.json();

      if (response.ok) {
        toast.success("Ajuste aprovado com sucesso");
        loadAdjustments();
      } else {
        toast.error(result.error?.message || "Erro ao aprovar ajuste");
      }
    } catch (error) {
      toast.error("Erro ao aprovar ajuste");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(adjustmentId: string) {
    const reason = prompt("Motivo da rejeição:");
    if (!reason) return;

    setProcessingId(adjustmentId);
    try {
      const response = await fetch(`/api/stock-adjustments/${adjustmentId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: reason }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success("Ajuste rejeitado");
        loadAdjustments();
      } else {
        toast.error(result.error?.message || "Erro ao rejeitar ajuste");
      }
    } catch (error) {
      toast.error("Erro ao rejeitar ajuste");
    } finally {
      setProcessingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="APPROVED">Aprovado</SelectItem>
            <SelectItem value="AUTO_APPROVED">Auto-aprovado</SelectItem>
            <SelectItem value="REJECTED">Rejeitado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Valor Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado por</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nenhum ajuste encontrado
                </TableCell>
              </TableRow>
            ) : (
              adjustments.map((adj) => (
                <TableRow key={adj.id}>
                  <TableCell className="text-sm">
                    {format(new Date(adj.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{adj.product.name}</div>
                      <div className="text-xs text-muted-foreground">{adj.product.sku}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {getStockAdjustmentTypeLabel(adj.type)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        adj.quantityChange > 0 ? "text-green-600" : "text-red-600"
                      }
                    >
                      {adj.quantityChange > 0 ? "+" : ""}
                      {adj.quantityChange}
                    </span>
                  </TableCell>
                  <TableCell>R$ {adj.totalValue.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={getStockAdjustmentStatusColor(adj.status)}>
                      {getStockAdjustmentStatusLabel(adj.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{adj.createdBy.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {onViewDetails && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onViewDetails(adj.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {canApprove && adj.status === "PENDING" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleApprove(adj.id)}
                            disabled={processingId === adj.id}
                          >
                            {processingId === adj.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReject(adj.id)}
                            disabled={processingId === adj.id}
                          >
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
