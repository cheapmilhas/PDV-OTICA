"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Loader2, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface FinanceAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
}

interface PayingAccount {
  id: string;
  description: string;
  amount: number;
}

interface ModalPagarContaProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: PayingAccount | null;
  /** Recebe a conta financeira escolhida para debitar o saldo. */
  onConfirm: (financeAccountId: string) => Promise<void>;
  loading?: boolean;
}

export function ModalPagarConta({
  open,
  onOpenChange,
  account,
  onConfirm,
  loading = false,
}: ModalPagarContaProps) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  // Carregar contas financeiras ao abrir
  useEffect(() => {
    if (!open) return;
    setSelectedId("");
    setAccountsLoading(true);
    fetch("/api/accounts-payable/finance-accounts")
      .then((res) => res.json())
      .then((result) => {
        const list: FinanceAccount[] = result?.data ?? [];
        setAccounts(list);
        // Pré-selecionar se houver apenas uma conta
        if (list.length === 1) setSelectedId(list[0].id);
      })
      .catch(() => setAccounts([]))
      .finally(() => setAccountsLoading(false));
  }, [open]);

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  const handleConfirm = async () => {
    if (!selectedId) return;
    await onConfirm(selectedId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Pagar Conta</DialogTitle>
          <DialogDescription>
            {account && (
              <span className="block mt-1">
                <span className="font-medium text-foreground">
                  {account.description}
                </span>
                <span className="block text-sm">
                  Valor: {formatCurrency(account.amount)}
                </span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label className="text-sm">Conta de saída (de onde sai o dinheiro)</Label>

          {accountsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando contas...
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Nenhuma conta financeira cadastrada. Cadastre uma em{" "}
              <Link
                href="/dashboard/financeiro/contas"
                className="underline font-medium"
              >
                Financeiro → Contas
              </Link>{" "}
              antes de registrar o pagamento.
            </div>
          ) : (
            <>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — {formatCurrency(a.balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selected && account && selected.balance < account.amount && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  Atenção: o saldo desta conta ({formatCurrency(selected.balance)})
                  é menor que o valor da conta. O saldo ficará negativo.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={!selectedId || loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Pagando...
              </>
            ) : (
              <>
                <Check className="mr-1 h-4 w-4" />
                Confirmar Pagamento
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
