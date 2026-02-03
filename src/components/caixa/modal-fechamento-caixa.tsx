"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Lock, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ModalFechamentoCaixaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caixaInfo: any;
  resumoPagamentos: any[];
}

export function ModalFechamentoCaixa({ open, onOpenChange, caixaInfo, resumoPagamentos }: ModalFechamentoCaixaProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    valorDinheiro: "",
    valorCredito: "",
    valorDebito: "",
    valorPix: "",
    observacoes: "",
  });

  const valorEsperadoDinheiro = resumoPagamentos.find(p => p.forma === "Dinheiro")?.valor || 0;
  const valorEsperadoCredito = resumoPagamentos.find(p => p.forma === "Crédito")?.valor || 0;
  const valorEsperadoDebito = resumoPagamentos.find(p => p.forma === "Débito")?.valor || 0;
  const valorEsperadoPix = resumoPagamentos.find(p => p.forma === "PIX")?.valor || 0;

  const valorContadoDinheiro = Number(formData.valorDinheiro) || 0;
  const valorContadoCredito = Number(formData.valorCredito) || 0;
  const valorContadoDebito = Number(formData.valorDebito) || 0;
  const valorContadoPix = Number(formData.valorPix) || 0;

  const diferencaDinheiro = valorContadoDinheiro - valorEsperadoDinheiro;
  const diferencaCredito = valorContadoCredito - valorEsperadoCredito;
  const diferencaDebito = valorContadoDebito - valorEsperadoDebito;
  const diferencaPix = valorContadoPix - valorEsperadoPix;

  const totalEsperado = valorEsperadoDinheiro + valorEsperadoCredito + valorEsperadoDebito + valorEsperadoPix;
  const totalContado = valorContadoDinheiro + valorContadoCredito + valorContadoDebito + valorContadoPix;
  const diferencaTotal = totalContado - totalEsperado;

  const caixaFechado = Math.abs(diferencaTotal) < 0.01; // tolerância de 1 centavo

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simular fechamento de caixa
    setTimeout(() => {
      toast({
        title: "Caixa fechado com sucesso!",
        description: caixaFechado
          ? "Caixa conferido sem divergências."
          : `Divergência de ${formatCurrency(Math.abs(diferencaTotal))} ${diferencaTotal > 0 ? "sobra" : "falta"}.`,
        variant: caixaFechado ? "default" : "destructive",
      });

      // Limpar formulário
      setFormData({
        valorDinheiro: "",
        valorCredito: "",
        valorDebito: "",
        valorPix: "",
        observacoes: "",
      });

      setLoading(false);
      onOpenChange(false);

      // Recarregar página para atualizar status
      window.location.reload();
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Fechamento de Caixa
          </DialogTitle>
          <DialogDescription>
            Confira os valores e feche o caixa do dia
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informações do Caixa */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="font-semibold mb-2">Informações do Caixa</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operador:</span>
                <span className="font-medium">{caixaInfo.operador}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Abertura:</span>
                <span className="font-medium">{caixaInfo.dataAbertura}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor Abertura:</span>
                <span className="font-medium">{formatCurrency(caixaInfo.valorAbertura)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fechamento:</span>
                <span className="font-medium">{new Date().toLocaleString("pt-BR")}</span>
              </div>
            </div>
          </div>

          <Separator />

          <h4 className="font-semibold">Conferência de Valores</h4>
          <p className="text-sm text-muted-foreground">
            Informe os valores contados para cada forma de pagamento
          </p>

          {/* Conferência por Forma de Pagamento */}
          <div className="space-y-4">
            {/* Dinheiro */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="dinheiro">💵 Dinheiro</Label>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">Esperado:</p>
                  <p className="font-semibold">{formatCurrency(valorEsperadoDinheiro)}</p>
                </div>
              </div>
              <Input
                id="dinheiro"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.valorDinheiro}
                onChange={(e) => setFormData({ ...formData, valorDinheiro: e.target.value })}
                required
                disabled={loading}
              />
              {formData.valorDinheiro && (
                <div className={`mt-2 text-sm ${
                  Math.abs(diferencaDinheiro) < 0.01
                    ? "text-green-600"
                    : "text-orange-600"
                }`}>
                  Diferença: {diferencaDinheiro > 0 ? "+" : ""}{formatCurrency(diferencaDinheiro)}
                </div>
              )}
            </div>

            {/* Crédito */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="credito">💳 Crédito</Label>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">Esperado:</p>
                  <p className="font-semibold">{formatCurrency(valorEsperadoCredito)}</p>
                </div>
              </div>
              <Input
                id="credito"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.valorCredito}
                onChange={(e) => setFormData({ ...formData, valorCredito: e.target.value })}
                required
                disabled={loading}
              />
              {formData.valorCredito && (
                <div className={`mt-2 text-sm ${
                  Math.abs(diferencaCredito) < 0.01
                    ? "text-green-600"
                    : "text-orange-600"
                }`}>
                  Diferença: {diferencaCredito > 0 ? "+" : ""}{formatCurrency(diferencaCredito)}
                </div>
              )}
            </div>

            {/* Débito */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="debito">💳 Débito</Label>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">Esperado:</p>
                  <p className="font-semibold">{formatCurrency(valorEsperadoDebito)}</p>
                </div>
              </div>
              <Input
                id="debito"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.valorDebito}
                onChange={(e) => setFormData({ ...formData, valorDebito: e.target.value })}
                required
                disabled={loading}
              />
              {formData.valorDebito && (
                <div className={`mt-2 text-sm ${
                  Math.abs(diferencaDebito) < 0.01
                    ? "text-green-600"
                    : "text-orange-600"
                }`}>
                  Diferença: {diferencaDebito > 0 ? "+" : ""}{formatCurrency(diferencaDebito)}
                </div>
              )}
            </div>

            {/* PIX */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="pix">🔑 PIX</Label>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">Esperado:</p>
                  <p className="font-semibold">{formatCurrency(valorEsperadoPix)}</p>
                </div>
              </div>
              <Input
                id="pix"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.valorPix}
                onChange={(e) => setFormData({ ...formData, valorPix: e.target.value })}
                required
                disabled={loading}
              />
              {formData.valorPix && (
                <div className={`mt-2 text-sm ${
                  Math.abs(diferencaPix) < 0.01
                    ? "text-green-600"
                    : "text-orange-600"
                }`}>
                  Diferença: {diferencaPix > 0 ? "+" : ""}{formatCurrency(diferencaPix)}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Resumo Total */}
          {totalContado > 0 && (
            <div className={`rounded-lg border p-4 ${
              caixaFechado
                ? "border-green-200 bg-green-50"
                : Math.abs(diferencaTotal) > 10
                ? "border-red-200 bg-red-50"
                : "border-orange-200 bg-orange-50"
            }`}>
              <div className="flex items-center gap-2 mb-3">
                {caixaFechado ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                )}
                <h4 className="font-semibold">Resumo do Fechamento</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total Esperado:</span>
                  <span className="font-semibold">{formatCurrency(totalEsperado)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Contado:</span>
                  <span className="font-semibold">{formatCurrency(totalContado)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Diferença:</span>
                  <span className={
                    caixaFechado
                      ? "text-green-600"
                      : diferencaTotal > 0
                      ? "text-blue-600"
                      : "text-red-600"
                  }>
                    {diferencaTotal > 0 ? "+" : ""}{formatCurrency(diferencaTotal)}
                  </span>
                </div>
                {caixaFechado && (
                  <p className="text-sm text-green-700 mt-2">
                    ✅ Caixa conferido! Valores estão corretos.
                  </p>
                )}
                {!caixaFechado && Math.abs(diferencaTotal) > 10 && (
                  <p className="text-sm text-red-700 mt-2">
                    ⚠️ Diferença significativa detectada. Revise os valores antes de fechar.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="obs">Observações</Label>
            <Textarea
              id="obs"
              placeholder="Informações sobre divergências ou observações do fechamento..."
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
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
            <Button
              type="submit"
              className="flex-1"
              disabled={loading || totalContado === 0}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fechando...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Fechar Caixa
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
