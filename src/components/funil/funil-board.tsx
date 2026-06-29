"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { formatCurrency } from "@/lib/utils";
import { LeadCard, type Lead } from "./lead-card";
import { LostReasonModal } from "./lost-reason-modal";

export interface LeadStage {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

const PAGE_SIZE = 8;

interface FunilBoardProps {
  stages: LeadStage[];
  leads: Lead[];
  /** Recarrega leads + stats no container (após move/convert/conflito). */
  onRefresh: () => void;
}

interface PendingMove {
  lead: Lead;
  stageId: string;
}

export function FunilBoard({ stages, leads, onRefresh }: FunilBoardProps) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [pendingLostMove, setPendingLostMove] = useState<PendingMove | null>(
    null
  );
  // Optimistic: stageId sobrescrito localmente por leadId enquanto o PATCH roda.
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  // Quantos cards mostrar por coluna (carregar mais).
  const [visibleCount, setVisibleCount] = useState<Record<string, number>>({});

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
  );

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const stage of sortedStages) map[stage.id] = [];
    for (const lead of leads) {
      const stageId = optimistic[lead.id] ?? lead.stageId;
      if (map[stageId]) map[stageId].push(lead);
    }
    return map;
  }, [leads, sortedStages, optimistic]);

  function handleDragStart(event: DragStartEvent) {
    const lead = event.active.data.current?.lead as Lead | undefined;
    setActiveLead(lead ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;

    const lead = active.data.current?.lead as Lead | undefined;
    const targetStageId = String(over.id);
    if (!lead) return;

    const currentStageId = optimistic[lead.id] ?? lead.stageId;
    if (currentStageId === targetStageId) return;

    const targetStage = sortedStages.find((s) => s.id === targetStageId);
    if (!targetStage) return;

    if (targetStage.isLost) {
      // Pede o motivo antes de persistir.
      setPendingLostMove({ lead, stageId: targetStageId });
      return;
    }

    await persistMove(lead, targetStageId, targetStage);
  }

  async function persistMove(
    lead: Lead,
    stageId: string,
    stage: LeadStage,
    lostReason?: string
  ) {
    // Otimista: move o card já.
    setOptimistic((prev) => ({ ...prev, [lead.id]: stageId }));

    try {
      const res = await fetch(`/api/leads/${lead.id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageId,
          expectedUpdatedAt: lead.updatedAt,
          ...(lostReason ? { lostReason } : {}),
        }),
      });

      if (res.status === 409) {
        toast.error(
          "Este lead foi atualizado por outra pessoa. Recarregando o funil..."
        );
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[lead.id];
          return next;
        });
        onRefresh();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Erro ao mover lead");
      }

      if (stage.isWon) {
        await handleWon(lead);
      }

      // Sincroniza com o servidor (updatedAt novo, lastActivityAt, etc).
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao mover lead");
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[lead.id];
        return next;
      });
      onRefresh();
    }
  }

  async function handleConfirmCustomer(leadId: string, customerId: string | null) {
    try {
      const res = await fetch(`/api/leads/${leadId}/customer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "Erro ao vincular cliente");
      }
      toast.success(customerId ? "Cliente vinculado!" : "Sugestão dispensada.");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao vincular cliente");
    }
  }

  async function handleCorrectIntent(leadId: string, intent: string) {
    try {
      const res = await fetch(`/api/leads/${leadId}/intent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "Erro ao corrigir intenção");
      }
      toast.success("Intenção corrigida.");
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao corrigir intenção");
    }
  }

  async function handleWon(lead: Lead) {
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, {
        method: "POST",
      });
      if (!res.ok) return;
      const json = await res.json();
      const data = json?.data;
      const quoteId: string | null = data?.quoteId ?? null;
      const href = quoteId
        ? `/dashboard/orcamentos/${quoteId}`
        : "/dashboard/pdv";
      toast.success(
        (t) => (
          <span className="flex items-center gap-2">
            Lead ganho! 🎉
            <button
              className="font-semibold text-primary underline"
              onClick={() => {
                toast.dismiss(t.id);
                router.push(href);
              }}
            >
              {quoteId ? "Abrir orçamento" : "Abrir PDV"}
            </button>
          </span>
        ),
        { duration: 8000 }
      );
    } catch {
      // silencioso — a movimentação já persistiu
    }
  }

  function confirmLostMove(reason: string) {
    if (!pendingLostMove) return;
    const { lead, stageId } = pendingLostMove;
    const stage = sortedStages.find((s) => s.id === stageId);
    setPendingLostMove(null);
    if (stage) void persistMove(lead, stageId, stage, reason);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {sortedStages.map((stage) => {
            const stageLeads = leadsByStage[stage.id] ?? [];
            const limit = visibleCount[stage.id] ?? PAGE_SIZE;
            const shown = stageLeads.slice(0, limit);
            const totalValue = stageLeads.reduce(
              (acc, l) => acc + (l.estimatedValue ?? 0),
              0
            );

            return (
              <StageColumn
                key={stage.id}
                stage={stage}
                count={stageLeads.length}
                totalValue={totalValue}
              >
                {shown.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} onConfirmCustomer={handleConfirmCustomer} onCorrectIntent={handleCorrectIntent} />
                ))}

                {stageLeads.length === 0 && (
                  <p className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                    Arraste leads para cá
                  </p>
                )}

                {stageLeads.length > limit && (
                  <button
                    className="w-full rounded-md py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                    onClick={() =>
                      setVisibleCount((prev) => ({
                        ...prev,
                        [stage.id]: limit + PAGE_SIZE,
                      }))
                    }
                  >
                    Carregar mais ({stageLeads.length - limit})
                  </button>
                )}
              </StageColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} /> : null}
        </DragOverlay>
      </DndContext>

      <LostReasonModal
        open={!!pendingLostMove}
        leadName={pendingLostMove?.lead.name}
        onCancel={() => setPendingLostMove(null)}
        onConfirm={confirmLostMove}
      />
    </>
  );
}

interface StageColumnProps {
  stage: LeadStage;
  count: number;
  totalValue: number;
  children: React.ReactNode;
}

function StageColumn({ stage, count, totalValue, children }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const accent = stage.isWon
    ? "border-t-green-500"
    : stage.isLost
    ? "border-t-red-500"
    : "border-t-primary";

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className={`rounded-t-lg border-t-4 bg-muted/40 px-3 py-2 ${accent}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{stage.name}</h3>
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatCurrency(totalValue)}
          </p>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[200px] flex-1 flex-col gap-2 rounded-b-lg border border-t-0 border-border p-2 transition-colors ${
          isOver ? "bg-primary/5" : "bg-muted/20"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
