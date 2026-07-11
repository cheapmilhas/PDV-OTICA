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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const NONE = "__none__";

export interface AgendarExameUser {
  id: string;
  name: string;
}

interface AgendarExameDialogProps {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vendedores/atendentes disponíveis p/ atribuir o exame (opcional). */
  users?: AgendarExameUser[];
  /** Chamado após agendar com sucesso (para o container recarregar). */
  onScheduled?: () => void;
}

/**
 * Dialog "Agendar exame" — cria um ExamAppointment vinculado ao lead via
 * POST /api/exam-appointments. scheduledAt vem de um input datetime-local
 * (fuso do navegador do atendente = BRT); .toISOString() resolve a conversão.
 */
export function AgendarExameDialog({
  leadId,
  open,
  onOpenChange,
  users,
  onScheduled,
}: AgendarExameDialogProps) {
  const [scheduledAt, setScheduledAt] = useState("");
  const [assignedUserId, setAssignedUserId] = useState<string>(NONE);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setScheduledAt("");
    setAssignedUserId(NONE);
    setNote("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!scheduledAt) {
      toast.error("Informe a data e hora do exame");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/exam-appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          scheduledAt: new Date(scheduledAt).toISOString(),
          assignedUserId: assignedUserId !== NONE ? assignedUserId : null,
          note: note.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "Erro ao agendar exame");
      }

      toast.success("Exame agendado");
      onScheduled?.();
      handleOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao agendar exame"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar exame</DialogTitle>
          <DialogDescription>
            Marque a data e hora do exame de vista para este lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="exame-scheduled-at">Data e hora *</Label>
            <Input
              id="exame-scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              autoFocus
            />
          </div>

          {users && users.length > 0 && (
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="exame-note">Observação</Label>
            <Textarea
              id="exame-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: paciente prefere período da manhã"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
