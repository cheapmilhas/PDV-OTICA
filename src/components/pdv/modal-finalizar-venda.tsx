"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  Trash2,
  Check,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Payment {
  id: string;
  method: string;
  amount: number;
  installments?: number;
}

interface ModalFinalizarVendaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  onConfirm: (payments: Payment[]) => void;
  loading?: boolean;
}

const paymentMethods = [
  { id: "CASH", label: "Dinheiro", icon: Banknote, color: "bg-green-500" },
  { id: "PIX", label: "PIX", icon: Smartphone, color: "bg-blue-500" },
  { id: "DEBIT_CARD", label: "Débito", icon: CreditCard, color: "bg-purple-500" },
  { id: "CREDIT_CARD", label: "Crédito", icon: CreditCard, color: "bg-orange-500" },
  { id: "STORE_CREDIT", label: "Crediário", icon: Wallet, color: "bg-gray-500" },
];

export function ModalFinalizarVenda({ open, onOpenChange, total, onConfirm, loading = false }: ModalFinalizarVendaProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("1");

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = total - totalPaid;

  const addPayment = () => {
    if (!selectedMethod || !amount || parseFloat(amount) <= 0) return;

    const newPayment: Payment = {
      id: Date.now().toString(),
      method: selectedMethod,
      amount: parseFloat(amount),
      ...(selectedMethod === "CREDIT_CARD" && { installments: parseInt(installments) }),
    };

    setPayments([...payments, newPayment]);
    setAmount("");
    setInstallments("1");
  };

  const removePayment = (id: string) => {
    setPayments(payments.filter((p) => p.id !== id));
  };

  const handleConfirm = () => {
    if (remaining === 0) {
      onConfirm(payments);
      setPayments([]);
      setAmount("");
      setInstallments("1");
      setSelectedMethod("");
    }
  };

  const quickFill = () => {
    setAmount(remaining.toFixed(2));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Finalizar Venda</DialogTitle>
          <DialogDescription>
            Adicione as formas de pagamento para concluir a venda
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Resumo */}
          <div className="rounded-lg border p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total da venda:</span>
              <span className="font-semibold">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total pago:</span>
              <span className="font-semibold text-green-600">{formatCurrency(totalPaid)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between">
              <span className="font-medium">Restante:</span>
              <span className={`text-lg font-bold ${remaining > 0 ? 'text-destructive' : 'text-green-600'}`}>
                {formatCurrency(remaining)}
              </span>
            </div>
          </div>

          {/* Formas de Pagamento */}
          <div className="space-y-3">
            <Label>Forma de Pagamento</Label>
            <div className="grid grid-cols-5 gap-2">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all hover:bg-accent ${
                      selectedMethod === method.id
                        ? "border-primary bg-accent"
                        : "border-border"
                    }`}
                  >
                    <div className={`rounded-full p-2 ${method.color} text-white`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs text-center">{method.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Valor */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">Valor</Label>
              <div className="flex gap-2">
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!selectedMethod}
                />
                <Button variant="outline" onClick={quickFill} disabled={!selectedMethod || remaining <= 0}>
                  Total
                </Button>
              </div>
            </div>

            {selectedMethod === "CREDIT_CARD" && (
              <div className="grid gap-2">
                <Label htmlFor="installments">Parcelas</Label>
                <Input
                  id="installments"
                  type="number"
                  min="1"
                  max="12"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                />
              </div>
            )}

            <Button onClick={addPayment} disabled={!selectedMethod || !amount}>
              Adicionar Pagamento
            </Button>
          </div>

          {/* Lista de Pagamentos */}
          {payments.length > 0 && (
            <div className="space-y-2">
              <Label>Pagamentos Adicionados</Label>
              <div className="space-y-2">
                {payments.map((payment) => {
                  const method = paymentMethods.find((m) => m.id === payment.method);
                  const Icon = method?.icon;
                  return (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {Icon && (
                          <div className={`rounded-full p-2 ${method.color} text-white`}>
                            <Icon className="h-4 w-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{method?.label}</p>
                          {payment.installments && payment.installments > 1 && (
                            <p className="text-xs text-muted-foreground">
                              {payment.installments}x de {formatCurrency(payment.amount / payment.installments)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{formatCurrency(payment.amount)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePayment(payment.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={remaining !== 0 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finalizando...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirmar Venda
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
