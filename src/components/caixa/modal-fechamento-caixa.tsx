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
  movements?: any[]; // Adicionar movimentos completos
}

export function ModalFechamentoCaixa({ open, onOpenChange, caixaInfo, resumoPagamentos, movements = [] }: ModalFechamentoCaixaProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [closedShiftId, setClosedShiftId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    valorDinheiro: "",
    valorCredito: "",
    valorDebito: "",
    valorPix: "",
    observacoes: "",
  });

  // Calcular valor esperado de dinheiro como o backend faz:
  // Soma todos os movimentos CASH (IN - OUT)
  const cashMovements = movements.filter(m => m.method === "CASH");
  const totalIn = cashMovements
    .filter(m => m.direction === "IN")
    .reduce((sum, m) => sum + m.amount, 0);
  const totalOut = cashMovements
    .filter(m => m.direction === "OUT")
    .reduce((sum, m) => sum + m.amount, 0);
  const valorEsperadoDinheiro = totalIn - totalOut;

  // Outros métodos: usar apenas SALE_PAYMENT como antes
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

    // Debug: verificar valores
    console.log("🔍 DEBUG - Valores:", {
      valorContadoDinheiro,
      valorEsperadoDinheiro,
      diferencaDinheiro,
      observacoes: formData.observacoes,
    });

    // Validação: exigir justificativa se houver diferença no dinheiro
    const hasDiferenca = Math.abs(diferencaDinheiro) > 0.01;
    if (hasDiferenca && !formData.observacoes.trim()) {
      toast({
        title: "Justificativa obrigatória",
        description: `Há uma diferença de ${formatCurrency(Math.abs(diferencaDinheiro))} no dinheiro. Por favor, informe o motivo no campo de observações.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Buscar o shift atual
      const shiftResponse = await fetch("/api/cash/shift");
      if (!shiftResponse.ok) {
        throw new Error("Erro ao buscar caixa atual");
      }

      const shiftData = await shiftResponse.json();
      const shift = shiftData.shift;

      if (!shift || shift.status !== "OPEN") {
        throw new Error("Nenhum caixa aberto encontrado");
      }

      // Preparar dados de fechamento
      // IMPORTANTE: closingDeclaredCash deve ser apenas o valor de DINHEIRO, não o total
      const justificativa = hasDiferenca && formData.observacoes.trim()
        ? formData.observacoes.trim()
        : undefined;

      const closeData = {
        shiftId: shift.id,
        closingDeclaredCash: valorContadoDinheiro,
        differenceJustification: justificativa,
        notes: formData.observacoes.trim() || undefined,
      };

      console.log("Dados de fechamento:", closeData);
      console.log("🔍 DEBUG - hasDiferenca:", hasDiferenca, "justificativa:", justificativa);

      // Fechar caixa
      const closeResponse = await fetch("/api/cash/shift/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(closeData),
      });

      if (!closeResponse.ok) {
        const error = await closeResponse.json();
        console.error("Erro da API:", error);
        throw new Error(error.error?.message || error.message || "Erro ao fechar caixa");
      }

      const closeResult = await closeResponse.json();

      toast({
        title: "Caixa fechado com sucesso!",
        description: Math.abs(diferencaDinheiro) < 0.01
          ? "Caixa conferido sem divergências no dinheiro."
          : `Divergência no dinheiro: ${formatCurrency(Math.abs(diferencaDinheiro))} ${diferencaDinheiro > 0 ? "sobra" : "falta"}.`,
        variant: Math.abs(diferencaDinheiro) < 0.01 ? "default" : "destructive",
      });

      // Limpar formulário
      setFormData({
        valorDinheiro: "",
        valorCredito: "",
        valorDebito: "",
        valorPix: "",
        observacoes: "",
      });

      onOpenChange(false);

      // Guardar ID do caixa fechado e abrir modal de impressão
      setClosedShiftId(shift.id);
      setShowPrintModal(true);
    } catch (error) {
      console.error("Erro ao fechar caixa:", error);
      toast({
        title: "Erro ao fechar caixa",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
            <div className="rounded-lg border p-4 border-blue-200 bg-blue-50/50">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="dinheiro" className="font-semibold">💵 Dinheiro (Principal)</Label>
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
                <div className={`mt-2 text-sm font-medium ${
                  Math.abs(diferencaDinheiro) < 0.01
                    ? "text-green-600"
                    : "text-red-600"
                }`}>
                  Diferença: {diferencaDinheiro > 0 ? "+" : ""}{formatCurrency(diferencaDinheiro)}
                  {Math.abs(diferencaDinheiro) > 0.01 && " (justificativa obrigatória)"}
                </div>
              )}
              <p className="text-xs text-blue-700 mt-2">
                ℹ️ Apenas diferenças no dinheiro exigem justificativa
                <br />
                📊 Inclui: abertura + vendas + reforços - sangrias
              </p>
            </div>

            {/* Crédito */}
            <div className="rounded-lg border p-4 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="credito">💳 Crédito (Informativo)</Label>
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
                    : "text-gray-600"
                }`}>
                  Diferença: {diferencaCredito > 0 ? "+" : ""}{formatCurrency(diferencaCredito)}
                </div>
              )}
            </div>

            {/* Débito */}
            <div className="rounded-lg border p-4 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="debito">💳 Débito (Informativo)</Label>
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
                    : "text-gray-600"
                }`}>
                  Diferença: {diferencaDebito > 0 ? "+" : ""}{formatCurrency(diferencaDebito)}
                </div>
              )}
            </div>

            {/* PIX */}
            <div className="rounded-lg border p-4 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <Label htmlFor="pix">🔑 PIX (Informativo)</Label>
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
                    : "text-gray-600"
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
            <Label htmlFor="obs" className={Math.abs(diferencaDinheiro) > 0.01 ? "text-red-600" : ""}>
              Observações {Math.abs(diferencaDinheiro) > 0.01 && <span className="text-red-600">*</span>}
            </Label>
            {Math.abs(diferencaDinheiro) > 0.01 && (
              <p className="text-sm text-red-600">
                ⚠️ Justificativa obrigatória: há diferença de {formatCurrency(Math.abs(diferencaDinheiro))} no dinheiro
              </p>
            )}
            <Textarea
              id="obs"
              placeholder={
                Math.abs(diferencaDinheiro) > 0.01
                  ? "Justifique a diferença no dinheiro (obrigatório)..."
                  : "Informações sobre divergências ou observações do fechamento..."
              }
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              disabled={loading}
              rows={3}
              className={Math.abs(diferencaDinheiro) > 0.01 ? "border-red-300" : ""}
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

      {/* Modal de Impressão */}
      <Dialog open={showPrintModal} onOpenChange={(open) => {
        setShowPrintModal(open);
        if (!open) {
          // Recarregar página quando fechar modal
          setTimeout(() => window.location.reload(), 300);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Caixa Fechado!
            </DialogTitle>
            <DialogDescription>
              Deseja imprimir o relatório de fechamento?
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowPrintModal(false);
                setTimeout(() => window.location.reload(), 300);
              }}
            >
              Não
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (closedShiftId) {
                  window.open(`/dashboard/caixa/${closedShiftId}/relatorio`, '_blank');
                }
                setShowPrintModal(false);
                setTimeout(() => window.location.reload(), 300);
              }}
            >
              Imprimir Relatório
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
