"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ModalConfigurarCrediario } from "./modal-configurar-crediario";
import toast from "react-hot-toast";

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

  // Estados para modal de crediário
  const [modalCrediarioOpen, setModalCrediarioOpen] = useState(false);
  const [pendingCrediarioAmount, setPendingCrediarioAmount] = useState(0);

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  // Arredondar para 2 casas decimais para evitar erro de precisão de ponto flutuante
  const remaining = Math.round((total - totalPaid) * 100) / 100;

  const addPayment = () => {
    if (!selectedMethod || !amount || parseFloat(amount) <= 0) return;

    // Se for crediário, abrir modal de configuração
    if (selectedMethod === "STORE_CREDIT") {
      setPendingCrediarioAmount(parseFloat(amount));
      setModalCrediarioOpen(true);
      return; // Não adiciona ainda
    }

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

  // Callback para quando confirmar crediário
  const handleConfirmarCrediario = (config: InstallmentConfig) => {
    const newPayment: Payment = {
      id: Date.now().toString(),
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
    // Usar tolerância de 0.01 para evitar problemas de precisão de ponto flutuante
    if (Math.abs(remaining) < 0.01) {
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
      <DialogContent className="sm:max-w-[1000px]">
        <DialogHeader>
          <DialogTitle>Finalizar Venda</DialogTitle>
          <DialogDescription>
            Adicione as formas de pagamento para concluir a venda
          </DialogDescription>
        </DialogHeader>

        {/* Resumo - Full Width */}
        <div className="rounded-lg border p-4 bg-muted/50">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Total da Venda</p>
              <p className="text-2xl font-bold">{formatCurrency(total)}</p>
            </div>
            <div className="text-center border-x">
              <p className="text-sm text-muted-foreground mb-1">Total Pago</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Restante</p>
              <p className={`text-2xl font-bold ${remaining > 0 ? 'text-destructive' : 'text-green-600'}`}>
                {formatCurrency(remaining)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Coluna Esquerda - Adicionar Pagamento */}
          <div className="space-y-4">
            {/* Formas de Pagamento */}
            <div className="space-y-2">
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
                      <span className="text-xs text-center leading-tight">{method.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Valor */}
            <div className="space-y-2">
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
              <div className="space-y-2">
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

            <Button onClick={addPayment} disabled={!selectedMethod || !amount} className="w-full" size="lg">
              Adicionar Pagamento
            </Button>
          </div>

          {/* Coluna Direita - Lista de Pagamentos */}
          <div className="space-y-2">
            <Label>Pagamentos Adicionados ({payments.length})</Label>
            {payments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[280px] text-center text-muted-foreground border-2 border-dashed rounded-lg">
                <Wallet className="h-12 w-12 opacity-20 mb-2" />
                <p className="text-sm">Nenhum pagamento adicionado</p>
                <p className="text-xs mt-1">Selecione uma forma de pagamento e adicione o valor</p>
              </div>
            ) : (
              <div className="space-y-2 h-[280px] overflow-y-auto pr-2">
                {payments.map((payment) => {
                  const method = paymentMethods.find((m) => m.id === payment.method);
                  const Icon = method?.icon;
                  return (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between rounded-lg border p-3 bg-muted/30"
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
                          {payment.installmentConfig && (
                            <p className="text-xs text-muted-foreground">
                              {payment.installmentConfig.count}x de{" "}
                              {formatCurrency(payment.amount / payment.installmentConfig.count)}
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
            )}
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline"
            className="flex-1"
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1"
            size="lg"
            onClick={handleConfirm}
            disabled={Math.abs(remaining) >= 0.01 || loading}
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
