"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, CheckCircle2, XCircle, User } from "lucide-react";
import { toast } from "sonner";

export function TicketActions({ ticket }: { ticket: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (status: string) => {
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
    } catch (error) {
      toast.error("Erro ao atualizar status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleStatusChange("IN_PROGRESS")}>
          <User className="h-4 w-4 mr-2" />
          Marcar como Em Andamento
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("RESOLVED")}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Marcar como Resolvido
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("CLOSED")}>
          <XCircle className="h-4 w-4 mr-2" />
          Fechar Ticket
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
