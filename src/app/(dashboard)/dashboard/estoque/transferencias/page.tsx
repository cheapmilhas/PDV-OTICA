"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeftRight,
  Plus,
  Loader2,
  Trash2,
  Check,
  X,
  Package,
  Search,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { useBranchContext } from "@/hooks/use-branch-context";
import toast from "react-hot-toast";

interface Branch {
  id: string;
  name: string;
}

interface TransferItem {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  availableStock: number;
}

interface Transfer {
  id: string;
  status: string;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  requestedBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  items: Array<{
    id: string;
    quantity: number;
    product: { id: string; name: string; sku: string };
  }>;
}

export default function TransferenciasPage() {
  return (
    <ProtectedRoute permission="stock.view">
      <TransferenciasContent />
    </ProtectedRoute>
  );
}

function TransferenciasContent() {
  const { branches, isAdmin, isAllBranches, activeBranchId } = useBranchContext();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Form state
  const [fromBranchId, setFromBranchId] = useState("");
  const [toBranchId, setToBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<TransferItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (activeBranchId !== "ALL") params.set("branchId", activeBranchId);

      const res = await fetch(`/api/stock-transfers?${params}`);
      const data = await res.json();
      setTransfers(data.data || []);
    } catch {
      toast.error("Erro ao carregar transferências");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, activeBranchId]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // Product search
  useEffect(() => {
    if (!productSearch || productSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&pageSize=10`);
        const data = await res.json();
        setSearchResults(data.data || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [productSearch]);

  function addItem(product: any) {
    if (items.some((i) => i.productId === product.id)) {
      toast.error("Produto já adicionado");
      return;
    }

    // Buscar estoque na branch de origem
    const branchStock = product.branchStocks?.find(
      (bs: any) => bs.branch.id === fromBranchId
    );
    const available = branchStock?.quantity ?? product.stockQty ?? 0;

    setItems([
      ...items,
      {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        quantity: 1,
        availableStock: available,
      },
    ]);
    setProductSearch("");
    setSearchResults([]);
  }

  function removeItem(productId: string) {
    setItems(items.filter((i) => i.productId !== productId));
  }

  function updateQuantity(productId: string, qty: number) {
    setItems(
      items.map((i) =>
        i.productId === productId
          ? { ...i, quantity: Math.min(Math.max(1, qty), i.availableStock) }
          : i
      )
    );
  }

  async function handleSubmit() {
    if (!fromBranchId || !toBranchId) {
      toast.error("Selecione as filiais de origem e destino");
      return;
    }
    if (fromBranchId === toBranchId) {
      toast.error("Origem e destino devem ser diferentes");
      return;
    }
    if (items.length === 0) {
      toast.error("Adicione ao menos um produto");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/stock-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromBranchId,
          toBranchId,
          notes,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao criar transferência");
        return;
      }

      toast.success(
        data.data.status === "COMPLETED"
          ? "Transferência realizada com sucesso!"
          : "Transferência criada — aguardando aprovação do admin"
      );
      setShowNewDialog(false);
      resetForm();
      fetchTransfers();
    } catch {
      toast.error("Erro ao criar transferência");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(transferId: string, action: "approve" | "cancel") {
    const label = action === "approve" ? "aprovar" : "cancelar";
    if (!confirm(`Deseja ${label} esta transferência?`)) return;

    try {
      const res = await fetch(`/api/stock-transfers/${transferId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || `Erro ao ${label}`);
        return;
      }
      toast.success(data.message);
      fetchTransfers();
    } catch {
      toast.error(`Erro ao ${label}`);
    }
  }

  function resetForm() {
    setFromBranchId("");
    setToBranchId("");
    setNotes("");
    setItems([]);
    setProductSearch("");
    setSearchResults([]);
  }

  const STATUS_LABEL: Record<string, string> = {
    PENDING: "Pendente",
    APPROVED: "Aprovada",
    IN_TRANSIT: "Em Trânsito",
    COMPLETED: "Concluída",
    CANCELLED: "Cancelada",
  };

  const STATUS_COLOR: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-blue-100 text-blue-800",
    IN_TRANSIT: "bg-purple-100 text-purple-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Transferências de Estoque</h1>
          <p className="text-muted-foreground text-sm hidden sm:block">
            Movimentação de produtos entre filiais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="PENDING">Pendentes</SelectItem>
              <SelectItem value="COMPLETED">Concluídas</SelectItem>
              <SelectItem value="CANCELLED">Canceladas</SelectItem>
            </SelectContent>
          </Select>
          {branches.length >= 2 && (
            isAllBranches ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <ArrowLeftRight className="h-4 w-4 flex-shrink-0" />
                <p className="text-sm">Selecione uma filial específica para criar uma transferência</p>
              </div>
            ) : (
              <Button
                onClick={() => {
                  resetForm();
                  setShowNewDialog(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova Transferência
              </Button>
            )
          )}
        </div>
      </div>

      {/* Info: precisa de 2+ filiais */}
      {branches.length < 2 && (
        <Card>
          <CardContent className="py-8 text-center">
            <ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              Transferências requerem pelo menos 2 filiais cadastradas.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : transfers.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-12 w-12" />}
          title="Nenhuma transferência"
          description="Crie uma transferência para mover produtos entre filiais"
        />
      ) : (
        <div className="space-y-3">
          {transfers.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold">
                        #{t.id.slice(-6).toUpperCase()}
                      </span>
                      <Badge className={STATUS_COLOR[t.status]}>
                        {STATUS_LABEL[t.status] || t.status}
                      </Badge>
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">{t.fromBranch.name}</span>
                      {" → "}
                      <span className="font-medium">{t.toBranch.name}</span>
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{t.items.length} produto{t.items.length > 1 ? "s" : ""}</span>
                      <span>•</span>
                      <span>
                        {t.items.reduce((sum, i) => sum + i.quantity, 0)} unidade
                        {t.items.reduce((sum, i) => sum + i.quantity, 0) > 1 ? "s" : ""}
                      </span>
                      <span>•</span>
                      <span>Por: {t.requestedBy.name}</span>
                      <span>•</span>
                      <span>
                        {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {t.notes && (
                      <p className="text-xs text-muted-foreground italic">{t.notes}</p>
                    )}
                    {/* Itens expandidos */}
                    <div className="mt-2 space-y-1">
                      {t.items.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-sm">
                          <Package className="h-3 w-3 text-muted-foreground" />
                          <span>{item.product.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            x{item.quantity}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Ações */}
                  {t.status === "PENDING" && (
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600"
                          onClick={() => handleAction(t.id, "approve")}
                        >
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Aprovar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => handleAction(t.id, "cancel")}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Nova Transferência */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Transferência de Estoque</DialogTitle>
            <DialogDescription>
              Mova produtos entre filiais da empresa
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Origem e Destino */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Filial de Origem *</Label>
                <Select value={fromBranchId} onValueChange={(v) => { setFromBranchId(v); setItems([]); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} disabled={b.id === toBranchId}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Filial de Destino *</Label>
                <Select value={toBranchId} onValueChange={setToBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} disabled={b.id === fromBranchId}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Busca de Produtos */}
            {fromBranchId && toBranchId && (
              <div className="space-y-1.5">
                <Label>Adicionar Produto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar por nome, SKU ou código de barras..."
                    className="pl-9"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                    {searchResults.map((product) => {
                      const bs = product.branchStocks?.find(
                        (s: any) => s.branch.id === fromBranchId
                      );
                      const stock = bs?.quantity ?? product.stockQty ?? 0;
                      return (
                        <button
                          key={product.id}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                          onClick={() => addItem({ ...product })}
                          disabled={stock <= 0}
                        >
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              SKU: {product.sku}
                            </p>
                          </div>
                          <Badge variant={stock > 0 ? "secondary" : "destructive"}>
                            Estoque: {stock}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Itens */}
            {items.length > 0 && (
              <div className="space-y-2">
                <Label>Itens da Transferência</Label>
                <div className="border rounded-lg divide-y">
                  {items.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          SKU: {item.productSku} • Disponível: {item.availableStock}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={item.availableStock}
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(item.productId, parseInt(e.target.value) || 1)
                          }
                          className="w-20 text-center"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => removeItem(item.productId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-right">
                  Total: {items.reduce((s, i) => s + i.quantity, 0)} unidades em{" "}
                  {items.length} produto{items.length > 1 ? "s" : ""}
                </p>
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Reposição mensal, transferência solicitada pelo gerente..."
                rows={2}
              />
            </div>

            {/* Info para gerentes */}
            {!isAdmin && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                Como gerente, sua transferência ficará pendente até que um administrador aprove.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving || items.length === 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAdmin ? "Transferir Agora" : "Solicitar Transferência"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
