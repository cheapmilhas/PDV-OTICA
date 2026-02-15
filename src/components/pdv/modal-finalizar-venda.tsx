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
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 flex-shrink-0">
          <DialogTitle>Finalizar Venda</DialogTitle>
          <DialogDescription>
            Adicione as formas de pagamento para concluir a venda
          </DialogDescription>
        </DialogHeader>

        {/* Área Scrollável */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Resumo - Full Width */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Total da Venda</p>
                <p className="text-2xl font-bold">{formatCurrency(total)}</p>
              </div>
              {cashbackUsed > 0 && (
                <div className="text-center border-x">
                  <p className="text-sm text-muted-foreground mb-1">Cashback Usado</p>
                  <p className="text-2xl font-bold text-orange-600">-{formatCurrency(cashbackUsed)}</p>
                </div>
              )}
              <div className={`text-center ${cashbackUsed > 0 ? 'border-r' : 'border-x'}`}>
                <p className="text-sm text-muted-foreground mb-1">
                  {cashbackUsed > 0 ? 'Total a Pagar' : 'Total Pago'}
                </p>
                <p className="text-2xl font-bold text-blue-600">
                  {cashbackUsed > 0 ? formatCurrency(totalAfterCashback) : formatCurrency(totalPaid)}
                </p>
              </div>
              {cashbackUsed === 0 && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">Restante</p>
                  <p className={`text-2xl font-bold ${remaining > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {formatCurrency(remaining)}
                  </p>
                </div>
              )}
              {cashbackUsed > 0 && (
                <>
                  <div className="text-center border-r">
                    <p className="text-sm text-muted-foreground mb-1">Já Pago</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Falta Pagar</p>
                    <p className={`text-2xl font-bold ${remaining > 0 ? 'text-destructive' : 'text-green-600'}`}>
                      {formatCurrency(Math.max(0, remaining))}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Seção de Cashback COMPACTA (se cliente selecionado) */}
          {customerId && cashbackBalance > 0 && (
            <div className="rounded-lg border-2 border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full p-2 bg-orange-500 text-white flex-shrink-0">
                  <Gift className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-orange-900 dark:text-orange-100 text-sm">
                      Cashback: {formatCurrency(cashbackBalance)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="use-cashback"
                        checked={useCashback}
                        onCheckedChange={(checked) => {
                          setUseCashback(checked as boolean);
                          if (!checked) {
                            setCashbackAmount("");
                          }
                        }}
                      />
                      <Label htmlFor="use-cashback" className="cursor-pointer text-sm font-medium">
                        Usar
                      </Label>
                    </div>
                  </div>

                  {useCashback && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Valor a usar"
                        value={cashbackAmount}
                        onChange={(e) => setCashbackAmount(e.target.value)}
                        className="flex-1 h-8"
                        max={cashbackBalance}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={useMaxCashback}
                        className="whitespace-nowrap h-8"
                      >
                        Máximo
                      </Button>
                    </div>
                  )}

                  {useCashback && cashbackUsed > 0 && (
                    <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                      Desconto de {formatCurrency(cashbackUsed)} será aplicado
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {customerId && cashbackBalance === 0 && !loadingCashback && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-900/20 p-2 text-xs text-gray-600 dark:text-gray-400">
              ℹ️ Cliente sem cashback disponível no momento.
            </div>
          )}

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

          {/* Mensagem de ajuda */}
          {payments.length === 0 && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">
              💡 <strong>Como finalizar:</strong> Selecione uma forma de pagamento, digite o valor e clique em &quot;Adicionar Pagamento&quot;
            </div>
          )}
        </div>

        {/* Rodapé FIXO com Botões de Ação */}
        <div className="border-t bg-background p-6 flex gap-3 flex-shrink-0 shadow-lg">
          <div className="flex-1 flex gap-3">
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
              ) : Math.abs(remaining) >= 0.01 ? (
                <>
                  Falta {formatCurrency(Math.abs(remaining))}
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
