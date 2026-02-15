"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CreditCard,
  Banknote,
  Smartphone,
  Wallet,
  Trash2,
  Check,
  Loader2,
  Gift,
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
  customerId?: string | null;
  onConfirm: (payments: Payment[], cashbackUsed?: number) => void;
  loading?: boolean;
}

const paymentMethods = [
  { id: "CASH", label: "Dinheiro", icon: Banknote, color: "bg-green-500" },
  { id: "PIX", label: "PIX", icon: Smartphone, color: "bg-blue-500" },
  { id: "DEBIT_CARD", label: "Débito", icon: CreditCard, color: "bg-purple-500" },
  { id: "CREDIT_CARD", label: "Crédito", icon: CreditCard, color: "bg-orange-500" },
  { id: "STORE_CREDIT", label: "Crediário", icon: Wallet, color: "bg-gray-500" },
];

export function ModalFinalizarVenda({ open, onOpenChange, total, customerId, onConfirm, loading = false }: ModalFinalizarVendaProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("1");

  // Estados para modal de crediário
  const [modalCrediarioOpen, setModalCrediarioOpen] = useState(false);
  const [pendingCrediarioAmount, setPendingCrediarioAmount] = useState(0);

  // Estados para cashback
  const [cashbackBalance, setCashbackBalance] = useState(0);
  const [loadingCashback, setLoadingCashback] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const [cashbackAmount, setCashbackAmount] = useState("");

  const cashbackUsed = useCashback ? parseFloat(cashbackAmount) || 0 : 0;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  // Arredondar para 2 casas decimais para evitar erro de precisão de ponto flutuante
  const totalAfterCashback = Math.round((total - cashbackUsed) * 100) / 100;
  const remaining = Math.round((totalAfterCashback - totalPaid) * 100) / 100;

  // Carregar saldo de cashback quando abrir modal
  useEffect(() => {
    if (open && customerId) {
      setLoadingCashback(true);
      fetch(`/api/cashback/balance/${customerId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setCashbackBalance(data.data.balance);
          }
        })
        .catch((error) => {
          console.error("Erro ao carregar cashback:", error);
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
      onConfirm(payments, cashbackUsed);
      setPayments([]);
      setAmount("");
      setInstallments("1");
      setSelectedMethod("");
      setUseCashback(false);
      setCashbackAmount("");
    } else {
      toast.error(`Ainda falta pagar ${formatCurrency(Math.abs(remaining))}`);
    }
  };

  const useMaxCashback = () => {
    // Usar o menor valor entre: saldo de cashback e total da venda
    // Não podemos usar mais cashback do que o total da venda
    const maxUsable = Math.min(cashbackBalance, total);
    setCashbackAmount(maxUsable.toFixed(2));
  };

  const quickFill = () => {
    setAmount(remaining.toFixed(2));
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

        {/* Conteúdo Compacto SEM Scroll */}
        <div className="flex-1 px-6 py-2 space-y-2 overflow-hidden">
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
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Valor"
                        value={cashbackAmount}
                        onChange={(e) => setCashbackAmount(e.target.value)}
                        className="w-20 h-6 text-[11px]"
                        max={cashbackBalance}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={useMaxCashback}
                        className="h-6 text-[11px] px-2"
                      >
                        Máx
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
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
                        className={`flex flex-col items-center gap-0.5 rounded border-2 p-1 transition-all hover:bg-accent ${
                          selectedMethod === method.id
                            ? "border-primary bg-accent"
                            : "border-border"
                        }`}
                      >
                        <div className={`rounded-full p-0.5 ${method.color} text-white`}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <span className="text-[9px] text-center leading-tight">{method.label}</span>
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
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={!selectedMethod}
                      className="h-7 text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={quickFill} disabled={!selectedMethod || remaining <= 0} className="h-7 text-[10px] px-1.5">
                      Total
                    </Button>
                  </div>
                </div>

                {selectedMethod === "CREDIT_CARD" && (
                  <div className="space-y-0.5">
                    <Label htmlFor="installments" className="text-[11px]">Parcelas</Label>
                    <Input
                      id="installments"
                      type="number"
                      min="1"
                      max="12"
                      value={installments}
                      onChange={(e) => setInstallments(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                )}
              </div>

              <Button onClick={addPayment} disabled={!selectedMethod || !amount} className="w-full h-7 text-xs">
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
                <div className="space-y-0.5 h-28 overflow-y-auto pr-1">
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
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <span className="text-[11px] font-semibold">{formatCurrency(payment.amount)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removePayment(payment.id)}
                            className="h-5 w-5 p-0"
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
        <div className="border-t bg-background p-2 flex-shrink-0 shadow-lg">
          {/* Botões com resumo inline */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-8"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 h-8"
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
