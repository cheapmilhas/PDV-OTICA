"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import {
  CreditCard,
  Banknote,
  Smartphone,
  Trash2,
  Check,
  Loader2,
  Wallet,
  FileText,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { parseMoneyPtBR } from "@/lib/decimal-parse";
import toast from "react-hot-toast";

interface Payment {
  id: string;
  method: string;
  amount: number;
}

interface PenaltyData {
  fine: number;
  interest: number;
  daysLate: number;
  totalWithPenalties: number;
  finePercent: number;
  interestPercent: number;
  graceDays: number;
}

interface ReceivingAccount {
  id: string;
  description: string;
  amount: number;
  dueDate?: string;
  finePercent?: number;
  interestPercent?: number;
  graceDays?: number;
  calculatedFine?: number;
  calculatedInterest?: number;
  calculatedTotal?: number;
  daysLate?: number;
  customer?: {
    name: string;
  } | null;
}

interface ModalReceberContaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ReceivingAccount | null;
  onConfirm: (payments: Payment[], penaltyInfo: { discountAmount: number; fineAmount: number; interestAmount: number }) => Promise<void>;
  loading?: boolean;
}

const paymentMethods = [
  { id: "CASH", label: "Dinheiro", icon: Banknote, color: "bg-green-500" },
  { id: "PIX", label: "PIX", icon: Smartphone, color: "bg-blue-500" },
  { id: "DEBIT_CARD", label: "Débito", icon: CreditCard, color: "bg-purple-500" },
  { id: "CREDIT_CARD", label: "Crédito", icon: CreditCard, color: "bg-orange-500" },
  { id: "BANK_TRANSFER", label: "Transferência", icon: Wallet, color: "bg-teal-500" },
  { id: "BANK_SLIP", label: "Boleto", icon: FileText, color: "bg-gray-500" },
];

export function ModalReceberConta({ open, onOpenChange, account, onConfirm, loading = false }: ModalReceberContaProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [penaltyData, setPenaltyData] = useState<PenaltyData | null>(null);
  const [penaltyLoading, setPenaltyLoading] = useState(false);

  // Buscar penalidades ao abrir o modal
  useEffect(() => {
    if (account?.id && open) {
      setPenaltyLoading(true);
      setDiscount("");
      setPayments([]);
      fetch(`/api/accounts-receivable/${account.id}/penalties`)
        .then(res => res.json())
        .then(data => {
          setPenaltyData(data);
          setPenaltyLoading(false);
        })
        .catch(() => setPenaltyLoading(false));
    } else {
      setPenaltyData(null);
    }
  }, [account?.id, open]);

  // Usar dados do account como fallback se penalty endpoint não retornou
  const fine = penaltyData?.fine ?? account?.calculatedFine ?? 0;
  const interest = penaltyData?.interest ?? account?.calculatedInterest ?? 0;
  const daysLate = penaltyData?.daysLate ?? account?.daysLate ?? 0;
  const discountValue = parseMoneyPtBR(discount) ?? 0;

  const totalOriginal = account?.amount || 0;
  const totalWithPenalties = Math.round((totalOriginal + fine + interest - discountValue) * 100) / 100;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = Math.round((totalWithPenalties - totalPaid) * 100) / 100;

  const addPayment = () => {
    if (!selectedMethod || !amount || (parseMoneyPtBR(amount) ?? 0) <= 0) return;

    const paymentAmount = parseMoneyPtBR(amount) ?? 0;

    // Validar se não excede o total com penalidades
    if (totalPaid + paymentAmount > totalWithPenalties + 0.01) {
      toast.error("Valor do pagamento excede o total a receber!");
      return;
    }

    const newPayment: Payment = {
      id: Date.now().toString(),
      method: selectedMethod,
      amount: paymentAmount,
    };

    setPayments([...payments, newPayment]);
    setAmount("");
  };

  const removePayment = (id: string) => {
    setPayments(payments.filter((p) => p.id !== id));
  };

  const handleConfirm = async () => {
    if (payments.length === 0) {
      toast.error("Adicione pelo menos uma forma de pagamento!");
      return;
    }

    // Permitir pagamento parcial
    if (totalPaid > totalWithPenalties + 0.01) {
      toast.error("Valor total dos pagamentos excede o valor a receber!");
      return;
    }

    await onConfirm(payments, {
      discountAmount: discountValue,
      fineAmount: fine,
      interestAmount: interest,
    });

    // Limpar após confirmar
    setPayments([]);
    setAmount("");
    setDiscount("");
    setSelectedMethod("");
    setPenaltyData(null);
  };

  const quickFill = () => {
    // DecimalInput é pt-BR (vírgula decimal); parseMoneyPtBR trata ponto como
    // milhar. toFixed(2) emite ponto → converter para vírgula antes de setar.
    setAmount(remaining.toFixed(2).replace(".", ","));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1000px] max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-3 flex-shrink-0">
          <DialogTitle className="text-lg">Receber Conta</DialogTitle>
          <DialogDescription className="text-sm">
            {account && (
              <div className="mt-1">
                <p className="font-medium text-foreground">{account.description}</p>
                {account.customer && (
                  <p className="text-xs text-muted-foreground">Cliente: {account.customer.name}</p>
                )}
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Conteúdo — rola no mobile (inputs maiores podem exceder a altura);
            compacto sem scroll no desktop. */}
        <div className="flex-1 px-6 py-3 space-y-3 overflow-y-auto md:overflow-hidden">
          {/* Resumo com penalidades */}
          <div className="rounded-lg border p-2 bg-muted/50 space-y-1">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-muted-foreground">Valor Original</span>
              <span className="font-medium">{formatCurrency(totalOriginal)}</span>
            </div>
            {daysLate > 0 && fine > 0 && (
              <div className="flex items-center justify-between text-xs px-1 text-red-600">
                <span>Multa ({penaltyData?.finePercent ?? account?.finePercent ?? 0}%)</span>
                <span className="font-medium">+ {formatCurrency(fine)}</span>
              </div>
            )}
            {daysLate > 0 && interest > 0 && (
              <div className="flex items-center justify-between text-xs px-1 text-red-600">
                <span>Juros ({penaltyData?.interestPercent ?? account?.interestPercent ?? 0}%/mês - {daysLate} dias)</span>
                <span className="font-medium">+ {formatCurrency(interest)}</span>
              </div>
            )}
            {discountValue > 0 && (
              <div className="flex items-center justify-between text-xs px-1 text-green-600">
                <span>Desconto</span>
                <span className="font-medium">- {formatCurrency(discountValue)}</span>
              </div>
            )}
            <div className="border-t pt-1 mt-1">
              <div className="flex items-center justify-around gap-2 text-sm">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total a Receber</p>
                  <p className="text-lg font-bold">{formatCurrency(totalWithPenalties)}</p>
                </div>
                <div className="text-center border-x px-3">
                  <p className="text-xs text-muted-foreground">Recebido</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Falta</p>
                  <p className={`text-lg font-bold ${remaining > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {formatCurrency(remaining)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Info sobre pagamento parcial */}
          {totalPaid > 0 && remaining > 0.01 && (
            <div className="rounded-lg border border-blue-300 bg-blue-50/50 dark:bg-blue-950/20 p-2 text-xs text-blue-900 dark:text-blue-100">
              Pagamento parcial: você pode receber apenas parte do valor agora.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Coluna Esquerda - Adicionar Pagamento */}
            <div className="space-y-2">
              {/* Formas de Pagamento */}
              <div className="space-y-1">
                <Label className="text-xs">Forma de Recebimento</Label>
                <div className="grid grid-cols-3 gap-1">
                  {paymentMethods.map((method) => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.id}
                        onClick={() => setSelectedMethod(method.id)}
                        className={`flex flex-col items-center justify-center md:justify-normal gap-1 rounded border-2 p-2 min-h-16 md:min-h-0 md:p-1.5 transition-all hover:bg-accent ${
                          selectedMethod === method.id
                            ? "border-primary bg-accent"
                            : "border-border"
                        }`}
                      >
                        <div className={`rounded-full p-1 ${method.color} text-white`}>
                          <Icon className="h-5 w-5 md:h-3 md:w-3" />
                        </div>
                        <span className="text-xs md:text-[10px] text-center leading-tight">{method.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Desconto */}
              {(daysLate > 0 || discountValue > 0) && (
                <div className="space-y-1">
                  <Label htmlFor="discount" className="text-xs">Desconto (R$)</Label>
                  <DecimalInput
                    id="discount"
                    money
                    placeholder="0,00"
                    value={discount}
                    onValueChange={setDiscount}
                    className="h-11 md:h-8 text-base md:text-sm"
                  />
                </div>
              )}

              {/* Valor */}
              <div className="space-y-1">
                <Label htmlFor="amount" className="text-xs">Valor</Label>
                <div className="flex gap-1">
                  <DecimalInput
                    id="amount"
                    money
                    placeholder="0,00"
                    value={amount}
                    onValueChange={setAmount}
                    disabled={!selectedMethod}
                    className="h-11 md:h-8 text-base md:text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={quickFill}
                    disabled={!selectedMethod || remaining <= 0}
                    className="h-11 md:h-8 text-sm md:text-xs px-3 md:px-2"
                  >
                    Total
                  </Button>
                </div>
              </div>

              <Button onClick={addPayment} disabled={!selectedMethod || !amount} className="w-full h-11 md:h-8 text-sm">
                Adicionar Pagamento
              </Button>
            </div>

            {/* Coluna Direita - Lista de Pagamentos */}
            <div className="space-y-1">
              <Label className="text-xs">Pagamentos ({payments.length})</Label>
              {payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground border border-dashed rounded">
                  <Wallet className="h-8 w-8 opacity-20 mb-1" />
                  <p className="text-xs">Nenhum pagamento</p>
                </div>
              ) : (
                <div className="space-y-1 h-32 overflow-y-auto pr-1">
                  {payments.map((payment) => {
                    const method = paymentMethods.find((m) => m.id === payment.method);
                    const Icon = method?.icon;
                    return (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between rounded border p-1.5 bg-muted/30"
                      >
                        <div className="flex items-center gap-2">
                          {Icon && (
                            <div className={`rounded-full p-1 ${method.color} text-white`}>
                              <Icon className="h-3 w-3" />
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium">{method?.label}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold">{formatCurrency(payment.amount)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removePayment(payment.id)}
                            aria-label="Remover pagamento"
                            className="h-9 w-9 md:h-6 md:w-6 p-0"
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
        <div className="border-t bg-background p-3 flex-shrink-0 shadow-lg">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-11 md:h-9"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 h-11 md:h-9"
              onClick={handleConfirm}
              disabled={payments.length === 0 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  Confirmar Recebimento {totalPaid > 0 && `(${formatCurrency(totalPaid)})`}
                </>
              )}
            </Button>
          </div>
          {totalPaid > 0 && remaining > 0.01 && (
            <p className="text-xs text-center text-muted-foreground mt-2">
              Restante ({formatCurrency(remaining)}) ficará pendente
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
