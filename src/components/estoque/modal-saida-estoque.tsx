"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Minus, Loader2, Package, AlertTriangle, Check, ChevronsUpDown } from "lucide-react";
import { StockMovementType } from "@prisma/client";
import { cn } from "@/lib/utils";

interface ModalSaidaEstoqueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto?: any;
  onSuccess?: () => void;
}

export function ModalSaidaEstoque({ open, onOpenChange, produto, onSuccess }: ModalSaidaEstoqueProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [openProductCombo, setOpenProductCombo] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(produto || null);

  const [formData, setFormData] = useState<{
    productId: string;
    quantity: string;
    type: StockMovementType;
    targetBranchId: string;
    reason: string;
    notes: string;
  }>({
    productId: produto?.id || "",
    quantity: "",
    type: StockMovementType.SALE,
    targetBranchId: "",
    reason: "",
    notes: "",
  });

  const estoqueAtual = selectedProduct?.stockQty || 0;
  const quantidadeSaida = Number(formData.quantity) || 0;
  const estoqueAposMovimentacao = estoqueAtual - quantidadeSaida;
  const estoqueInsuficiente = quantidadeSaida > estoqueAtual;
  const isTransferencia = formData.type === StockMovementType.TRANSFER_OUT;

  // Buscar produtos quando o modal abrir e não houver produto pré-selecionado
  useEffect(() => {
    if (open && !produto) {
      fetchProducts();
    }
    if (open && produto) {
      setSelectedProduct(produto);
      setFormData(prev => ({ ...prev, productId: produto.id }));
    }
  }, [open, produto]);

  // Buscar filiais quando o modal abrir e o tipo for transferência
  useEffect(() => {
    if (open && isTransferencia) {
      fetchBranches();
    }
  }, [open, isTransferencia]);

  async function fetchProducts() {
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Erro ao buscar produtos");

      const data = await res.json();
      setProducts(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error("Erro ao carregar produtos:", error);
      toast({
        title: "Erro ao carregar produtos",
        description: "Não foi possível carregar a lista de produtos.",
        variant: "destructive",
      });
    } finally {
      setLoadingProducts(false);
    }
  }

  async function fetchBranches() {
    setLoadingBranches(true);
    try {
      const res = await fetch("/api/branches");
      if (!res.ok) throw new Error("Erro ao buscar filiais");

      const data = await res.json();
      setBranches(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error("Erro ao carregar filiais:", error);
      toast({
        title: "Erro ao carregar filiais",
        description: "Não foi possível carregar a lista de filiais.",
        variant: "destructive",
      });
    } finally {
      setLoadingBranches(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (estoqueInsuficiente && produto) {
      toast({
        title: "Estoque insuficiente!",
        description: "A quantidade solicitada é maior que o estoque disponível.",
        variant: "destructive",
      });
      return;
    }

    if (isTransferencia && !formData.targetBranchId) {
      toast({
        title: "Filial de destino obrigatória!",
        description: "Selecione a filial de destino para a transferência.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Usar sempre o endpoint padrão de stock-movements
      const response = await fetch("/api/stock-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: formData.productId,
          type: formData.type,
          quantity: parseInt(formData.quantity),
          ...(isTransferencia && formData.targetBranchId && {
            targetBranchId: formData.targetBranchId
          }),
          reason: formData.reason || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao registrar movimentação");
      }

      toast({
        title: isTransferencia ? "Transferência registrada!" : "Saída registrada!",
        description: isTransferencia
          ? `${formData.quantity} unidades transferidas.`
          : `${formData.quantity} unidades removidas do estoque.`,
      });

      // Limpar formulário
      setFormData({
        productId: "",
        quantity: "",
        type: StockMovementType.SALE,
        targetBranchId: "",
        reason: "",
        notes: "",
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao registrar saída",
        description: error.message || "Ocorreu um erro ao registrar a saída de estoque.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Minus className="h-5 w-5" />
            Saída de Estoque
          </DialogTitle>
          <DialogDescription>
            Registre a saída de produtos do estoque
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Seleção de Produto */}
          {!produto && (
            <div className="space-y-2">
              <Label>
                Produto <span className="text-destructive">*</span>
              </Label>
              <Popover open={openProductCombo} onOpenChange={setOpenProductCombo}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openProductCombo}
                    className="w-full justify-between"
                    disabled={loading || loadingProducts}
                  >
                    {selectedProduct ? (
                      <span className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {selectedProduct.name}
                      </span>
                    ) : (
                      "Selecione o produto..."
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[500px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar produto..." />
                    <CommandList>
                      <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                      <CommandGroup>
                        {products.map((prod) => (
                          <CommandItem
                            key={prod.id}
                            value={`${prod.name} ${prod.sku}`}
                            onSelect={() => {
                              setSelectedProduct(prod);
                              setFormData({ ...formData, productId: prod.id });
                              setOpenProductCombo(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedProduct?.id === prod.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span className="font-medium">{prod.name}</span>
                              <span className="text-xs text-muted-foreground">
                                SKU: {prod.sku} • Estoque: {prod.stockQty}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Produto Selecionado (quando vem como prop) */}
          {produto && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">{produto.name}</p>
                  <p className="text-sm text-muted-foreground">
                    SKU: {produto.sku} • Estoque atual: {produto.stockQty}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info do Produto Selecionado (quando selecionado via combobox) */}
          {!produto && selectedProduct && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">{selectedProduct.name}</p>
                  <p className="text-sm text-muted-foreground">
                    SKU: {selectedProduct.sku} • Estoque atual: {selectedProduct.stockQty}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Quantidade */}
          <div className="space-y-2">
            <Label htmlFor="quantity">
              Quantidade <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              max={estoqueAtual}
              placeholder="Ex: 5"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              required
              disabled={loading}
            />
            {(produto || selectedProduct) && (
              <p className="text-xs text-muted-foreground">
                Máximo disponível: {estoqueAtual} unidades
              </p>
            )}
          </div>

          {/* Tipo de Saída */}
          <div className="space-y-2">
            <Label htmlFor="type">
              Tipo de Saída <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value as StockMovementType, targetBranchId: "" })}
              required
              disabled={loading}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={StockMovementType.SALE}>Venda para Cliente</SelectItem>
                <SelectItem value={StockMovementType.LOSS}>Perda ou Avaria</SelectItem>
                <SelectItem value={StockMovementType.SUPPLIER_RETURN}>Devolução para Fornecedor</SelectItem>
                <SelectItem value={StockMovementType.INTERNAL_USE}>Uso Interno</SelectItem>
                <SelectItem value="TRANSFER_OUT">Transferência entre Filiais</SelectItem>
                <SelectItem value={StockMovementType.OTHER}>Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filial de Destino (apenas se for transferência) */}
          {isTransferencia && (
            <div className="space-y-2">
              <Label htmlFor="targetBranch">
                Filial de Destino <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.targetBranchId}
                onValueChange={(value) => setFormData({ ...formData, targetBranchId: value })}
                required
                disabled={loading || loadingBranches}
              >
                <SelectTrigger id="targetBranch">
                  <SelectValue placeholder="Selecione a filial de destino" />
                </SelectTrigger>
                <SelectContent>
                  {loadingBranches ? (
                    <SelectItem value="loading" disabled>
                      Carregando filiais...
                    </SelectItem>
                  ) : branches.length === 0 ? (
                    <SelectItem value="empty" disabled>
                      Nenhuma filial disponível
                    </SelectItem>
                  ) : (
                    branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name} {branch.code && `(${branch.code})`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Motivo */}
          {!isTransferencia && (
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo</Label>
              <Input
                id="reason"
                placeholder="Descreva o motivo da saída..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                disabled={loading}
              />
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              placeholder="Informações adicionais sobre a saída..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Alerta de Estoque Insuficiente */}
          {estoqueInsuficiente && formData.quantity && (produto || selectedProduct) && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Estoque Insuficiente</p>
                  <p className="text-sm text-red-700">
                    A quantidade solicitada ({quantidadeSaida}) é maior que o estoque disponível ({estoqueAtual}).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Resumo da Movimentação */}
          {formData.quantity && !estoqueInsuficiente && (produto || selectedProduct) && (
            <div className="rounded-lg border bg-orange-50 p-3">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estoque Atual</span>
                  <span className="font-medium">{estoqueAtual} unidades</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quantidade de Saída</span>
                  <span className="font-medium text-orange-600">-{quantidadeSaida} unidades</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-1">
                  <span>Estoque Final</span>
                  <span className={estoqueAposMovimentacao <= (selectedProduct?.stockMin || produto?.stockMin || 0) ? "text-red-600" : ""}>
                    {estoqueAposMovimentacao} unidades
                  </span>
                </div>
                {estoqueAposMovimentacao <= (selectedProduct?.stockMin || produto?.stockMin || 0) && (
                  <p className="text-xs text-orange-700 mt-2">
                    ⚠️ O estoque ficará abaixo do mínimo ({selectedProduct?.stockMin || produto?.stockMin} unidades)
                  </p>
                )}
              </div>
            </div>
          )}

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
            <Button
              type="submit"
              className="flex-1"
              disabled={loading || estoqueInsuficiente}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Minus className="mr-2 h-4 w-4" />
                  Registrar Saída
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
