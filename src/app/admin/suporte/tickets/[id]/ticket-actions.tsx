"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, CheckCircle2, XCircle, Clock, User } from "lucide-react";
import { toast } from "sonner";

export function TicketActions({ ticket }: { ticket: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleStatusChange = async (status: string) => {
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error("Erro ao atualizar status");
        return;
      }
      toast.success("Status atualizado!");
      router.refresh();
    } catch {
      toast.error("Erro ao atualizar status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="p-2 rounded-lg bg-muted hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-10 w-52 rounded-xl border border-border bg-card shadow-xl py-1">
          <button
            onClick={() => handleStatusChange("IN_PROGRESS")}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <User className="h-4 w-4 text-amber-600" />
            Em Andamento
          </button>
          <button
            onClick={() => handleStatusChange("WAITING_CUSTOMER")}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Clock className="h-4 w-4 text-purple-600" />
            Aguardando Cliente
          </button>
          <button
            onClick={() => handleStatusChange("RESOLVED")}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Marcar como Resolvido
          </button>
          <div className="my-1 border-t border-border" />
          <button
            onClick={() => handleStatusChange("CLOSED")}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <XCircle className="h-4 w-4 text-red-600" />
            Fechar Ticket
          </button>
        </div>
      )}
    </div>
  );
}
