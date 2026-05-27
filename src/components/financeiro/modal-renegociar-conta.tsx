"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";

interface RenegotiableAccount {
  id: string;
  description: string;
  amount: number;
  dueDate?: string;
  daysLate?: number;
  customer?: { name: string } | null;
}

interface Props {
  account: RenegotiableAccount | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Q7.3 P2-9: modal pra renegociar uma conta a receber em atraso (ou pendente).
 *
 * - Conta original vira RENEGOTIATED + renegotiatedAt
 * - Cria N novas ARs (PENDING) com renegotiatedFromId + originalAmount preservados
 * - Backend: POST /api/accounts-receivable/[id]/renegotiate
 */
export function ModalRenegociarConta({ account, open, onClose, onSuccess }: Props) {
  const [newAmount, setNewAmount] = useState<string>("");
  const [installments, setInstallments] = useState<number>(1);
  const [newDueDate, setNewDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (account && open) {
      setNewAmount(account.amount.toFixed(2));
      setInstallments(1);
      // default: 30 dias a partir de hoje
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setNewDueDate(d.toISOString().slice(0, 10));
      setNotes("");
    }
  }, [account, open]);

  if (!account) return null;

  const parsedAmount = Number(newAmount.replace(",", "."));
  const installmentValue = parsedAmount > 0 && installments > 0
    ? parsedAmount / installments
    : 0;

  async function handleSubmit() {
    if (!account) return;
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Valor inválido");
      return;
    }
    if (!newDueDate) {
      toast.error("Data de vencimento obrigatória");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/accounts-receivable/${account.id}/renegotiate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newAmount: parsedAmount,
            installments,
            newDueDate,
            notes: notes.trim() || undefined,
          }),
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || err.error || "Falha na renegociação");
      }

      toast.success(
        installments > 1
          ? `Conta renegociada em ${installments} parcelas`
          : "Conta renegociada",
      );
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-orange-600" />
            Renegociar Conta a Receber
          </DialogTitle>
          <DialogDescription>
            A conta original será marcada como <strong>renegociada</strong> e novas
            parcelas serão criadas com os termos abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-700">{account.description}</p>
            {account.customer && (
              <p className="text-xs text-slate-600">Cliente: {account.customer.name}</p>
            )}
            <p className="mt-1 text-xs text-slate-600">
              Valor original: <strong>{formatCurrency(account.amount)}</strong>
              {(account.daysLate ?? 0) > 0 && (
                <span className="ml-2 rounded bg-red-100 px-1.5 text-red-700">
                  {account.daysLate} dias em atraso
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="renegotiate-amount">Novo valor total (R$)</Label>
              <Input
                id="renegotiate-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="renegotiate-installments">Parcelas</Label>
              <Input
                id="renegotiate-installments"
                type="number"
                min="1"
                max="60"
                value={installments}
                onChange={(e) => setInstallments(Math.max(1, Number(e.target.value)))}
                disabled={submitting}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="renegotiate-duedate">1º vencimento</Label>
            <Input
              id="renegotiate-duedate"
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              disabled={submitting}
            />
            {installments > 1 && (
              <p className="mt-1 text-xs text-slate-500">
                Demais parcelas: mensais a partir desta data
              </p>
            )}
          </div>

          {installments > 1 && installmentValue > 0 && (
            <div className="rounded bg-slate-100 p-2 text-center text-sm">
              {installments}x de <strong>{formatCurrency(installmentValue)}</strong>
            </div>
          )}

          <div>
            <Label htmlFor="renegotiate-notes">Observações (opcional)</Label>
            <Textarea
              id="renegotiate-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: cliente quitou parte em dinheiro, restante em 3x"
              rows={2}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Renegociação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
