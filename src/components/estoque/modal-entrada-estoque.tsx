"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Package, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockMovementType } from "@prisma/client";
import { ModalProdutoRapido } from "./modal-produto-rapido";
import { ModalFornecedorRapido } from "./modal-fornecedor-rapido";

interface ModalEntradaEstoqueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto?: any;
  onSuccess?: () => void;
}

export function ModalEntradaEstoque({ open, onOpenChange, produto, onSuccess }: ModalEntradaEstoqueProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [openProductCombo, setOpenProductCombo] = useState(false);
  const [openSupplierCombo, setOpenSupplierCombo] = useState(false);

  const [modalProdutoOpen, setModalProdutoOpen] = useState(false);
  const [modalFornecedorOpen, setModalFornecedorOpen] = useState(false);

  const [formData, setFormData] = useState<{
    productId: string;
    quantity: string;
    supplierId: string;
    invoiceNumber: string;
    type: StockMovementType;
    reason: string;
    notes: string;
  }>({
    productId: produto?.id || "",
    quantity: "",
    supplierId: "",
    invoiceNumber: "",
    type: StockMovementType.PURCHASE,
    reason: "",
    notes: "",
  });

  // Atualizar productId quando produto mudar
  useEffect(() => {
    if (produto?.id) {
      setFormData(prev => ({ ...prev, productId: produto.id }));
    }
  }, [produto]);

  // Buscar produtos
  useEffect(() => {
    if (open && !produto) {
      fetchProducts();
    }
  }, [open, produto]);

  // Buscar fornecedores
  useEffect(() => {
    if (open) {
      fetchSuppliers();
    }
  }, [open]);

  async function fetchProducts(search?: string) {
    setLoadingProducts(true);
    try {
      const params = new URLSearchParams({
        pageSize: "100",
        status: "ativos",
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar produtos");

      const data = await res.json();
      setProducts(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error("Erro ao carregar produtos:", error);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function fetchSuppliers(search?: string) {
    setLoadingSuppliers(true);
    try {
      const params = new URLSearchParams({
        pageSize: "100",
        status: "ativos",
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/suppliers?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar fornecedores");

      const data = await res.json();
      setSuppliers(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error("Erro ao carregar fornecedores:", error);
    } finally {
      setLoadingSuppliers(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/stock-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: formData.productId,
          type: formData.type,
          quantity: parseInt(formData.quantity),
          supplierId: formData.supplierId || undefined,
          invoiceNumber: formData.invoiceNumber || undefined,
          reason: formData.reason || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao registrar entrada");
      }

      toast({
        title: "Entrada registrada!",
        description: `${formData.quantity} unidades adicionadas ao estoque.`,
      });

      // Limpar formulário
      setFormData({
        productId: "",
        quantity: "",
        supplierId: "",
        invoiceNumber: "",
        type: StockMovementType.PURCHASE,
        reason: "",
        notes: "",
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao registrar entrada",
        description: error.message || "Ocorreu um erro ao registrar a entrada de estoque.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find(p => p.id === formData.productId) || produto;
  const selectedSupplier = suppliers.find(s => s.id === formData.supplierId);

  return (
    <>
      <ModalProdutoRapido
        open={modalProdutoOpen}
        onOpenChange={setModalProdutoOpen}
        onSuccess={(newProduct) => {
          fetchProducts();
          setFormData({ ...formData, productId: newProduct.id });
        }}
      />

      <ModalFornecedorRapido
        open={modalFornecedorOpen}
        onOpenChange={setModalFornecedorOpen}
        onSuccess={(newSupplier) => {
          fetchSuppliers();
          setFormData({ ...formData, supplierId: newSupplier.id });
        }}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Entrada de Estoque
            </DialogTitle>
            <DialogDescription>
              Registre a entrada de produtos no estoque
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Produto Selecionado */}
            {produto && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{produto.name}</p>
                    <p className="text-sm text-muted-foreground">
                      SKU: {produto.sku} • Estoque atual: {produto.stockQty}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Produto (ComboBox com botão +) */}
            {!produto && (
              <div className="space-y-2">
                <Label>
                  Produto <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  <Popover open={openProductCombo} onOpenChange={setOpenProductCombo}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openProductCombo}
                        className="flex-1 justify-between"
                        disabled={loading}
                      >
                        {selectedProduct
                          ? `${selectedProduct.name} (${selectedProduct.sku})`
                          : "Selecione um produto..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                      <Command>
                        <CommandInput
                          placeholder="Buscar produto..."
                          onValueChange={(search) => fetchProducts(search)}
                        />
                        <CommandEmpty>
                          {loadingProducts ? "Carregando..." : "Nenhum produto encontrado."}
                        </CommandEmpty>
                        <CommandGroup className="max-h-[300px] overflow-auto">
                          {products.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={product.id}
                              onSelect={() => {
                                setFormData({ ...formData, productId: product.id });
                                setOpenProductCombo(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.productId === product.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div>
                                <p className="font-medium">{product.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  SKU: {product.sku} • Estoque: {product.stockQty}
                                </p>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setModalProdutoOpen(true)}
                    disabled={loading}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Quantidade e Tipo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  Quantidade <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  placeholder="Ex: 10"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">
                  Tipo de Entrada <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value as StockMovementType })}
                  required
                  disabled={loading}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={StockMovementType.PURCHASE}>Compra de Fornecedor</SelectItem>
                    <SelectItem value={StockMovementType.CUSTOMER_RETURN}>Devolução de Cliente</SelectItem>
                    <SelectItem value={StockMovementType.ADJUSTMENT}>Ajuste de Inventário</SelectItem>
                    <SelectItem value={StockMovementType.OTHER}>Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fornecedor (ComboBox com botão +) */}
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <div className="flex gap-2">
                <Popover open={openSupplierCombo} onOpenChange={setOpenSupplierCombo}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openSupplierCombo}
                      className="flex-1 justify-between"
                      disabled={loading}
                    >
                      {selectedSupplier ? selectedSupplier.name : "Selecione um fornecedor..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Buscar fornecedor..."
                        onValueChange={(search) => fetchSuppliers(search)}
                      />
                      <CommandEmpty>
                        {loadingSuppliers ? "Carregando..." : "Nenhum fornecedor encontrado."}
                      </CommandEmpty>
                      <CommandGroup className="max-h-[300px] overflow-auto">
                        {suppliers.map((supplier) => (
                          <CommandItem
                            key={supplier.id}
                            value={supplier.id}
                            onSelect={() => {
                              setFormData({ ...formData, supplierId: supplier.id });
                              setOpenSupplierCombo(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.supplierId === supplier.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {supplier.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setModalFornecedorOpen(true)}
                  disabled={loading}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Nota Fiscal */}
            <div className="space-y-2">
              <Label htmlFor="invoice">Nota Fiscal</Label>
              <Input
                id="invoice"
                placeholder="Número da NF"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                disabled={loading}
              />
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Informações adicionais sobre a entrada..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                disabled={loading}
                rows={3}
              />
            </div>

            {/* Botões */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Registrar Entrada
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
