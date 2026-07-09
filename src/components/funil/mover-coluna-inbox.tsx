"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import type { LeadStage } from "@/components/funil/funil-board";

interface MoverColunaInboxProps {
  leadId: string;
  stages: LeadStage[];
  /** Chamado após mover, para o pai recarregar a lista/estado se quiser. */
  onMoved?: () => void;
}

/**
 * Move um lead p/ outra coluna direto do inbox (ação de disparo único). Oferece só
 * colunas NÃO-Perdido (Perdido exige motivo → fica no Kanban). Usa DropdownMenu (não
 * Select) de propósito: é uma AÇÃO, não um indicador de estágio — o gatilho sempre
 * mostra "Mover para…", nunca um valor "selecionado" que mentiria sobre o estágio real.
 * Pode oferecer a coluna atual do lead (o inbox não conhece o stageId atual); mover
 * p/ a mesma coluna é um no-op inofensivo — aceito p/ manter o controle simples.
 * Usa o endpoint de move existente (ator vem da sessão; exige leads.edit).
 */
export function MoverColunaInbox({ leadId, stages, onMoved }: MoverColunaInboxProps) {
  const [busy, setBusy] = useState(false);
  const options = [...stages].filter((s) => !s.isLost).sort((a, b) => a.order - b.order);

  async function handleMove(stageId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message ?? "Falha ao mover");
      toast.success("Lead movido");
      onMoved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao mover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={busy} aria-label="Mover lead para coluna">
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Mover para…
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => handleMove(s.id)}>
            {s.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
