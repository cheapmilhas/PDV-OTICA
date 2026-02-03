"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Package } from "lucide-react";

interface ModalEntradaEstoqueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto?: any;
}

export function ModalEntradaEstoque({ open, onOpenChange, produto }: ModalEntradaEstoqueProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    produtoId: produto?.id || "",
    quantidade: "",
    custoUnitario: produto?.custoUnitario?.toString() || "",
    fornecedor: produto?.fornecedor || "",
    notaFiscal: "",
    motivo: "compra_fornecedor",
    observacoes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simular entrada de estoque
    setTimeout(() => {
      toast({
        title: "Entrada registrada!",
        description: `${formData.quantidade} unidades adicionadas ao estoque.`,
      });

      // Limpar formulário
      setFormData({
        produtoId: "",
        quantidade: "",
        custoUnitario: "",
        fornecedor: "",
        notaFiscal: "",
        motivo: "compra_fornecedor",
        observacoes: "",
      });

      setLoading(false);
      onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
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
                  <p className="font-medium">{produto.nome}</p>
                  <p className="text-sm text-muted-foreground">
                    Código: {produto.codigo} • Estoque atual: {produto.estoque}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Produto (se não houver pré-selecionado) */}
          {!produto && (
            <div className="space-y-2">
              <Label htmlFor="produto">
                Produto <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.produtoId}
                onValueChange={(value) => setFormData({ ...formData, produtoId: value })}
                required
                disabled={loading}
              >
                <SelectTrigger id="produto">
                  <SelectValue placeholder="Selecione um produto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ray-Ban Aviador Clássico RB3025</SelectItem>
                  <SelectItem value="2">Oakley Holbrook OO9102</SelectItem>
                  <SelectItem value="3">Lente Transitions Gen 8 1.67</SelectItem>
                  <SelectItem value="4">Ray-Ban Wayfarer RB2140</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Quantidade */}
            <div className="space-y-2">
              <Label htmlFor="quantidade">
                Quantidade <span className="text-destructive">*</span>
              </Label>
              <Input
                id="quantidade"
                type="number"
                min="1"
                placeholder="Ex: 10"
                value={formData.quantidade}
                onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
                required
                disabled={loading}
              />
            </div>

            {/* Custo Unitário */}
            <div className="space-y-2">
              <Label htmlFor="custo">
                Custo Unitário <span className="text-destructive">*</span>
              </Label>
              <Input
                id="custo"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 450.00"
                value={formData.custoUnitario}
                onChange={(e) => setFormData({ ...formData, custoUnitario: e.target.value })}
                required
                disabled={loading}
              />
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label htmlFor="motivo">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.motivo}
              onValueChange={(value) => setFormData({ ...formData, motivo: value })}
              required
              disabled={loading}
            >
              <SelectTrigger id="motivo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compra_fornecedor">Compra de Fornecedor</SelectItem>
                <SelectItem value="devolucao_cliente">Devolução de Cliente</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="ajuste_inventario">Ajuste de Inventário</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Fornecedor */}
            <div className="space-y-2">
              <Label htmlFor="fornecedor">Fornecedor</Label>
              <Input
                id="fornecedor"
                placeholder="Nome do fornecedor"
                value={formData.fornecedor}
                onChange={(e) => setFormData({ ...formData, fornecedor: e.target.value })}
                disabled={loading}
              />
            </div>

            {/* Nota Fiscal */}
            <div className="space-y-2">
              <Label htmlFor="nota">Nota Fiscal</Label>
              <Input
                id="nota"
                placeholder="Número da NF"
                value={formData.notaFiscal}
                onChange={(e) => setFormData({ ...formData, notaFiscal: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              placeholder="Informações adicionais sobre a entrada..."
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Resumo */}
          {formData.quantidade && formData.custoUnitario && (
            <div className="rounded-lg border bg-blue-50 p-3">
              <p className="text-sm font-medium text-blue-900">Valor Total da Entrada</p>
              <p className="text-2xl font-bold text-blue-600">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(Number(formData.quantidade) * Number(formData.custoUnitario))}
              </p>
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
  );
}
