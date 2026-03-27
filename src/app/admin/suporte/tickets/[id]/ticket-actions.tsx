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
        className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 transition-colors disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-10 w-52 rounded-xl border border-gray-700 bg-gray-900 shadow-xl py-1">
          <button
            onClick={() => handleStatusChange("IN_PROGRESS")}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <User className="h-4 w-4 text-yellow-400" />
            Em Andamento
          </button>
          <button
            onClick={() => handleStatusChange("WAITING_CUSTOMER")}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Clock className="h-4 w-4 text-purple-400" />
            Aguardando Cliente
          </button>
          <button
            onClick={() => handleStatusChange("RESOLVED")}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            Marcar como Resolvido
          </button>
          <div className="my-1 border-t border-gray-800" />
          <button
            onClick={() => handleStatusChange("CLOSED")}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <XCircle className="h-4 w-4 text-red-400" />
            Fechar Ticket
          </button>
        </div>
      )}
    </div>
  );
}
