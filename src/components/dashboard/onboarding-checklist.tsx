"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Circle, X, Sparkles } from "lucide-react";

interface ChecklistItem {
  key: string;
  label: string;
  href: string;
  /** Função que retorna se a etapa está concluída. Default: checa endpoint próprio. */
  isDone?: boolean;
}

interface OnboardingStatus {
  hasProduct: boolean;
  hasSale: boolean;
  hasServiceOrder: boolean;
  hasMultipleUsers: boolean;
}

/**
 * Checklist de onboarding mostrado no dashboard para novas empresas.
 * Some quando todos os itens estão concluídos OU usuário fecha manualmente
 * (persistido em localStorage por companyId).
 */
export function OnboardingChecklist({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const storageKey = `onboarding-dismissed-${companyId}`;

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(storageKey) === "1") {
      setDismissed(true);
      return;
    }
    fetch("/api/dashboard/onboarding-status")
      .then((res) => res.json())
      .then((data) => setStatus(data.data ?? null))
      .catch(() => setStatus(null));
  }, [companyId, storageKey]);

  if (dismissed || !status) return null;

  const items: ChecklistItem[] = [
    {
      key: "product",
      label: "Cadastrar primeiro produto",
      href: "/dashboard/produtos",
      isDone: status.hasProduct,
    },
    {
      key: "sale",
      label: "Fazer primeira venda no PDV",
      href: "/dashboard/pdv",
      isDone: status.hasSale,
    },
    {
      key: "os",
      label: "Abrir primeira Ordem de Serviço",
      href: "/dashboard/ordens-servico/nova",
      isDone: status.hasServiceOrder,
    },
    {
      key: "user",
      label: "Convidar funcionário",
      href: "/dashboard/usuarios",
      isDone: status.hasMultipleUsers,
    },
  ];

  const doneCount = items.filter((i) => i.isDone).length;
  const allDone = doneCount === items.length;

  if (allDone) return null;

  function dismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "1");
    }
    setDismissed(true);
  }

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-900/40 dark:from-indigo-950/30 dark:to-transparent">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            Primeiros passos no PDV Ótica
          </CardTitle>
          <CardDescription>
            {doneCount}/{items.length} concluídos — você está quase lá!
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={dismiss}
          aria-label="Fechar"
          className="text-zinc-500"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3">
              {item.isDone ? (
                <Check className="h-5 w-5 flex-shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-5 w-5 flex-shrink-0 text-zinc-400" />
              )}
              {item.isDone ? (
                <span className="text-sm line-through text-zinc-500">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="text-sm font-medium text-zinc-900 hover:text-indigo-600 dark:text-zinc-100"
                >
                  {item.label} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
