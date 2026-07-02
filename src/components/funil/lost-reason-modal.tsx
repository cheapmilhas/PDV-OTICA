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
import { LOST_REASON_OPTIONS } from "@/lib/lost-reason-label";
import type { LostReasonCategory } from "@prisma/client";

interface LostReasonModalProps {
  open: boolean;
  leadName?: string;
  onCancel: () => void;
  /** Categoria (obrigatória, estruturada) + detalhe livre opcional (#8). */
  onConfirm: (category: LostReasonCategory, detail?: string) => void;
}

/**
 * Pede o motivo ESTRUTURADO (Sprint 3, #8) ao mover um lead p/ etapa `isLost`.
 * A categoria (botões) é obrigatória — alimenta a análise e a reoferta segmentada
 * na aba "Recuperar". O detalhe em texto é opcional (contexto extra).
 */
export function LostReasonModal({
  open,
  leadName,
  onCancel,
  onConfirm,
}: LostReasonModalProps) {
  const [category, setCategory] = useState<LostReasonCategory | null>(null);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState(false);

  function reset() {
    setCategory(null);
    setDetail("");
    setError(false);
  }

  function handleConfirm() {
    if (!category) {
      setError(true);
      return;
    }
    onConfirm(category, detail.trim() || undefined);
    reset();
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
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
            Escolha o motivo — assim dá pra saber onde estamos perdendo e trazer
            esses clientes de volta depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label>Motivo da perda *</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LOST_REASON_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={category === opt.value ? "default" : "outline"}
                className="justify-start"
                onClick={() => {
                  setCategory(opt.value);
                  if (error) setError(false);
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {error && (
            <p className="text-xs text-red-600">Escolha um motivo.</p>
          )}

          <div className="space-y-1 pt-1">
            <Label htmlFor="lost-detail" className="text-muted-foreground">
              Detalhe (opcional)
            </Label>
            <Textarea
              id="lost-detail"
              placeholder="Ex: pediu desconto de 20%, disse que ia pensar..."
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
            />
          </div>
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
