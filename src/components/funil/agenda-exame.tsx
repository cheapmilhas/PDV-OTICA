"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { formatDateTimeBR } from "@/lib/date-utils";

interface AgendaExameProps {
  /** Só busca quando a aba está ativa (evita fetch desnecessário). */
  active: boolean;
  /** Filial selecionada (null = todas). */
  branchId: string | null;
}

type ExamAppointmentStatus = "SCHEDULED" | "ATTENDED" | "NO_SHOW";

interface ExamAppointmentItem {
  id: string;
  scheduledAt: string;
  status: ExamAppointmentStatus;
  note: string | null;
  lead: { id: string; name: string; phone: string | null };
  assignedUser: { id: string; name: string } | null;
}

/** Só a hora (HH:mm) no fuso local, extraída de formatDateTimeBR ("dd/mm/aaaa HH:mm"). */
function formatHour(scheduledAt: string): string {
  const full = formatDateTimeBR(scheduledAt);
  const parts = full.split(" ");
  return parts[1] ?? full;
}

function formatDayLabel(day: Date): string {
  return day.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

const STATUS_LABEL: Record<ExamAppointmentStatus, string> = {
  SCHEDULED: "Agendado",
  ATTENDED: "Compareceu",
  NO_SHOW: "Faltou",
};

/**
 * Aba "Agenda" do funil (Task 8): lista os exames agendados do dia com
 * navegação simples (dia anterior/seguinte) e ação rápida de comparecimento.
 */
export function AgendaExame({ active, branchId }: AgendaExameProps) {
  const [day, setDay] = useState<Date>(() => new Date());
  const [items, setItems] = useState<ExamAppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ date: day.toISOString() });
    if (branchId) params.set("branchId", branchId);
    fetch(`/api/exam-appointments?${params}`)
      .then((res) => res.json())
      .then((json) => setItems(json.data ?? []))
      .catch(() => toast.error("Erro ao carregar a agenda de exames"))
      .finally(() => setLoading(false));
  }, [day, branchId]);

  useEffect(() => {
    if (active) fetchItems();
  }, [active, fetchItems]);

  const updateStatus = useCallback(
    (id: string, status: "ATTENDED" | "NO_SHOW") => {
      setUpdatingId(id);
      fetch(`/api/exam-appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Falha ao atualizar");
          toast.success(
            status === "ATTENDED" ? "Marcado como compareceu" : "Marcado como faltou"
          );
          fetchItems();
        })
        .catch(() => toast.error("Erro ao atualizar o exame"))
        .finally(() => setUpdatingId(null));
    },
    [fetchItems]
  );

  const goToPreviousDay = () =>
    setDay((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() - 1);
      return next;
    });

  const goToNextDay = () =>
    setDay((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="icon" onClick={goToPreviousDay} aria-label="Dia anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-medium capitalize">{formatDayLabel(day)}</p>
        <Button variant="outline" size="icon" onClick={goToNextDay} aria-label="Próximo dia">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum exame para este dia.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <span className="w-14 shrink-0 font-mono text-sm font-medium">
                    {formatHour(item.scheduledAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.lead.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {item.lead.phone ?? "Sem telefone"}
                      {item.status !== "SCHEDULED" ? ` · ${STATUS_LABEL[item.status]}` : ""}
                    </p>
                  </div>
                  {item.status === "SCHEDULED" && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={updatingId === item.id}
                        onClick={() => updateStatus(item.id, "ATTENDED")}
                      >
                        Compareceu
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={updatingId === item.id}
                        onClick={() => updateStatus(item.id, "NO_SHOW")}
                      >
                        Faltou
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
