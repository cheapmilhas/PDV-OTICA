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
  /** Texto do motivo da negativa (exibido ao gerente). */
  reason: string;
  /**
   * Chamado com o approvedByUserId após a senha ser validada com sucesso.
   * O caller reenvia a operação (venda/conversão) com o override.
   */
  onApproved: (approvedByUserId: string) => void;
}

/**
 * Modal genérico de autorização de gerente/admin para liberar uma operação
 * bloqueada por regra de negócio (limite de crédito, inadimplência, estoque).
 *
 * Valida a senha em /api/auth/verify-manager. Em sucesso, devolve o
 * approvedByUserId para o caller reenviar a operação com o override.
 */
export function ManagerApprovalModal({ open, onClose, reason, onApproved }: Props) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!password.trim()) {
      toast.error("Senha obrigatória");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success && data.data?.approvedByUserId) {
        setPassword("");
        onApproved(data.data.approvedByUserId);
        onClose();
      } else if (res.status === 429) {
        toast.error("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
      } else {
        toast.error(data?.error?.message || "Senha incorreta ou usuário sem permissão");
      }
    } catch {
      toast.error("Falha ao validar autorização. Tente novamente.");
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
            Autorização do gerente
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">{reason}</span>
            <span className="block">
              Para liberar esta venda, um <strong>administrador ou gerente</strong> deve
              digitar a senha dele abaixo.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="manager-pwd">Senha do administrador/gerente</Label>
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
            Autorizar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
