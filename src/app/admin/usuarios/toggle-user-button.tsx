"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCheck, UserX } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    if (!confirm(`${active ? "Desativar" : "Reativar"} o usuário "${userName}"?`)) return;

    setError(null);
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
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleToggle}
        disabled={isPending}
        title={active ? "Desativar usuário" : "Reativar usuário"}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
          active
            ? "bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-900"
            : "bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-900"
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
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
