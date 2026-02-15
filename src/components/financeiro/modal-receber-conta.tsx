"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import toast from "react-hot-toast";

interface Payment {
  id: string;
  method: string;
  amount: number;
}

interface ReceivingAccount {
  id: string;
  description: string;
  amount: number;
  customer?: {
    name: string;
  } | null;
}

interface ModalReceberContaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ReceivingAccount | null;
  onConfirm: (payments: Payment[]) => Promise<void>;
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

  const totalOriginal = account?.amount || 0;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = Math.round((totalOriginal - totalPaid) * 100) / 100;

  const addPayment = () => {
    if (!selectedMethod || !amount || parseFloat(amount) <= 0) return;

    const paymentAmount = parseFloat(amount);

    // Validar se não excede o total
    if (totalPaid + paymentAmount > totalOriginal + 0.01) {
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
    if (totalPaid > totalOriginal + 0.01) {
      toast.error("Valor total dos pagamentos excede o valor a receber!");
      return;
    }

    await onConfirm(payments);

    // Limpar após confirmar
    setPayments([]);
    setAmount("");
    setSelectedMethod("");
  };

  const quickFill = () => {
    setAmount(remaining.toFixed(2));
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

        {/* Conteúdo Compacto SEM Scroll */}
        <div className="flex-1 px-6 py-3 space-y-3 overflow-hidden">
          {/* Resumo Compacto - Uma Linha */}
          <div className="rounded-lg border p-2 bg-muted/50">
            <div className="flex items-center justify-around gap-2 text-sm">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total a Receber</p>
                <p className="text-lg font-bold">{formatCurrency(totalOriginal)}</p>
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

          {/* Info sobre pagamento parcial */}
          {totalPaid > 0 && remaining > 0.01 && (
            <div className="rounded-lg border border-blue-300 bg-blue-50/50 dark:bg-blue-950/20 p-2 text-xs text-blue-900 dark:text-blue-100">
              ℹ️ Pagamento parcial: você pode receber apenas parte do valor agora.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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
                        className={`flex flex-col items-center gap-1 rounded border-2 p-1.5 transition-all hover:bg-accent ${
                          selectedMethod === method.id
                            ? "border-primary bg-accent"
                            : "border-border"
                        }`}
                      >
                        <div className={`rounded-full p-1 ${method.color} text-white`}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <span className="text-[10px] text-center leading-tight">{method.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Valor */}
              <div className="space-y-1">
                <Label htmlFor="amount" className="text-xs">Valor</Label>
                <div className="flex gap-1">
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={!selectedMethod}
                    className="h-8 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={quickFill}
                    disabled={!selectedMethod || remaining <= 0}
                    className="h-8 text-xs px-2"
                  >
                    Total
                  </Button>
                </div>
              </div>

              <Button onClick={addPayment} disabled={!selectedMethod || !amount} className="w-full h-8 text-sm">
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
                            className="h-6 w-6 p-0"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
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
              className="flex-1 h-9"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 h-9"
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
