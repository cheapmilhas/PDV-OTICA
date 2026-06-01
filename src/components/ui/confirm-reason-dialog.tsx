"use client";

import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";

interface ConfirmReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Rótulo do campo de motivo. */
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Se true, motivo é obrigatório (mínimo de caracteres). */
  reasonRequired?: boolean;
  minLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Variante do botão de confirmação (destructive p/ cancelamentos). */
  confirmVariant?: "default" | "destructive";
  loading?: boolean;
  onConfirm: (reason: string) => void;
}

/**
 * Substitui o window.prompt() nativo (caixinha cinza sem estilo) por um modal
 * Shadcn estilizado, usado em cancelamentos que pedem motivo (venda, OS, etc.).
 */
export function ConfirmReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonLabel = "Motivo",
  reasonPlaceholder = "Descreva o motivo...",
  reasonRequired = false,
  minLength = 5,
  confirmLabel = "Confirmar",
  cancelLabel = "Voltar",
  confirmVariant = "destructive",
  loading = false,
  onConfirm,
}: ConfirmReasonDialogProps) {
  const [reason, setReason] = useState("");

  // Limpa o campo sempre que o modal fecha.
  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const invalid = reasonRequired && trimmed.length < minLength;

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="confirm-reason">
            {reasonLabel}
            {reasonRequired && <span className="text-destructive"> *</span>}
          </Label>
          <Textarea
            id="confirm-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            rows={3}
            autoFocus
            disabled={loading}
          />
          {reasonRequired && (
            <p className="text-xs text-muted-foreground">
              Mínimo de {minLength} caracteres.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => onConfirm(trimmed)}
            disabled={loading || invalid}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
