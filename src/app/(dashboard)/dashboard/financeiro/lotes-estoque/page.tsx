"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Loader2,
  Package,
  Search,
  ArrowLeft,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import toast from "react-hot-toast";
import { format } from "date-fns";
import Link from "next/link";

// Types
interface Product {
  id: string;
  name: string;
  sku: string | null;
}

interface Supplier {
  id: string;
  name: string;
}

interface InventoryLot {
  id: string;
  productId: string;
  product: {
    name: string;
    sku: string | null;
  };
  supplier: {
    name: string;
  } | null;
  invoiceNumber: string | null;
  acquiredAt: string;
  qtyIn: number;
  qtyRemaining: number;
  unitCost: number;
  totalCost: number;
}

interface PaginationData {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function LotesEstoquePage() {
  // Lots list state
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [page, setPage] = useState(1);

  // Filters
  const [productSearch, setProductSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("ALL");
  const [hasStockOnly, setHasStockOnly] = useState(true);

  // Suppliers for filter
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Dialog state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  // Product search for dialog
  const [dialogProductSearch, setDialogProductSearch] = useState("");
  const [dialogProductResults, setDialogProductResults] = useState<Product[]>([]);
  const [dialogProductLoading, setDialogProductLoading] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);
  const productSearchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Dialog suppliers
  const [dialogSuppliers, setDialogSuppliers] = useState<Supplier[]>([]);

  // New lot form
  const [newLot, setNewLot] = useState({
    productId: "",
    productName: "",
    supplierId: "",
    quantity: "",
    unitCost: "",
    invoiceNumber: "",
    acquiredAt: format(new Date(), "yyyy-MM-dd"),
  });

  // Debounced search timer for filter
  const filterSearchTimeout = useRef<NodeJS.Timeout | null>(null);
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");

  // Debounce filter product search
  useEffect(() => {
    if (filterSearchTimeout.current) {
      clearTimeout(filterSearchTimeout.current);
    }
    filterSearchTimeout.current = setTimeout(() => {
      setDebouncedProductSearch(productSearch);
      setPage(1);
    }, 400);
    return () => {
      if (filterSearchTimeout.current) {
        clearTimeout(filterSearchTimeout.current);
      }
    };
  }, [productSearch]);

  // Fetch suppliers on mount
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const res = await fetch("/api/suppliers?status=ativos&pageSize=100");
        if (res.ok) {
          const data = await res.json();
          const list = data.data || [];
          setSuppliers(list);
          setDialogSuppliers(list);
        }
      } catch (error) {
        console.error("Erro ao carregar fornecedores:", error);
      }
    };
    loadSuppliers();
  }, []);

  // Fetch lots
  const fetchLots = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      if (debouncedProductSearch) {
        params.set("search", debouncedProductSearch);
      }

      if (supplierFilter && supplierFilter !== "ALL") {
        params.set("supplierId", supplierFilter);
      }

      if (hasStockOnly) {
        params.set("hasStock", "true");
      }

      const res = await fetch(`/api/inventory/lots?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar lotes");

      const data = await res.json();
      setLots(data.data || []);
      setPagination(data.pagination || null);
    } catch (error: any) {
      console.error("Erro ao carregar lotes:", error);
      toast.error("Erro ao carregar lotes de estoque");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedProductSearch, supplierFilter, hasStockOnly]);

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

  // Search products for dialog
  const searchProducts = async (query: string) => {
    if (!query || query.length < 2) {
      setDialogProductResults([]);
      setShowProductDropdown(false);
      return;
    }

    setDialogProductLoading(true);
    try {
      const res = await fetch(
        `/api/products?search=${encodeURIComponent(query)}&pageSize=10`
      );
      if (res.ok) {
        const data = await res.json();
        setDialogProductResults(data.data || []);
        setShowProductDropdown(true);
      }
    } catch (error) {
      console.error("Erro ao buscar produtos:", error);
    } finally {
      setDialogProductLoading(false);
    }
  };

  // Handle dialog product search input
  const handleDialogProductSearch = (value: string) => {
    setDialogProductSearch(value);
    setNewLot((prev) => ({ ...prev, productId: "", productName: "" }));

    if (productSearchTimeout.current) {
      clearTimeout(productSearchTimeout.current);
    }
    productSearchTimeout.current = setTimeout(() => {
      searchProducts(value);
    }, 300);
  };

  // Select product from dropdown
  const selectProduct = (product: Product) => {
    setNewLot((prev) => ({
      ...prev,
      productId: product.id,
      productName: product.name,
    }));
    setDialogProductSearch(product.name);
    setShowProductDropdown(false);
    setDialogProductResults([]);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        productSearchRef.current &&
        !productSearchRef.current.contains(event.target as Node)
      ) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Create new lot
  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      if (!newLot.productId) {
        throw new Error("Selecione um produto da lista");
      }
      if (!newLot.quantity || parseFloat(newLot.quantity) <= 0) {
        throw new Error("Informe uma quantidade valida");
      }
      if (!newLot.unitCost || parseFloat(newLot.unitCost) <= 0) {
        throw new Error("Informe um custo unitario valido");
      }

      const body: Record<string, any> = {
        productId: newLot.productId,
        quantity: parseFloat(newLot.quantity),
        unitCost: parseFloat(newLot.unitCost),
      };

      if (newLot.supplierId) {
        body.supplierId = newLot.supplierId;
      }
      if (newLot.invoiceNumber) {
        body.invoiceNumber = newLot.invoiceNumber;
      }
      if (newLot.acquiredAt) {
        body.acquiredAt = new Date(newLot.acquiredAt).toISOString();
      }

      const res = await fetch("/api/inventory/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        const details = errData?.error?.details;
        const detailMsg =
          Array.isArray(details) && details.length > 0
            ? details
                .map(
                  (d: any) =>
                    `${d.field ? d.field + ": " : ""}${d.message}`
                )
                .join("; ")
            : null;
        const errMsg =
          detailMsg ||
          errData?.error?.message ||
          errData?.message ||
          "Erro ao criar lote";
        throw new Error(
          typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)
        );
      }

      toast.success("Entrada de estoque registrada com sucesso!");
      setShowNewDialog(false);
      resetNewLotForm();
      fetchLots();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  // Reset form
  const resetNewLotForm = () => {
    setNewLot({
      productId: "",
      productName: "",
      supplierId: "",
      quantity: "",
      unitCost: "",
      invoiceNumber: "",
      acquiredAt: format(new Date(), "yyyy-MM-dd"),
    });
    setDialogProductSearch("");
    setDialogProductResults([]);
    setShowProductDropdown(false);
  };

  // Qty remaining badge color
  const getQtyBadge = (qtyRemaining: number, qtyIn: number) => {
    if (qtyIn === 0) return "bg-gray-100 text-gray-800";
    const ratio = qtyRemaining / qtyIn;
    if (ratio >= 0.5) return "bg-green-100 text-green-800";
    if (ratio >= 0.2) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  // Summary calculations
  const totalLots = pagination?.total ?? lots.length;
  const totalStockValue = lots.reduce(
    (sum, lot) => sum + Number(lot.qtyRemaining) * Number(lot.unitCost),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/financeiro">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Lotes de Estoque (FIFO)</h1>
            <p className="text-muted-foreground">
              Controle de entradas e custos por lote
            </p>
          </div>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Entrada
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            {/* Product search */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Buscar Produto
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome ou SKU..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Supplier filter */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Fornecedor
              </Label>
              <Select
                value={supplierFilter}
                onValueChange={(value) => {
                  setSupplierFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Has stock checkbox */}
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasStock"
                  checked={hasStockOnly}
                  onCheckedChange={(checked) => {
                    setHasStockOnly(checked === true);
                    setPage(1);
                  }}
                />
                <Label
                  htmlFor="hasStock"
                  className="text-sm cursor-pointer select-none"
                >
                  Apenas com estoque
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary bar */}
      {!loading && lots.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-3 bg-muted/50 rounded-lg text-sm">
          <span className="font-medium">
            {totalLots} lote{totalLots !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground">|</span>
          <span className="text-muted-foreground">
            {formatCurrency(totalStockValue)} em estoque valorizado
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && lots.length === 0 && (
        <EmptyState
          icon={<Package className="h-12 w-12" />}
          title="Nenhum lote encontrado"
          description={
            productSearch || supplierFilter !== "ALL" || !hasStockOnly
              ? "Tente ajustar os filtros"
              : "Registre a primeira entrada de estoque"
          }
        />
      )}

      {/* Table */}
      {!loading && lots.length > 0 && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead className="text-right">Qtd Original</TableHead>
                    <TableHead className="text-right">Qtd Restante</TableHead>
                    <TableHead className="text-right">Custo Unit</TableHead>
                    <TableHead className="text-right">Custo Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {lot.product?.name || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lot.product?.sku || "-"}
                      </TableCell>
                      <TableCell>
                        {lot.supplier?.name || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lot.invoiceNumber || "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(lot.acquiredAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(lot.qtyIn)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="secondary"
                          className={getQtyBadge(
                            Number(lot.qtyRemaining),
                            Number(lot.qtyIn)
                          )}
                        >
                          {Number(lot.qtyRemaining)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatCurrency(Number(lot.unitCost))}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-semibold">
                        {formatCurrency(Number(lot.totalCost))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
              showInfo
            />
          )}
        </>
      )}

      {/* Dialog: New Lot Entry */}
      <Dialog
        open={showNewDialog}
        onOpenChange={(open) => {
          setShowNewDialog(open);
          if (!open) resetNewLotForm();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Entrada de Estoque</DialogTitle>
            <DialogDescription>
              Registre um novo lote de entrada de produto
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLot} className="space-y-4">
            {/* Product search */}
            <div className="space-y-2" ref={productSearchRef}>
              <Label>
                Produto <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite para buscar produto..."
                  value={dialogProductSearch}
                  onChange={(e) => handleDialogProductSearch(e.target.value)}
                  onFocus={() => {
                    if (dialogProductResults.length > 0) {
                      setShowProductDropdown(true);
                    }
                  }}
                  className="pl-9"
                />
                {dialogProductLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}

                {/* Product dropdown */}
                {showProductDropdown && dialogProductResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {dialogProductResults.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors"
                        onClick={() => selectProduct(product)}
                      >
                        <span className="font-medium">{product.name}</span>
                        {product.sku && (
                          <span className="text-muted-foreground ml-2">
                            ({product.sku})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {newLot.productId && (
                <p className="text-xs text-green-600">
                  Produto selecionado: {newLot.productName}
                </p>
              )}
            </div>

            {/* Supplier */}
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Select
                value={newLot.supplierId}
                onValueChange={(value) =>
                  setNewLot((prev) => ({
                    ...prev,
                    supplierId: value === "NONE" ? "" : value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Nenhum</SelectItem>
                  {dialogSuppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 grid-cols-2">
              {/* Quantity */}
              <div className="space-y-2">
                <Label>
                  Quantidade <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="0"
                  value={newLot.quantity}
                  onChange={(e) =>
                    setNewLot((prev) => ({
                      ...prev,
                      quantity: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              {/* Unit Cost */}
              <div className="space-y-2">
                <Label>
                  Custo Unitario <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newLot.unitCost}
                  onChange={(e) =>
                    setNewLot((prev) => ({
                      ...prev,
                      unitCost: e.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 grid-cols-2">
              {/* Invoice Number */}
              <div className="space-y-2">
                <Label>Numero da NF</Label>
                <Input
                  placeholder="Ex: 12345"
                  value={newLot.invoiceNumber}
                  onChange={(e) =>
                    setNewLot((prev) => ({
                      ...prev,
                      invoiceNumber: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Acquisition Date */}
              <div className="space-y-2">
                <Label>Data de Entrada</Label>
                <Input
                  type="date"
                  value={newLot.acquiredAt}
                  onChange={(e) =>
                    setNewLot((prev) => ({
                      ...prev,
                      acquiredAt: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Calculated total */}
            {newLot.quantity && newLot.unitCost && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  Custo Total Estimado:{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(
                      parseFloat(newLot.quantity) *
                        parseFloat(newLot.unitCost)
                    )}
                  </span>
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowNewDialog(false);
                  resetNewLotForm();
                }}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  "Registrar Entrada"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="financial.view">
      <LotesEstoquePage />
    </ProtectedRoute>
  );
}
