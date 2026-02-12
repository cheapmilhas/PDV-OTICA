"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Unlock, Loader2, Banknote } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ModalAberturaCaixaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModalAberturaCaixa({ open, onOpenChange }: ModalAberturaCaixaProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    valorAbertura: "200.00",
    observacoes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/cash/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingFloatAmount: Number(formData.valorAbertura),
          notes: formData.observacoes || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Erro ao abrir caixa");
      }

      toast({
        title: "Caixa aberto com sucesso!",
        description: `Valor de abertura: ${formatCurrency(Number(formData.valorAbertura))}`,
      });

      // Limpar formulário
      setFormData({
        valorAbertura: "200.00",
        observacoes: "",
      });

      onOpenChange(false);

      // Recarregar página para atualizar status
      window.location.reload();
    } catch (error: any) {
      console.error("Erro ao abrir caixa:", error);
      toast({
        title: "Erro ao abrir caixa",
        description: error.message || "Ocorreu um erro ao abrir o caixa",
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
            <Unlock className="h-5 w-5" />
            Abertura de Caixa
          </DialogTitle>
          <DialogDescription>
            Informe o valor inicial em dinheiro para abertura do caixa
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informações do Operador */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-semibold mb-2">Informações da Abertura</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operador:</span>
                <span className="font-medium">Carlos Vendedor</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data/Hora:</span>
                <span className="font-medium">
                  {new Date().toLocaleString("pt-BR")}
                </span>
              </div>
            </div>
          </div>

          {/* Valor de Abertura */}
          <div className="space-y-2">
            <Label htmlFor="valor">
              Valor de Abertura (Dinheiro) <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Banknote className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0"
                placeholder="200.00"
                className="pl-9"
                value={formData.valorAbertura}
                onChange={(e) => setFormData({ ...formData, valorAbertura: e.target.value })}
                required
                disabled={loading}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Valor em dinheiro que será utilizado como troco inicial
            </p>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="obs">Observações (opcional)</Label>
            <Textarea
              id="obs"
              placeholder="Informações adicionais sobre a abertura..."
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Resumo */}
          {formData.valorAbertura && (
            <div className="rounded-lg border bg-green-50 p-4">
              <p className="text-sm font-medium text-green-900">Valor de Abertura</p>
              <p className="text-3xl font-bold text-green-600 mt-1">
                {formatCurrency(Number(formData.valorAbertura))}
              </p>
            </div>
          )}

          {/* Avisos */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-900">
              <strong>⚠️ Atenção:</strong> Após abrir o caixa, certifique-se de que o valor em dinheiro corresponde ao informado.
            </p>
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
                  Abrindo...
                </>
              ) : (
                <>
                  <Unlock className="mr-2 h-4 w-4" />
                  Abrir Caixa
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
