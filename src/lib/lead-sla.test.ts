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
    expect(r.needsReply).toBe(0);
    expect(r.needsReplyLeads).toEqual([]);
  });

  // ── SLA AFIADO "precisa responder" (Item 5) ──────────────────────────────
  it("needsReply conta só quem a bola está com a ótica (needsReply=true)", () => {
    const now = new Date();
    const r = computeLeadSla(
      [
        { ...openLead("bola-otica", 2, now), needsReply: true },   // conta
        { ...openLead("respondido", 2, now), needsReply: false },  // ótica já respondeu
        { ...openLead("sem-sinal", 2, now) },                      // undefined → fora
      ],
      now,
    );
    expect(r.needsReply).toBe(1);
    expect(r.needsReplyLeads.map((l) => l.id)).toEqual(["bola-otica"]);
  });

  it("needsReply é ORTOGONAL ao tempo: pode precisar responder E estar no prazo", () => {
    const now = new Date();
    const r = computeLeadSla(
      [{ ...openLead("novinho", 1, now), needsReply: true }], // 1h = no prazo
      now,
    );
    expect(r.onTime).toBe(1);   // ainda no prazo pela faixa de tempo
    expect(r.needsReply).toBe(1); // mas a bola está com a ótica
  });

  it("needsReplyLeads ordenado do que mais espera resposta p/ o menos", () => {
    const now = new Date();
    const r = computeLeadSla(
      [
        { ...openLead("recente", 1, now), needsReply: true },
        { ...openLead("antigo", 10, now), needsReply: true },
      ],
      now,
    );
    expect(r.needsReplyLeads.map((l) => l.id)).toEqual(["antigo", "recente"]);
  });

  it("lead FECHADO nunca conta como precisa-responder mesmo com needsReply=true", () => {
    const now = new Date();
    const r = computeLeadSla(
      [{ id: "ganho", lastActivityAt: now, stage: { isWon: true, isLost: false }, needsReply: true }],
      now,
    );
    expect(r.needsReply).toBe(0);
  });

  // ── RELÓGIO REAL do "precisa responder" (#5): conta desde a msg do cliente ──
  it("hoursWaiting do needsReply usa waitingSince (msg do cliente), não lastActivityAt", () => {
    const now = new Date();
    // Card movido há 1h (lastActivityAt recente), MAS o cliente escreveu há 30h.
    const r = computeLeadSla(
      [{
        id: "L1",
        lastActivityAt: new Date(now.getTime() - 1 * 3600_000),
        waitingSince: new Date(now.getTime() - 30 * 3600_000),
        needsReply: true,
        stage: { isWon: false, isLost: false },
      }],
      now,
    );
    // O relógio afiado enxerga 30h de espera do cliente (não 1h do card).
    expect(r.needsReplyLeads[0].hoursWaiting).toBeCloseTo(30, 5);
    // A faixa de tempo (late/warning) continua sobre lastActivityAt (staleness do card).
    expect(r.onTime).toBe(1);
  });

  it("needsReply sem waitingSince cai no lastActivityAt (fallback seguro)", () => {
    const now = new Date();
    const r = computeLeadSla(
      [{ ...openLead("L1", 10, now), needsReply: true }], // sem waitingSince
      now,
    );
    expect(r.needsReplyLeads[0].hoursWaiting).toBeCloseTo(10, 5);
  });
});
