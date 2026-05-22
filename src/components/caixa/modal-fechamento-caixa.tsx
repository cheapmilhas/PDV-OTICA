"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  CreditCard,
  QrCode,
  ArrowLeft,
  ArrowRight,
  Printer,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface ModalFechamentoCaixaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caixaInfo: {
    operador: string;
    dataAbertura: string;
    valorAbertura: number;
    valorAtual: number;
    aberto: boolean;
  };
  resumoPagamentos: Array<{ forma: string; valor: number; quantidade?: number }>;
  movements?: Array<{
    method: string;
    direction: "IN" | "OUT";
    amount: number;
  }>;
}

type Step = 1 | 2 | 3;

const FORMAS = [
  { key: "dinheiro", label: "Dinheiro", icon: Banknote, principal: true, color: "emerald" as const },
  { key: "pix", label: "PIX", icon: QrCode, principal: false, color: "sky" as const },
  { key: "debito", label: "Débito", icon: CreditCard, principal: false, color: "indigo" as const },
  { key: "credito", label: "Crédito", icon: CreditCard, principal: false, color: "amber" as const },
];

export function ModalFechamentoCaixa({
  open,
  onOpenChange,
  caixaInfo,
  resumoPagamentos,
  movements = [],
}: ModalFechamentoCaixaProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [imprimir, setImprimir] = useState(true);
  const [closedShiftId, setClosedShiftId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    valorDinheiro: "",
    valorCredito: "",
    valorDebito: "",
    valorPix: "",
    observacoes: "",
  });

  // === Cálculos ===
  // Esperado em dinheiro: soma todos os CashMovements CASH (IN - OUT), como o backend.
  const cashMovements = useMemo(() => movements.filter((m) => m.method === "CASH"), [movements]);
  const totalIn = cashMovements
    .filter((m) => m.direction === "IN")
    .reduce((s, m) => s + m.amount, 0);
  const totalOut = cashMovements
    .filter((m) => m.direction === "OUT")
    .reduce((s, m) => s + m.amount, 0);
  const valorEsperadoDinheiro = totalIn - totalOut;
  const valorEsperadoCredito = resumoPagamentos.find((p) => p.forma === "Credito" || p.forma === "Crédito")?.valor || 0;
  const valorEsperadoDebito = resumoPagamentos.find((p) => p.forma === "Debito" || p.forma === "Débito")?.valor || 0;
  const valorEsperadoPix = resumoPagamentos.find((p) => p.forma === "PIX")?.valor || 0;

  const esperadoPorForma: Record<string, number> = {
    dinheiro: valorEsperadoDinheiro,
    pix: valorEsperadoPix,
    debito: valorEsperadoDebito,
    credito: valorEsperadoCredito,
  };

  const contadoPorForma: Record<string, number> = {
    dinheiro: Number(formData.valorDinheiro) || 0,
    pix: Number(formData.valorPix) || 0,
    debito: Number(formData.valorDebito) || 0,
    credito: Number(formData.valorCredito) || 0,
  };

  const diferencaPorForma: Record<string, number> = {
    dinheiro: contadoPorForma.dinheiro - esperadoPorForma.dinheiro,
    pix: contadoPorForma.pix - esperadoPorForma.pix,
    debito: contadoPorForma.debito - esperadoPorForma.debito,
    credito: contadoPorForma.credito - esperadoPorForma.credito,
  };

  const totalEsperado =
    valorEsperadoDinheiro + valorEsperadoCredito + valorEsperadoDebito + valorEsperadoPix;
  const totalContado =
    contadoPorForma.dinheiro + contadoPorForma.pix + contadoPorForma.debito + contadoPorForma.credito;
  const diferencaTotal = totalContado - totalEsperado;
  const diferencaDinheiro = diferencaPorForma.dinheiro;
  const semDiferencas = Math.abs(diferencaTotal) < 0.01 && Math.abs(diferencaDinheiro) < 0.01;
  const exigeJustificativa = Math.abs(diferencaDinheiro) > 0.01;

  // === Pre-fill ao abrir e reset ao fechar ===
  useEffect(() => {
    if (!open) {
      // Reset quando o modal fecha (após delay para não piscar)
      const t = setTimeout(() => {
        setStep(1);
        setFormData({
          valorDinheiro: "",
          valorCredito: "",
          valorDebito: "",
          valorPix: "",
          observacoes: "",
        });
        setClosedShiftId(null);
        setImprimir(true);
      }, 300);
      return () => clearTimeout(t);
    }
    setFormData((prev) => ({
      ...prev,
      valorDinheiro: prev.valorDinheiro || (valorEsperadoDinheiro > 0 ? valorEsperadoDinheiro.toFixed(2) : ""),
      valorPix: prev.valorPix || (valorEsperadoPix > 0 ? valorEsperadoPix.toFixed(2) : ""),
      valorDebito: prev.valorDebito || (valorEsperadoDebito > 0 ? valorEsperadoDebito.toFixed(2) : ""),
      valorCredito: prev.valorCredito || (valorEsperadoCredito > 0 ? valorEsperadoCredito.toFixed(2) : ""),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // === Navegação do stepper ===
  const goNext = () => {
    if (step === 1) {
      // Se há diferença no dinheiro, vai pro 2 (justificativa); senão pula direto pro 3.
      setStep(exigeJustificativa ? 2 : 3);
      return;
    }
    if (step === 2) {
      if (exigeJustificativa && !formData.observacoes.trim()) {
        toast({
          title: "Justificativa obrigatória",
          description: `Há uma diferença de ${formatCurrency(Math.abs(diferencaDinheiro))} no dinheiro. Informe o motivo.`,
          variant: "destructive",
        });
        return;
      }
      setStep(3);
    }
  };
  const goBack = () => {
    if (step === 3) {
      setStep(exigeJustificativa ? 2 : 1);
      return;
    }
    if (step === 2) setStep(1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const shiftResponse = await fetch("/api/cash/shift");
      if (!shiftResponse.ok) throw new Error("Erro ao buscar caixa atual");
      const shiftData = await shiftResponse.json();
      const shift = shiftData.shift;
      if (!shift || shift.status !== "OPEN") {
        throw new Error("Nenhum caixa aberto encontrado");
      }

      const closeData = {
        shiftId: shift.id,
        closingDeclaredCash: contadoPorForma.dinheiro,
        differenceJustification:
          exigeJustificativa && formData.observacoes.trim() ? formData.observacoes.trim() : undefined,
        notes: formData.observacoes.trim() || undefined,
      };

      const closeResponse = await fetch("/api/cash/shift/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(closeData),
      });
      if (!closeResponse.ok) {
        const error = await closeResponse.json();
        throw new Error(error.error?.message || error.message || "Erro ao fechar caixa");
      }

      toast({
        title: "Caixa fechado com sucesso!",
        description: semDiferencas
          ? "Conferência sem divergências."
          : `Diferença no dinheiro: ${formatCurrency(Math.abs(diferencaDinheiro))} ${diferencaDinheiro > 0 ? "(sobra)" : "(falta)"}.`,
        variant: semDiferencas ? "default" : "destructive",
      });

      setClosedShiftId(shift.id);
      if (imprimir) {
        window.open(`/dashboard/caixa/${shift.id}/relatorio`, "_blank");
      }
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast({
        title: "Erro ao fechar caixa",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Indicador visual: passo 2 é "fantasma" se não há diferença
  const passoIntermediarioAtivo = exigeJustificativa;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
              <Lock className="h-4 w-4 text-slate-700" />
            </div>
            Fechamento de caixa
          </DialogTitle>
          <DialogDescription>
            Confira os valores recebidos, ajuste se houver divergência e finalize o turno.
          </DialogDescription>

          {/* Stepper indicator */}
          <div className="mt-4 flex items-center gap-2">
            <StepDot index={1} label="Conferir" active={step === 1} done={step > 1} />
            <StepConnector done={step > 1} />
            <StepDot
              index={2}
              label="Justificar"
              active={step === 2}
              done={step > 2}
              dim={!passoIntermediarioAtivo && step !== 2}
            />
            <StepConnector done={step > 2} />
            <StepDot index={3} label="Confirmar" active={step === 3} done={false} />
          </div>
        </DialogHeader>

        <div className="px-6 py-5">
          {/* Resumo permanente no topo */}
          <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border bg-slate-50 px-4 py-3 text-xs">
            <Info label="Operador" value={caixaInfo.operador} />
            <Info label="Abertura" value={caixaInfo.dataAbertura} mono />
            <Info label="Valor inicial" value={formatCurrency(caixaInfo.valorAbertura)} mono />
            <Info label="Fechamento" value={new Date().toLocaleString("pt-BR")} mono />
          </div>

          {/* PASSO 1 - Conferência */}
          {step === 1 && (
            <div className="space-y-3">
              {FORMAS.map((f) => {
                const esperado = esperadoPorForma[f.key];
                const contado = contadoPorForma[f.key];
                const diff = diferencaPorForma[f.key];
                const value =
                  f.key === "dinheiro"
                    ? formData.valorDinheiro
                    : f.key === "pix"
                      ? formData.valorPix
                      : f.key === "debito"
                        ? formData.valorDebito
                        : formData.valorCredito;
                const setValue = (v: string) =>
                  setFormData((prev) => ({
                    ...prev,
                    ...(f.key === "dinheiro" && { valorDinheiro: v }),
                    ...(f.key === "pix" && { valorPix: v }),
                    ...(f.key === "debito" && { valorDebito: v }),
                    ...(f.key === "credito" && { valorCredito: v }),
                  }));
                const Icon = f.icon;
                const diffAbs = Math.abs(diff);
                const diffColor =
                  diffAbs < 0.01
                    ? "text-emerald-600"
                    : f.key === "dinheiro" && diffAbs > 0.01
                      ? "text-red-600"
                      : "text-slate-500";
                return (
                  <div
                    key={f.key}
                    className={`rounded-lg border p-4 ${
                      f.principal ? "border-emerald-200 bg-emerald-50/40" : "bg-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor={f.key} className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4 text-slate-600" />
                        {f.label}
                        {f.principal && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                            Principal
                          </span>
                        )}
                        {!f.principal && (
                          <span className="text-[10px] text-muted-foreground">Informativo</span>
                        )}
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        Esperado:{" "}
                        <span className="tabular-nums font-medium text-slate-700">
                          {formatCurrency(esperado)}
                        </span>
                      </span>
                    </div>
                    <Input
                      id={f.key}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className="tabular-nums"
                      disabled={loading}
                    />
                    {value !== "" && (
                      <div className={`mt-2 flex items-center justify-between text-xs ${diffColor}`}>
                        <span>
                          {diffAbs < 0.01 ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Sem diferença
                            </span>
                          ) : (
                            <>
                              Diferença:{" "}
                              <span className="tabular-nums font-semibold">
                                {diff > 0 ? "+" : "−"}
                                {formatCurrency(diffAbs)}
                              </span>
                              {f.key === "dinheiro" && " — exige justificativa"}
                            </>
                          )}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          Contado: {formatCurrency(contado)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Total parcial */}
              <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Total geral</div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    Esperado{" "}
                    <span className="tabular-nums font-medium text-slate-700">
                      {formatCurrency(totalEsperado)}
                    </span>
                  </p>
                  <p className="tabular-nums text-lg font-bold text-slate-900">
                    {formatCurrency(totalContado)}
                  </p>
                  {Math.abs(diferencaTotal) >= 0.01 && (
                    <p className={`text-xs tabular-nums font-medium ${diferencaTotal > 0 ? "text-sky-600" : "text-red-600"}`}>
                      {diferencaTotal > 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(diferencaTotal))} de diferença
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2 - Justificativa */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-900">
                      Diferença no dinheiro:{" "}
                      <span className="tabular-nums">
                        {diferencaDinheiro > 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(diferencaDinheiro))}
                      </span>{" "}
                      {diferencaDinheiro > 0 ? "(sobra)" : "(falta)"}
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      Esperado <span className="tabular-nums font-medium">{formatCurrency(valorEsperadoDinheiro)}</span> ·
                      Contado <span className="tabular-nums font-medium">{formatCurrency(contadoPorForma.dinheiro)}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="obs">
                  Justificativa <span className="text-red-600">*</span>
                </Label>
                <Textarea
                  id="obs"
                  placeholder="Ex.: erro de troco na venda #2384, retirada não registrada como sangria…"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  disabled={loading}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  A justificativa fica salva no histórico de fechamentos e pode ser consultada na auditoria.
                </p>
              </div>
            </div>
          )}

          {/* PASSO 3 - Confirmação */}
          {step === 3 && (
            <div className="space-y-4">
              <div
                className={`rounded-lg border p-4 ${
                  semDiferencas ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  {semDiferencas ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-700" />
                  )}
                  <p className="text-sm font-semibold">
                    {semDiferencas ? "Pronto para fechar" : "Fechar com diferença justificada"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <SummaryRow label="Esperado" value={formatCurrency(totalEsperado)} />
                  <SummaryRow label="Contado" value={formatCurrency(totalContado)} highlight />
                  <SummaryRow
                    label="Diferença"
                    value={`${diferencaTotal > 0 ? "+" : diferencaTotal < 0 ? "−" : ""}${formatCurrency(Math.abs(diferencaTotal))}`}
                    color={semDiferencas ? "emerald" : diferencaTotal > 0 ? "sky" : "red"}
                  />
                  <SummaryRow
                    label="Dinheiro (principal)"
                    value={`${diferencaDinheiro > 0 ? "+" : diferencaDinheiro < 0 ? "−" : ""}${formatCurrency(Math.abs(diferencaDinheiro))}`}
                    color={Math.abs(diferencaDinheiro) < 0.01 ? "emerald" : "red"}
                  />
                </div>
              </div>

              {exigeJustificativa && formData.observacoes.trim() && (
                <div className="rounded-lg border bg-slate-50 p-3 text-sm">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Justificativa
                  </p>
                  <p className="text-slate-700">{formData.observacoes.trim()}</p>
                </div>
              )}

              <label className="flex items-center gap-2 rounded-lg border bg-white p-3 text-sm cursor-pointer hover:bg-slate-50">
                <Checkbox
                  checked={imprimir}
                  onCheckedChange={(v) => setImprimir(v === true)}
                />
                <Printer className="h-4 w-4 text-slate-600" />
                <span>Abrir relatório de fechamento para impressão</span>
              </label>
            </div>
          )}
        </div>

        {/* Footer com botões */}
        <div className="flex items-center justify-between border-t bg-slate-50 px-6 py-4">
          {step === 1 ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
          ) : (
            <Button variant="ghost" onClick={goBack} disabled={loading}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          )}

          {step < 3 ? (
            <Button
              onClick={goNext}
              disabled={loading || (totalEsperado > 0 && totalContado === 0)}
            >
              Próximo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fechando…
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Fechar caixa
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepDot({
  index,
  label,
  active,
  done,
  dim,
}: {
  index: number;
  label: string;
  active: boolean;
  done: boolean;
  dim?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
          done
            ? "bg-emerald-600 text-white"
            : active
              ? "bg-slate-900 text-white"
              : dim
                ? "bg-slate-100 text-slate-400"
                : "bg-slate-200 text-slate-600"
        }`}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
      </div>
      <span
        className={`text-xs ${
          active ? "font-medium text-slate-900" : dim ? "text-slate-400" : "text-slate-500"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function StepConnector({ done }: { done: boolean }) {
  return (
    <div
      className={`h-px flex-1 ${done ? "bg-emerald-500" : "bg-slate-200"} transition-colors`}
    />
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-slate-700 ${mono ? "tabular-nums" : ""}`}>{value}</span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: string;
  color?: "emerald" | "red" | "sky";
  highlight?: boolean;
}) {
  const colorClass =
    color === "emerald"
      ? "text-emerald-700"
      : color === "red"
        ? "text-red-600"
        : color === "sky"
          ? "text-sky-600"
          : "text-slate-900";
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${highlight ? "text-base font-bold" : "font-medium"} ${colorClass}`}>
        {value}
      </span>
    </div>
  );
}
