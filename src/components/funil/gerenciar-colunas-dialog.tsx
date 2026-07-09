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
import { ArrowUp, ArrowDown, Trash2, Plus, Loader2, Lock } from "lucide-react";
import toast from "react-hot-toast";
import type { LeadStage } from "@/components/funil/funil-board";

interface GerenciarColunasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: LeadStage[];
  /** Chamado após qualquer mudança persistir, para o pai recarregar as colunas. */
  onChanged: () => void;
}

/** Uma coluna é protegida contra exclusão se é terminal ou tem flag de sistema. */
function isProtected(stage: LeadStage): boolean {
  return stage.isWon || stage.isLost || !!stage.systemKey;
}

export function GerenciarColunasDialog({
  open,
  onOpenChange,
  stages,
  onChanged,
}: GerenciarColunasDialogProps) {
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const sorted = [...stages].sort((a, b) => a.order - b.order);

  async function run(fn: () => Promise<Response>, okMsg: string) {
    setBusy(true);
    try {
      const res = await fn();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "Falha na operação");
      }
      toast.success(okMsg);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
      // Puxa a verdade do servidor mesmo em falha: p/ renomear, isto re-sincroniza
      // o Input não-controlado (defaultValue) com o valor real, descartando o texto
      // rejeitado (ex.: nome duplicado).
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    // Nova coluna entra ANTES dos terminais: order = menor order terminal, ou fim.
    const terminalOrders = sorted.filter((s) => s.isWon || s.isLost).map((s) => s.order);
    const order = terminalOrders.length > 0 ? Math.min(...terminalOrders) : sorted.length;
    setNewName("");
    run(
      () =>
        fetch("/api/lead-stages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, order }),
        }),
      "Coluna criada",
    );
  }

  function handleRename(stage: LeadStage, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === stage.name) return;
    run(
      () =>
        fetch(`/api/lead-stages/${stage.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        }),
      "Coluna renomeada",
    );
  }

  // Troca a `order` de dois estágios adjacentes (dois PATCH em sequência).
  async function handleSwap(a: LeadStage, b: LeadStage) {
    setBusy(true);
    try {
      const r1 = await fetch(`/api/lead-stages/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: b.order }),
      });
      const r2 = await fetch(`/api/lead-stages/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: a.order }),
      });
      if (!r1.ok || !r2.ok) throw new Error("Falha ao reordenar");
      toast.success("Ordem atualizada");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reordenar. Recarregando a ordem atual…");
      onChanged(); // puxa a verdade do servidor mesmo em falha parcial (r1 ok, r2 falhou)
    } finally {
      setBusy(false);
    }
  }

  function handleDelete(stage: LeadStage) {
    run(
      () => fetch(`/api/lead-stages/${stage.id}`, { method: "DELETE" }),
      "Coluna removida",
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar colunas do funil</DialogTitle>
          <DialogDescription>
            Renomeie, reordene ou crie colunas. As colunas Fechado/Perdido e a de
            exame não podem ser excluídas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          {sorted.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma coluna ainda. Crie a primeira abaixo.
            </p>
          )}
          {sorted.map((stage, i) => (
            <div
              key={stage.id}
              className="flex items-center gap-2 rounded-md border border-transparent px-1 py-0.5 hover:border-border"
            >
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={busy || i === 0}
                  onClick={() => handleSwap(stage, sorted[i - 1])}
                  aria-label="Subir"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={busy || i === sorted.length - 1}
                  onClick={() => handleSwap(stage, sorted[i + 1])}
                  aria-label="Descer"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                key={`${stage.id}:${stage.name}`}
                defaultValue={stage.name}
                disabled={busy}
                onBlur={(e) => handleRename(stage, e.target.value)}
                className="flex-1"
                aria-label={`Nome da coluna ${stage.name}`}
              />
              {isProtected(stage) ? (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground"
                  title="Coluna protegida — não pode ser excluída"
                >
                  <Lock className="h-4 w-4" />
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  disabled={busy}
                  onClick={() => handleDelete(stage)}
                  aria-label={`Excluir ${stage.name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 gap-2">
            <Input
              placeholder="Nome da nova coluna"
              value={newName}
              disabled={busy}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <Button type="button" onClick={handleCreate} disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
