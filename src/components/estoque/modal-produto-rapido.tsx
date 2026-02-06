"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package } from "lucide-react";
import { ProductType } from "@prisma/client";

interface ModalProdutoRapidoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (product: any) => void;
}

export function ModalProdutoRapido({ open, onOpenChange, onSuccess }: ModalProdutoRapidoProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    type: "FRAME" as ProductType,
    salePrice: "",
    costPrice: "",
    stockMin: "5",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          salePrice: parseFloat(formData.salePrice),
          costPrice: parseFloat(formData.costPrice),
          stockMin: parseInt(formData.stockMin),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao criar produto");
      }

      const product = await response.json();

      toast({
        title: "Produto criado!",
        description: `${formData.name} foi criado com sucesso.`,
      });

      // Limpar formulário
      setFormData({
        name: "",
        sku: "",
        type: "FRAME",
        salePrice: "",
        costPrice: "",
        stockMin: "5",
      });

      onSuccess?.(product);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao criar produto",
        description: error.message || "Ocorreu um erro ao criar o produto.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Criar Produto Rápido
          </DialogTitle>
          <DialogDescription>
            Preencha os dados básicos do produto
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Nome do Produto <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Ex: Ray-Ban Aviador"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          {/* SKU e Tipo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">
                SKU <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sku"
                placeholder="Ex: RB-AV-001"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">
                Tipo <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as ProductType })}
                required
                disabled={loading}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FRAME">Armação</SelectItem>
                  <SelectItem value="SUNGLASSES">Óculos de Sol</SelectItem>
                  <SelectItem value="CONTACT_LENS">Lente de Contato</SelectItem>
                  <SelectItem value="LENS_SERVICE">Serviço de Lente</SelectItem>
                  <SelectItem value="ACCESSORY">Acessório</SelectItem>
                  <SelectItem value="SERVICE">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preços */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="costPrice">
                Preço de Custo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="costPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.costPrice}
                onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="salePrice">
                Preço de Venda <span className="text-destructive">*</span>
              </Label>
              <Input
                id="salePrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.salePrice}
                onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Estoque Mínimo */}
          <div className="space-y-2">
            <Label htmlFor="stockMin">Estoque Mínimo</Label>
            <Input
              id="stockMin"
              type="number"
              min="0"
              placeholder="5"
              value={formData.stockMin}
              onChange={(e) => setFormData({ ...formData, stockMin: e.target.value })}
              disabled={loading}
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
                  Criando...
                </>
              ) : (
                "Criar Produto"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
