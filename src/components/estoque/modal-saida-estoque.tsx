"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Minus, Loader2, Package, AlertTriangle } from "lucide-react";

interface ModalSaidaEstoqueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto?: any;
}

export function ModalSaidaEstoque({ open, onOpenChange, produto }: ModalSaidaEstoqueProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    produtoId: produto?.id || "",
    quantidade: "",
    motivo: "venda",
    observacoes: "",
  });

  const estoqueAtual = produto?.estoque || 0;
  const quantidadeSaida = Number(formData.quantidade) || 0;
  const estoqueAposMovimentacao = estoqueAtual - quantidadeSaida;
  const estoqueInsuficiente = quantidadeSaida > estoqueAtual;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (estoqueInsuficiente) {
      toast({
        title: "Estoque insuficiente!",
        description: "A quantidade solicitada é maior que o estoque disponível.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    // Simular saída de estoque
    setTimeout(() => {
      toast({
        title: "Saída registrada!",
        description: `${formData.quantidade} unidades removidas do estoque.`,
      });

      // Limpar formulário
      setFormData({
        produtoId: "",
        quantidade: "",
        motivo: "venda",
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
            <Minus className="h-5 w-5" />
            Saída de Estoque
          </DialogTitle>
          <DialogDescription>
            Registre a saída de produtos do estoque
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Produto Selecionado */}
          {produto && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
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

          {/* Quantidade */}
          <div className="space-y-2">
            <Label htmlFor="quantidade">
              Quantidade <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quantidade"
              type="number"
              min="1"
              max={estoqueAtual}
              placeholder="Ex: 5"
              value={formData.quantidade}
              onChange={(e) => setFormData({ ...formData, quantidade: e.target.value })}
              required
              disabled={loading}
            />
            {produto && (
              <p className="text-xs text-muted-foreground">
                Máximo disponível: {estoqueAtual} unidades
              </p>
            )}
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
                <SelectItem value="venda">Venda para Cliente</SelectItem>
                <SelectItem value="perda">Perda ou Avaria</SelectItem>
                <SelectItem value="devolucao_fornecedor">Devolução para Fornecedor</SelectItem>
                <SelectItem value="uso_interno">Uso Interno</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="ajuste_inventario">Ajuste de Inventário</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              placeholder="Informações adicionais sobre a saída..."
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Alerta de Estoque Insuficiente */}
          {estoqueInsuficiente && formData.quantidade && (
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
          {formData.quantidade && !estoqueInsuficiente && produto && (
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
                  <span className={estoqueAposMovimentacao <= produto.estoqueMinimo ? "text-red-600" : ""}>
                    {estoqueAposMovimentacao} unidades
                  </span>
                </div>
                {estoqueAposMovimentacao <= produto.estoqueMinimo && (
                  <p className="text-xs text-orange-700 mt-2">
                    ⚠️ O estoque ficará abaixo do mínimo ({produto.estoqueMinimo} unidades)
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
