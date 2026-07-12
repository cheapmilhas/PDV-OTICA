"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Trash2,
  Check,
  Loader2,
  Gift,
  Wallet,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalConfigurarCrediario } from "./modal-configurar-crediario";
import toast from "react-hot-toast";
import { ALL_PAYMENT_METHODS, DEFAULT_PAYMENT_METHOD_IDS, type PaymentMethodConfig } from "@/lib/payment-methods";

interface InstallmentConfig {
  count: number;
  firstDueDate: string;
  interval: number;
}

interface Payment {
  id: string;
  method: string;
  amount: number;
  installments?: number;
  installmentConfig?: InstallmentConfig;
  cardBrand?: string;
  cardLastDigits?: string;
  nsu?: string;
  authorizationCode?: string;
  acquirer?: string;
}

interface ModalFinalizarVendaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  customerId?: string | null;
  onConfirm: (payments: Payment[], cashbackUsed?: number) => void;
  loading?: boolean;
}

// Default payment methods (used until company settings load)
const defaultPaymentMethods = ALL_PAYMENT_METHODS.filter((m) =>
  DEFAULT_PAYMENT_METHOD_IDS.includes(m.id)
);

/**
 * Converte um valor digitado (que pode usar vírgula decimal pt-BR) em número.
 * Aceita "2400,00", "2400.00", "2.400,00" e retorna NaN se inválido.
 */
function parseAmount(raw: string): number {
  if (!raw) return NaN;
  // Remove separador de milhar "." quando há vírgula decimal; troca vírgula por ponto.
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  return parseFloat(normalized);
}

/**
 * Gera um ID único de forma resiliente. `crypto.randomUUID()` só existe em
 * contexto seguro (HTTPS/localhost) — fora dele lança. Mantemos fallback.
 */
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // segue para o fallback
    }
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ModalFinalizarVenda({ open, onOpenChange, total, customerId, onConfirm, loading = false }: ModalFinalizarVendaProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>(defaultPaymentMethods);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("1");

  // Campos de cartão
  const [cardBrand, setCardBrand] = useState("");
  const [cardLastDigits, setCardLastDigits] = useState("");
  const [nsu, setNsu] = useState("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [acquirer, setAcquirer] = useState("");

  // Estados para modal de crediário
  const [modalCrediarioOpen, setModalCrediarioOpen] = useState(false);
  const [pendingCrediarioAmount, setPendingCrediarioAmount] = useState(0);

  // Estados para cashback
  const [cashbackBalance, setCashbackBalance] = useState(0);
  const [loadingCashback, setLoadingCashback] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [cashbackAmount, setCashbackAmount] = useState("");

  // H12: reset ao FECHAR. Antes, payments só era limpo dentro de handleConfirm
  // (venda concluída). Fechar o modal sem confirmar (ESC, clicar fora, X,
  // cancelar override) deixava os pagamentos no estado e eles VAZAVAM para a
  // próxima venda. Limpa tudo sempre que o modal fecha.
  useEffect(() => {
    if (!open) {
      setPayments([]);
      setAmount("");
      setInstallments("1");
      setSelectedMethod("");
      setCardBrand("");
      setCardLastDigits("");
      setNsu("");
      setAuthorizationCode("");
      setAcquirer("");
      setPendingCrediarioAmount(0);
      setUseCashback(false);
      setCashbackAmount("");
    }
  }, [open]);

  const cashbackUsed = useCashback ? parseAmount(cashbackAmount) || 0 : 0;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  // Arredondar para 2 casas decimais para evitar erro de precisão de ponto flutuante
  const totalAfterCashback = Math.round((total - cashbackUsed) * 100) / 100;
  const remaining = Math.round((totalAfterCashback - totalPaid) * 100) / 100;

  // Carregar formas de pagamento habilitadas pela empresa
  useEffect(() => {
    if (open) {
      fetch("/api/company/payment-methods")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data && data.data.length > 0) {
            const enabledIds = data.data as string[];
            const filtered = ALL_PAYMENT_METHODS.filter((m) => enabledIds.includes(m.id));
            if (filtered.length > 0) {
              setPaymentMethods(filtered);
              // Reconcilia seleção: se a forma selecionada não existe mais na
              // lista carregada, limpa para não ficar um estado "fantasma"
              // (botão sem destaque + pagamento que não adiciona).
              setSelectedMethod((current) =>
                current && !filtered.some((m) => m.id === current) ? "" : current
              );
            }
          }
        })
        .catch((error) => {
          console.error("Erro ao carregar formas de pagamento:", error);
        });
    }
  }, [open]);

  // Carregar saldo de cashback quando abrir modal
  useEffect(() => {
    if (open && customerId) {
      setLoadingCashback(true);
      fetch(`/api/cashback/balance/${customerId}`)
        .then(async (res) => {
          // 403 = plano da empresa não inclui cashback. Não é erro: apenas
          // não exibimos a seção de cashback. Evita poluir o console.
          if (res.status === 403) {
            setCashbackBalance(0);
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (data?.success) {
            setCashbackBalance(Number(data.data?.balance) || 0);
          }
        })
        .catch(() => {
          // Cashback é opcional — falha de rede não bloqueia a venda.
          setCashbackBalance(0);
        })
        .finally(() => {
          setLoadingCashback(false);
        });
    } else {
      setCashbackBalance(0);
      setUseCashback(false);
      setCashbackAmount("");
    }
  }, [open, customerId]);

  const addPayment = () => {
    try {
      if (!selectedMethod) {
        toast.error("Selecione uma forma de pagamento");
        return;
      }

      const parsedAmount = parseAmount(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        toast.error("Informe um valor válido (ex.: 2400,00)");
        return;
      }

      // Se for crediário, abrir modal de configuração
      if (selectedMethod === "STORE_CREDIT") {
        setPendingCrediarioAmount(parsedAmount);
        setModalCrediarioOpen(true);
        return; // Não adiciona ainda
      }

      // A prazo (saldo/boleto/cheque): exige cliente vinculado
      if (
        selectedMethod === "BALANCE_DUE" ||
        selectedMethod === "BOLETO" ||
        selectedMethod === "CHEQUE"
      ) {
        if (!customerId) {
          const label =
            selectedMethod === "BALANCE_DUE" ? "Saldo a Receber"
            : selectedMethod === "BOLETO" ? "Boleto" : "Cheque";
          toast.error(`${label} exige um cliente vinculado`);
          return;
        }
      }

      const isCard = selectedMethod === "CREDIT_CARD" || selectedMethod === "DEBIT_CARD";
      const newPayment: Payment = {
        id: generateId(),
        method: selectedMethod,
        amount: parsedAmount,
        ...(selectedMethod === "CREDIT_CARD" && { installments: parseInt(installments) }),
        ...(isCard && cardBrand && { cardBrand }),
        ...(isCard && cardLastDigits && { cardLastDigits }),
        ...(isCard && nsu && { nsu }),
        ...(isCard && authorizationCode && { authorizationCode }),
        ...(isCard && acquirer && { acquirer }),
      };

      setPayments([...payments, newPayment]);
      setAmount("");
      setInstallments("1");
      setCardBrand("");
      setCardLastDigits("");
      setNsu("");
      setAuthorizationCode("");
      setAcquirer("");
    } catch (error) {
      console.error("Erro ao adicionar pagamento:", error);
      toast.error("Não foi possível adicionar o pagamento. Tente novamente.");
    }
  };

  // Callback para quando confirmar crediário
  const handleConfirmarCrediario = (config: InstallmentConfig) => {
    const newPayment: Payment = {
      id: generateId(),
      method: "STORE_CREDIT",
      amount: pendingCrediarioAmount,
      installmentConfig: config,
    };

    setPayments([...payments, newPayment]);
    setAmount("");
    setPendingCrediarioAmount(0);

    toast.success(
      `Crediário configurado: ${config.count}x de R$ ${(pendingCrediarioAmount / config.count).toFixed(2)}`
    );
  };

  const removePayment = (id: string) => {
    setPayments(payments.filter((p) => p.id !== id));
  };

  const handleConfirm = () => {
    // Validar cashback
    if (cashbackUsed > cashbackBalance) {
      toast.error("Valor de cashback maior que o saldo disponível!");
      return;
    }

    if (cashbackUsed > total) {
      toast.error("Valor de cashback maior que o total da venda!");
      return;
    }

    // Usar tolerância de 0.01 para evitar problemas de precisão de ponto flutuante
    if (Math.abs(remaining) < 0.01) {
      // NÃO limpar os pagamentos aqui. A venda ainda não está confirmada: o
      // backend pode devolver uma negativa autorizável (limite de crédito,
      // inadimplência, etc.) e abrir o modal de override. Se zerássemos o estado
      // agora, ao clicar em "Liberar mesmo assim" o operador veria este modal
      // vazio ("0 pagamentos") e teria a impressão de precisar preencher tudo de
      // novo. O reset acontece no useEffect de fechamento do modal (ver acima),
      // que é disparado tanto no sucesso (redirect/carnê fecham o modal) quanto
      // no cancelamento.
      onConfirm(payments, cashbackUsed);
    } else {
      toast.error(`Ainda falta pagar ${formatCurrency(Math.abs(remaining))}`);
    }
  };

  const useMaxCashback = () => {
    // Usar o menor valor entre: saldo de cashback e total da venda
    // Não podemos usar mais cashback do que o total da venda
    const maxUsable = Math.min(cashbackBalance, total);
    // pt-BR (vírgula decimal); parseAmount normaliza na hora de usar.
    setCashbackAmount(maxUsable.toFixed(2).replace(".", ","));
  };

  const quickFill = () => {
    // Preenche no padrão pt-BR (vírgula decimal); parseAmount normaliza na hora de adicionar.
    setAmount(remaining.toFixed(2).replace(".", ","));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-3 pb-2 flex-shrink-0">
          <DialogTitle className="text-base">Finalizar Venda</DialogTitle>
          <DialogDescription className="text-xs">
            Adicione as formas de pagamento para concluir a venda
          </DialogDescription>
        </DialogHeader>

        {/* Conteúdo — rola no mobile (inputs maiores podem exceder a altura);
            compacto sem scroll no desktop. */}
        <div className="flex-1 px-6 py-2 space-y-2 overflow-y-auto md:overflow-hidden">
          {/* Resumo Compacto - Uma Linha */}
          <div className="rounded border p-1.5 bg-muted/50">
            <div className="flex items-center justify-around gap-2 text-sm">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Total</p>
                <p className="text-base font-bold">{formatCurrency(total)}</p>
                {cashbackUsed > 0 && (
                  <p className="text-[9px] text-orange-600">-{formatCurrency(cashbackUsed)}</p>
                )}
              </div>
              <div className="text-center border-x px-3">
                <p className="text-[10px] text-muted-foreground">Pago</p>
                <p className="text-base font-bold text-green-600">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Falta</p>
                <p className={`text-base font-bold ${remaining > 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {formatCurrency(remaining)}
                </p>
              </div>
            </div>
          </div>

          {/* Cashback Ultra Compacto */}
          {customerId && cashbackBalance > 0 && (
            <div className="rounded border border-orange-300 bg-orange-50/50 dark:bg-orange-950/20 p-1.5">
              <div className="flex items-center gap-2">
                <Gift className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
                <div className="flex-1 flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-semibold text-orange-900 dark:text-orange-100 text-[11px]">
                    Cashback: {formatCurrency(cashbackBalance)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Checkbox
                      id="use-cashback"
                      checked={useCashback}
                      onCheckedChange={(checked) => {
                        setUseCashback(checked as boolean);
                        if (!checked) setCashbackAmount("");
                      }}
                      className="h-3 w-3"
                    />
                    <Label htmlFor="use-cashback" className="cursor-pointer text-[11px]">Usar</Label>
                  </div>
                  {useCashback && (
                    <>
                      <DecimalInput
                        placeholder="Valor"
                        value={cashbackAmount}
                        onValueChange={setCashbackAmount}
                        className="w-24 md:w-20 h-11 md:h-6 text-base md:text-[11px]"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={useMaxCashback}
                        className="h-11 md:h-6 text-sm md:text-[11px] px-3 md:px-2"
                      >
                        Máx
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Coluna Esquerda - Adicionar Pagamento */}
            <div className="space-y-1.5">
              {/* Formas de Pagamento */}
              <div className="space-y-0.5">
                <Label className="text-[11px]">Forma de Pagamento</Label>
                <div className="grid grid-cols-3 gap-1">
                  {paymentMethods.map((method) => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.id}
                        onClick={() => setSelectedMethod(method.id)}
                        className={`flex flex-col items-center justify-center md:justify-normal gap-1 rounded border-2 p-2 min-h-16 md:min-h-0 md:p-1 md:gap-0.5 transition-all hover:bg-accent ${
                          selectedMethod === method.id
                            ? "border-primary bg-accent"
                            : "border-border"
                        }`}
                      >
                        <div className={`rounded-full p-1 md:p-0.5 ${method.color} text-white`}>
                          <Icon className="h-5 w-5 md:h-3 md:w-3" />
                        </div>
                        <span className="text-xs md:text-[9px] text-center leading-tight">{method.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Valor e Parcelas em linha */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="space-y-0.5">
                  <Label htmlFor="amount" className="text-[11px]">Valor</Label>
                  <div className="flex gap-1">
                    <Input
                      id="amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addPayment();
                        }
                      }}
                      disabled={!selectedMethod}
                      className="h-11 md:h-7 text-base md:text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={quickFill} disabled={!selectedMethod || remaining <= 0} className="h-11 md:h-7 text-xs md:text-[10px] px-3 md:px-1.5">
                      Total
                    </Button>
                  </div>
                </div>

                {selectedMethod === "CREDIT_CARD" && (
                  <div className="space-y-0.5">
                    <Label htmlFor="installments" className="text-[11px]">Parcelas</Label>
                    <Select value={installments} onValueChange={setInstallments}>
                      <SelectTrigger className="h-11 md:h-7 text-base md:text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => {
                          const val = parseFloat(amount) || 0;
                          return (
                            <SelectItem key={n} value={String(n)}>
                              {n === 1
                                ? `1x (à vista)`
                                : val > 0
                                  ? `${n}x R$ ${(val / n).toFixed(2).replace(".", ",")}`
                                  : `${n}x`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Dados do cartão — 2 linhas compactas */}
              {(selectedMethod === "CREDIT_CARD" || selectedMethod === "DEBIT_CARD") && (
                <div className="border rounded p-1.5 bg-muted/30 space-y-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    <Select value={cardBrand} onValueChange={setCardBrand}>
                      <SelectTrigger className="h-11 md:h-6 text-base md:text-[10px]">
                        <SelectValue placeholder="Bandeira" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Visa">Visa</SelectItem>
                        <SelectItem value="Mastercard">Master</SelectItem>
                        <SelectItem value="Elo">Elo</SelectItem>
                        <SelectItem value="Amex">Amex</SelectItem>
                        <SelectItem value="Hipercard">Hiper</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={acquirer} onValueChange={setAcquirer}>
                      <SelectTrigger className="h-11 md:h-6 text-base md:text-[10px]">
                        <SelectValue placeholder="Operadora" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cielo">Cielo</SelectItem>
                        <SelectItem value="Stone">Stone</SelectItem>
                        <SelectItem value="Rede">Rede</SelectItem>
                        <SelectItem value="PagSeguro">PagSeg</SelectItem>
                        <SelectItem value="Getnet">Getnet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
                    <Input placeholder="NSU" value={nsu} onChange={(e) => setNsu(e.target.value)} className="h-11 md:h-6 text-base md:text-[10px]" />
                    <Input placeholder="Cod. Autoriz." value={authorizationCode} onChange={(e) => setAuthorizationCode(e.target.value)} className="h-11 md:h-6 text-base md:text-[10px]" />
                    <Input placeholder="4 digitos" inputMode="numeric" maxLength={4} value={cardLastDigits} onChange={(e) => setCardLastDigits(e.target.value.replace(/\D/g, ""))} className="h-11 md:h-6 text-base md:text-[10px]" />
                  </div>
                </div>
              )}

              <Button type="button" onClick={addPayment} disabled={!selectedMethod} className="w-full h-11 md:h-7 text-sm md:text-xs">
                Adicionar Pagamento
              </Button>
            </div>

            {/* Coluna Direita - Lista de Pagamentos */}
            <div className="space-y-0.5">
              <Label className="text-[11px]">Pagamentos ({payments.length})</Label>
              {payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-28 text-center text-muted-foreground border border-dashed rounded">
                  <Wallet className="h-6 w-6 opacity-20 mb-0.5" />
                  <p className="text-[10px]">Nenhum pagamento</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {payments.map((payment) => {
                    const method = paymentMethods.find((m) => m.id === payment.method);
                    const Icon = method?.icon;
                    return (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between rounded border p-1 bg-muted/30"
                      >
                        <div className="flex items-center gap-1.5">
                          {Icon && (
                            <div className={`rounded-full p-0.5 ${method.color} text-white`}>
                              <Icon className="h-3 w-3" />
                            </div>
                          )}
                          <div>
                            <p className="text-[11px] font-medium">{method?.label}</p>
                            {payment.installments && payment.installments > 1 && (
                              <p className="text-[9px] text-muted-foreground">
                                {payment.installments}x de {formatCurrency(payment.amount / payment.installments)}
                              </p>
                            )}
                            {payment.installmentConfig && (
                              <p className="text-[9px] text-muted-foreground">
                                {payment.installmentConfig.count}x de{" "}
                                {formatCurrency(payment.amount / payment.installmentConfig.count)}
                              </p>
                            )}
                            {payment.cardBrand && (
                              <p className="text-[9px] text-muted-foreground">
                                {payment.cardBrand}
                                {payment.cardLastDigits && ` ****${payment.cardLastDigits}`}
                                {payment.nsu && ` NSU:${payment.nsu}`}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[11px] font-semibold">{formatCurrency(payment.amount)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removePayment(payment.id)}
                            aria-label="Remover pagamento"
                            className="h-9 w-9 md:h-5 md:w-5 p-0"
                          >
                            <Trash2 className="h-4 w-4 md:h-3 md:w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé FIXO Compacto */}
        <div className="border-t bg-background p-2 flex-shrink-0 shadow-lg">
          {/* Botões com resumo inline */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-11 md:h-8"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 h-11 md:h-8"
              onClick={handleConfirm}
              disabled={Math.abs(remaining) >= 0.01 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Finalizando...
                </>
              ) : Math.abs(remaining) >= 0.01 ? (
                <>
                  Falta {formatCurrency(Math.abs(remaining))}
                </>
              ) : (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  Confirmar ({formatCurrency(total)})
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Modal de Configuração de Crediário */}
      <ModalConfigurarCrediario
        open={modalCrediarioOpen}
        onOpenChange={setModalCrediarioOpen}
        amount={pendingCrediarioAmount}
        onConfirm={handleConfirmarCrediario}
      />
    </Dialog>
  );
}
