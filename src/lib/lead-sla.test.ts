import { describe, it, expect } from "vitest";
import { computeLeadSla, SLA_WARN_HOURS, SLA_LATE_HOURS } from "./lead-sla";

// Helper: cria um lead aberto parado há `h` horas relativo a `now` (determinístico).
function openLead(id: string, hoursAgo: number, now: Date) {
  return {
    id,
    lastActivityAt: new Date(now.getTime() - hoursAgo * 3600_000),
    stage: { isWon: false, isLost: false },
  };
}

describe("computeLeadSla — SLA de lead não respondido (Fase 3, Item 4a)", () => {
  it("classifica em no-prazo / atenção / atrasado pelas faixas de horas", () => {
    const now = new Date();
    const r = computeLeadSla(
      [
        openLead("a", 1, now),                 // no prazo (< SLA_WARN_HOURS)
        openLead("b", SLA_WARN_HOURS + 1, now), // atenção
        openLead("c", SLA_LATE_HOURS + 1, now), // atrasado
      ],
      now,
    );
    expect(r.onTime).toBe(1);
    expect(r.warning).toBe(1);
    expect(r.late).toBe(1);
    expect(r.totalOpen).toBe(3);
  });

  it("nos limites EXATOS: 4h cai em atenção, 24h cai em atrasado (>=)", () => {
    const now = new Date();
    const r = computeLeadSla(
      [
        openLead("warn", SLA_WARN_HOURS, now), // exatamente 4h → warning
        openLead("late", SLA_LATE_HOURS, now), // exatamente 24h → late
      ],
      now,
    );
    expect(r.warning).toBe(1);
    expect(r.late).toBe(1);
    expect(r.onTime).toBe(0);
  });

  it("ignora leads ganhos ou perdidos (não estão 'aguardando resposta')", () => {
    const now = new Date();
    const r = computeLeadSla(
      [
        { id: "won", lastActivityAt: new Date(0), stage: { isWon: true, isLost: false } },
        { id: "lost", lastActivityAt: new Date(0), stage: { isWon: false, isLost: true } },
        openLead("open", SLA_LATE_HOURS + 5, now),
      ],
      now,
    );
    expect(r.totalOpen).toBe(1);
    expect(r.late).toBe(1);
  });

  it("lista os atrasados ordenados do mais parado p/ o menos (p/ o gerente agir)", () => {
    const now = new Date();
    const r = computeLeadSla(
      [
        openLead("recente", SLA_LATE_HOURS + 1, now),
        openLead("antigo", SLA_LATE_HOURS + 100, now),
      ],
      now,
    );
    expect(r.lateLeads.map((l) => l.id)).toEqual(["antigo", "recente"]);
    expect(r.lateLeads[0].hoursWaiting).toBeGreaterThan(r.lateLeads[1].hoursWaiting);
  });

  it("amostra vazia → tudo zero, sem erro", () => {
    const r = computeLeadSla([], new Date());
    expect(r.totalOpen).toBe(0);
    expect(r.onTime).toBe(0);
    expect(r.warning).toBe(0);
    expect(r.late).toBe(0);
    expect(r.lateLeads).toEqual([]);
  });
});
