"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ModalReforcoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModalReforco({ open, onOpenChange }: ModalReforcoProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    valor: "",
    motivo: "troco",
    observacoes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simular reforço
    setTimeout(() => {
      toast({
        title: "Reforço registrado!",
        description: `${formatCurrency(Number(formData.valor))} adicionado ao caixa.`,
      });

      // Limpar formulário
      setFormData({
        valor: "",
        motivo: "troco",
        observacoes: "",
      });

      setLoading(false);
      onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-blue-600" />
            Reforço de Caixa
          </DialogTitle>
          <DialogDescription>
            Registre a adição de dinheiro ao caixa
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informações */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-semibold mb-2">Informações do Reforço</h4>
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

          {/* Valor */}
          <div className="space-y-2">
            <Label htmlFor="valor">
              Valor do Reforço <span className="text-destructive">*</span>
            </Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={formData.valor}
              onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Valor em dinheiro que será adicionado ao caixa
            </p>
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
                <SelectItem value="troco">Reposição de Troco</SelectItem>
                <SelectItem value="saque">Saque Bancário</SelectItem>
                <SelectItem value="correcao">Correção de Caixa</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              placeholder="Informações adicionais sobre o reforço..."
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Resumo */}
          {formData.valor && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-900">Valor do Reforço</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">
                +{formatCurrency(Number(formData.valor))}
              </p>
            </div>
          )}

          {/* Avisos */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm text-green-900">
              <strong>💡 Dica:</strong> Certifique-se de adicionar o valor correto ao caixa físico.
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
            <Button
              type="submit"
              className="flex-1"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Registrar Reforço
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
