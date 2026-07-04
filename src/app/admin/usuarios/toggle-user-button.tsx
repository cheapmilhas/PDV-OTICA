"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserCheck, UserX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ToggleUserButton({
  userId,
  active,
  userName,
}: {
  userId: string;
  active: boolean;
  userName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleToggle() {
    setConfirmOpen(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/company-users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: !active }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Erro inesperado");
        }
        toast.success(active ? "Usuário desativado" : "Usuário reativado");
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        title={active ? "Desativar usuário" : "Reativar usuário"}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
          active
            ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
            : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
        }`}
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : active ? (
          <UserX className="h-3.5 w-3.5" />
        ) : (
          <UserCheck className="h-3.5 w-3.5" />
        )}
        {active ? "Desativar" : "Reativar"}
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !isPending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{active ? "Desativar" : "Reativar"} usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              {active ? "Desativar" : "Reativar"} o usuário <strong>{userName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggle} disabled={isPending}>
              {active ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
