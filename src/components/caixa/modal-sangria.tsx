"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownCircle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ModalSangriaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModalSangria({ open, onOpenChange }: ModalSangriaProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    valor: "",
    motivo: "deposito_bancario",
    observacoes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simular sangria
    setTimeout(() => {
      toast({
        title: "Sangria registrada!",
        description: `${formatCurrency(Number(formData.valor))} retirado do caixa.`,
      });

      // Limpar formulário
      setFormData({
        valor: "",
        motivo: "deposito_bancario",
        observacoes: "",
      });

      setLoading(false);
      onOpenChange(false);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-red-600" />
            Sangria de Caixa
          </DialogTitle>
          <DialogDescription>
            Registre a retirada de dinheiro do caixa
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informações */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-semibold mb-2">Informações da Sangria</h4>
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
              Valor da Sangria <span className="text-destructive">*</span>
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
              Valor em dinheiro que será retirado do caixa
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
                <SelectItem value="deposito_bancario">Depósito Bancário</SelectItem>
                <SelectItem value="pagamento_fornecedor">Pagamento a Fornecedor</SelectItem>
                <SelectItem value="despesa_operacional">Despesa Operacional</SelectItem>
                <SelectItem value="troco_excedente">Excesso de Troco</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              placeholder="Informações adicionais sobre a sangria..."
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Resumo */}
          {formData.valor && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-900">Valor da Sangria</p>
              <p className="text-3xl font-bold text-red-600 mt-1">
                -{formatCurrency(Number(formData.valor))}
              </p>
            </div>
          )}

          {/* Avisos */}
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
            <p className="text-sm text-orange-900">
              <strong>⚠️ Atenção:</strong> Certifique-se de retirar o valor correto do caixa e registrar adequadamente.
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
              variant="destructive"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <ArrowDownCircle className="mr-2 h-4 w-4" />
                  Registrar Sangria
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
