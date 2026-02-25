"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Search,
  RotateCcw,
  ShoppingBag,
  AlertTriangle,
} from "lucide-react";

// ---------- Types ----------

interface SaleItem {
  id: string;
  productId: string;
  product: {
    name: string;
  };
  quantity: number;
  unitPrice: number;
  total: number;
}

interface SaleCustomer {
  name: string;
}

interface Sale {
  id: string;
  total: number;
  completedAt: string;
  customer: SaleCustomer | null;
  items: SaleItem[];
}

interface SelectedItemState {
  checked: boolean;
  quantity: number;
}

type RefundReason =
  | "DEFEITO"
  | "TROCA"
  | "INSATISFACAO"
  | "ERRO_VENDA"
  | "OUTRO";

type RefundMethod = "CASH" | "CREDIT" | "PIX";

type RefundStatus = "PENDING" | "APPROVED" | "COMPLETED" | "CANCELED";

const REASON_LABELS: Record<RefundReason, string> = {
  DEFEITO: "Defeito no Produto",
  TROCA: "Troca",
  INSATISFACAO: "Insatisfacao do Cliente",
  ERRO_VENDA: "Erro na Venda",
  OUTRO: "Outro",
};

const METHOD_LABELS: Record<RefundMethod, string> = {
  CASH: "Dinheiro",
  CREDIT: "Credito Loja",
  PIX: "PIX",
};

const STATUS_CONFIG: Record<
  RefundStatus,
  { label: string; className: string }
> = {
  PENDING: { label: "Pendente", className: "bg-yellow-100 text-yellow-800" },
  APPROVED: { label: "Aprovado", className: "bg-blue-100 text-blue-800" },
  COMPLETED: { label: "Concluido", className: "bg-green-100 text-green-800" },
  CANCELED: { label: "Cancelado", className: "bg-red-100 text-red-800" },
};

// ---------- Helper ----------

function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

// ---------- Page content ----------

function DevolucoesPageContent() {
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Sale[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Selected sale
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [loadingSale, setLoadingSale] = useState(false);

  // Items selection
  const [selectedItems, setSelectedItems] = useState<
    Record<string, SelectedItemState>
  >({});

  // Refund form
  const [reason, setReason] = useState<RefundReason>("DEFEITO");
  const [observations, setObservations] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("CASH");
  const [restockItems, setRestockItems] = useState(true);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---------- Search ----------

  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) {
      toast.error("Digite um numero de venda ou nome do cliente");
      return;
    }

    setSearching(true);
    setShowResults(true);
    try {
      const params = new URLSearchParams({
        search: searchTerm.trim(),
        status: "COMPLETED",
        pageSize: "5",
      });

      const res = await fetch(`/api/sales?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(
          err.error?.message || err.error || "Erro ao buscar vendas"
        );
      }

      const json = await res.json();
      setSearchResults(json.data || []);

      if ((json.data || []).length === 0) {
        toast("Nenhuma venda encontrada", { icon: "🔍" });
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao buscar vendas");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchTerm]);

  // ---------- Select sale ----------

  const handleSelectSale = useCallback(async (sale: Sale) => {
    setShowResults(false);
    setLoadingSale(true);
    setSelectedSale(null);
    setSelectedItems({});
    setReason("DEFEITO");
    setObservations("");
    setRefundMethod("CASH");
    setRestockItems(true);

    try {
      const res = await fetch(`/api/sales/${sale.id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(
          err.error?.message || err.error || "Erro ao carregar venda"
        );
      }

      const fullSale: Sale = await res.json();

      // Normalize monetary values
      const normalized: Sale = {
        ...fullSale,
        total: Number(fullSale.total),
        items: (fullSale.items || []).map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          quantity: Number(item.quantity),
          total: Number(item.total),
        })),
      };

      setSelectedSale(normalized);

      // Init selected items state (all unchecked)
      const initial: Record<string, SelectedItemState> = {};
      for (const item of normalized.items) {
        initial[item.id] = { checked: false, quantity: 1 };
      }
      setSelectedItems(initial);
    } catch (error: any) {
      toast.error(error.message || "Erro ao carregar detalhes da venda");
    } finally {
      setLoadingSale(false);
    }
  }, []);

  // ---------- Item toggle ----------

  const toggleItem = useCallback((itemId: string, checked: boolean) => {
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], checked },
    }));
  }, []);

  const updateItemQty = useCallback(
    (itemId: string, quantity: number, maxQty: number) => {
      const clamped = Math.max(1, Math.min(quantity, maxQty));
      setSelectedItems((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], quantity: clamped },
      }));
    },
    []
  );

  // ---------- Summary ----------

  const refundTotal = useMemo(() => {
    if (!selectedSale) return 0;
    let total = 0;
    for (const item of selectedSale.items) {
      const state = selectedItems[item.id];
      if (state?.checked) {
        total += state.quantity * item.unitPrice;
      }
    }
    return total;
  }, [selectedSale, selectedItems]);

  const hasSelectedItems = useMemo(() => {
    return Object.values(selectedItems).some((s) => s.checked);
  }, [selectedItems]);

  // ---------- Process refund ----------

  const handleProcessRefund = useCallback(async () => {
    if (!selectedSale || !hasSelectedItems) return;

    setProcessing(true);
    setConfirmOpen(false);

    try {
      const items = selectedSale.items
        .filter((item) => selectedItems[item.id]?.checked)
        .map((item) => ({
          saleItemId: item.id,
          quantity: selectedItems[item.id].quantity,
        }));

      const body = {
        reason,
        refundMethod,
        restockItems,
        observations: observations.trim() || undefined,
        items,
      };

      const res = await fetch(`/api/sales/${selectedSale.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(
          err.error?.message || err.error || "Erro ao processar devolucao"
        );
      }

      toast.success("Devolucao processada com sucesso!");

      // Reset state
      setSelectedSale(null);
      setSelectedItems({});
      setSearchTerm("");
      setSearchResults([]);
      setObservations("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar devolucao");
    } finally {
      setProcessing(false);
    }
  }, [
    selectedSale,
    hasSelectedItems,
    selectedItems,
    reason,
    refundMethod,
    restockItems,
    observations,
  ]);

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/financeiro">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Devolucoes</h1>
          <p className="text-muted-foreground">
            Processe devolucoes e reembolsos de vendas concluidas
          </p>
        </div>
      </div>

      {/* Search Card */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Venda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative" ref={searchRef}>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Numero da venda ou nome do cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
              </div>
              <Button onClick={handleSearch} disabled={searching}>
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">Buscar</span>
              </Button>
            </div>

            {/* Search results dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-lg">
                {searchResults.map((sale) => (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => handleSelectSale(sale)}
                    className="flex w-full items-center justify-between gap-4 border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        Venda #{sale.id.slice(-8).toUpperCase()}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {sale.customer?.name || "Cliente nao identificado"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium">
                        {formatCurrency(Number(sale.total))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sale.completedAt
                          ? formatDate(sale.completedAt)
                          : "---"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showResults &&
              !searching &&
              searchResults.length === 0 &&
              searchTerm.trim() && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-background p-4 text-center text-sm text-muted-foreground shadow-lg">
                  Nenhuma venda concluida encontrada
                </div>
              )}
          </div>
        </CardContent>
      </Card>

      {/* Loading sale details */}
      {loadingSale && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Selected Sale Section */}
      {selectedSale && !loadingSale && (
        <>
          {/* Sale Info Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  Venda #{selectedSale.id.slice(-8).toUpperCase()}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSale(null);
                    setSelectedItems({});
                  }}
                >
                  Limpar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">ID</p>
                  <p className="font-medium">
                    {selectedSale.id.slice(-8).toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                  <p className="font-medium">
                    {selectedSale.customer?.name || "Nao identificado"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="font-medium">
                    {formatCurrency(selectedSale.total)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Data</p>
                  <p className="font-medium">
                    {selectedSale.completedAt
                      ? formatDate(selectedSale.completedAt)
                      : "---"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items Table */}
          <Card>
            <CardHeader>
              <CardTitle>Itens da Venda</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedSale.items.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBag className="h-12 w-12" />}
                  title="Nenhum item encontrado"
                  description="Esta venda nao possui itens para devolucao."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-center">
                        Qtd Vendida
                      </TableHead>
                      <TableHead className="text-center">
                        Qtd Devolver
                      </TableHead>
                      <TableHead className="text-right">Preco Unit.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSale.items.map((item) => {
                      const state = selectedItems[item.id];
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={state?.checked || false}
                              onCheckedChange={(checked) =>
                                toggleItem(item.id, !!checked)
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.product?.name || "Produto removido"}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={1}
                              max={item.quantity}
                              value={state?.quantity ?? 1}
                              onChange={(e) =>
                                updateItemQty(
                                  item.id,
                                  parseInt(e.target.value) || 1,
                                  item.quantity
                                )
                              }
                              disabled={!state?.checked}
                              className="mx-auto w-20 text-center"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.unitPrice)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Refund Details */}
          <Card>
            <CardHeader>
              <CardTitle>Detalhes da Devolucao</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Reason */}
                <div className="space-y-2">
                  <Label htmlFor="reason">Motivo</Label>
                  <Select
                    value={reason}
                    onValueChange={(v) => setReason(v as RefundReason)}
                  >
                    <SelectTrigger id="reason">
                      <SelectValue placeholder="Selecione o motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(REASON_LABELS) as [
                          RefundReason,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Refund method */}
                <div className="space-y-2">
                  <Label htmlFor="refundMethod">Metodo de Devolucao</Label>
                  <Select
                    value={refundMethod}
                    onValueChange={(v) => setRefundMethod(v as RefundMethod)}
                  >
                    <SelectTrigger id="refundMethod">
                      <SelectValue placeholder="Selecione o metodo" />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(METHOD_LABELS) as [
                          RefundMethod,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Observations */}
              <div className="space-y-2">
                <Label htmlFor="observations">Observacoes</Label>
                <Textarea
                  id="observations"
                  placeholder="Observacoes adicionais sobre a devolucao..."
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Restock checkbox */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="restock"
                  checked={restockItems}
                  onCheckedChange={(checked) => setRestockItems(!!checked)}
                />
                <Label htmlFor="restock" className="cursor-pointer">
                  Reestoquear itens devolvidos
                </Label>
              </div>

              {/* Summary */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Total a devolver
                    </p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(refundTotal)}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    {Object.values(selectedItems).filter((s) => s.checked)
                      .length}{" "}
                    item(s) selecionado(s)
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="flex justify-end">
                <Button
                  size="lg"
                  disabled={!hasSelectedItems || processing}
                  onClick={() => setConfirmOpen(true)}
                >
                  {processing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Processar Devolucao
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* No sale selected hint */}
      {!selectedSale && !loadingSale && (
        <EmptyState
          icon={<RotateCcw className="h-12 w-12" />}
          title="Nenhuma venda selecionada"
          description="Busque e selecione uma venda concluida para iniciar o processo de devolucao."
        />
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirmar Devolucao
            </DialogTitle>
            <DialogDescription>
              Revise os detalhes antes de confirmar a devolucao.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Venda</span>
              <span className="font-medium">
                #{selectedSale?.id.slice(-8).toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Motivo</span>
              <span className="font-medium">{REASON_LABELS[reason]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Metodo</span>
              <span className="font-medium">{METHOD_LABELS[refundMethod]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reestoquear</span>
              <span className="font-medium">
                {restockItems ? "Sim" : "Nao"}
              </span>
            </div>

            {/* Items list */}
            <div className="rounded-md border p-3 space-y-1">
              <p className="font-medium mb-2">Itens para devolucao:</p>
              {selectedSale?.items
                .filter((item) => selectedItems[item.id]?.checked)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between text-xs text-muted-foreground"
                  >
                    <span>
                      {item.product?.name} (x
                      {selectedItems[item.id]?.quantity})
                    </span>
                    <span>
                      {formatCurrency(
                        (selectedItems[item.id]?.quantity || 0) * item.unitPrice
                      )}
                    </span>
                  </div>
                ))}
            </div>

            <div className="flex justify-between border-t pt-3">
              <span className="font-semibold">Total a devolver</span>
              <span className="font-bold text-lg">
                {formatCurrency(refundTotal)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={processing}
            >
              Cancelar
            </Button>
            <Button onClick={handleProcessRefund} disabled={processing}>
              {processing && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirmar Devolucao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Page export ----------

export default function DevolucoesPage() {
  return (
    <ProtectedRoute permission="financial.view">
      <DevolucoesPageContent />
    </ProtectedRoute>
  );
}
