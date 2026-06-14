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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface LostReasonModalProps {
  open: boolean;
  leadName?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Pede o motivo (obrigatório) ao mover um lead para uma etapa `isLost`. */
export function LostReasonModal({
  open,
  leadName,
  onCancel,
  onConfirm,
}: LostReasonModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);

  function handleConfirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    onConfirm(trimmed);
    setReason("");
    setError(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason("");
      setError(false);
      onCancel();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como perdido</DialogTitle>
          <DialogDescription>
            {leadName ? `Lead: ${leadName}. ` : ""}
            Informe o motivo da perda para entendermos onde estamos perdendo
            clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="lost-reason">Motivo da perda *</Label>
          <Textarea
            id="lost-reason"
            placeholder="Ex: achou caro, comprou no concorrente, sumiu, só pesquisando..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(false);
            }}
            rows={3}
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-600">O motivo é obrigatório.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Confirmar perda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
