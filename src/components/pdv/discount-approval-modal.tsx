"use client";

import { useState } from "react";
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
import { ShieldAlert, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Valor do desconto em R$ ou %, apenas para exibição */
  discountInfo: string;
  /** Chamado com a senha aprovada (ou null se cancelado). Retornar Promise<boolean> indica sucesso. */
  onApprove: (managerPassword: string) => Promise<boolean>;
}

/**
 * Modal pedindo senha do gerente para autorizar desconto acima do limite.
 *
 * O caller decide o limite (lendo SystemRule.sales.discount.approval_above) e
 * abre este modal antes de prosseguir com a venda. A validação da senha
 * acontece no endpoint /api/auth/verify-manager (TODO criar).
 */
export function DiscountApprovalModal({ open, onClose, discountInfo, onApprove }: Props) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!password.trim()) {
      toast.error("Senha obrigatória");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onApprove(password);
      if (ok) {
        setPassword("");
        onClose();
      } else {
        toast.error("Senha incorreta ou usuário sem permissão");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Aprovação Necessária
          </DialogTitle>
          <DialogDescription>
            O desconto de <strong>{discountInfo}</strong> excede o limite permitido.
            Solicite ao gerente que digite a senha dele para autorizar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="manager-pwd">Senha do gerente</Label>
          <Input
            id="manager-pwd"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Autorizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
