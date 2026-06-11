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
import { ShieldAlert, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Texto do motivo da negativa (exibido ao operador). */
  reason: string;
  /**
   * Id do usuário logado, registrado como autorizador da liberação.
   * O caller obtém via useSession() e passa para cá.
   */
  currentUserId?: string;
  /**
   * Chamado com o approvedByUserId (o próprio usuário logado) quando o operador
   * confirma a liberação. O caller reenvia a operação (venda/conversão) com o
   * override.
   */
  onApproved: (approvedByUserId: string) => void;
}

/**
 * Modal de liberação de operação bloqueada por regra de negócio (limite de
 * crédito, inadimplência, estoque, desconto, preço abaixo do custo).
 *
 * NÃO pede senha de gerente: mostra um alerta com o motivo e o operador logado
 * confirma a liberação. O usuário logado fica registrado como autorizador, e o
 * admin consegue ver no histórico quem liberou e o quê (ActivityLog de override).
 */
export function ManagerApprovalModal({ open, onClose, reason, currentUserId, onApproved }: Props) {
  const [submitting, setSubmitting] = useState(false);

  function handleConfirm() {
    if (!currentUserId) return;
    setSubmitting(true);
    onApproved(currentUserId);
    onClose();
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            Atenção
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">{reason}</span>
            <span className="block">
              Deseja <strong>liberar esta venda mesmo assim</strong>? A liberação ficará
              registrada no seu nome.
            </span>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || !currentUserId}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Liberar mesmo assim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
