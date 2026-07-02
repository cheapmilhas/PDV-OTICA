import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { lead: { findMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { listColdLeads, COLD_DAYS, coldLeadDraft } from "./cold-leads.service";

const NOW = new Date("2026-07-02T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600_000);

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.lead.findMany as any).mockResolvedValue([]);
});

function whereOf() {
  return (prisma.lead.findMany as any).mock.calls[0][0].where;
}

describe("listColdLeads — where (não-convertidos p/ recuperar)", () => {
  it("exige sem venda (sales none) e não-ganho (stage.isWon=false)", async () => {
    await listColdLeads("co_1", null, {}, NOW);
    const w = whereOf();
    expect(w.companyId).toBe("co_1");
    expect(w.sales).toEqual({ none: {} });
    expect(w.stage).toEqual({ isWon: false });
  });

  it("'esfriou' = perdido OU aberto parado há >= COLD_DAYS (dentro de AND)", async () => {
    await listColdLeads("co_1", null, {}, NOW);
    const w = whereOf();
    // O OR foi movido pra AND (evita colisão com filtros futuros).
    const orClause = w.AND.find((c: any) => c.OR)?.OR;
    expect(orClause).toBeTruthy();
    expect(orClause[0]).toEqual({ stage: { isLost: true } });
    expect(orClause[1].stage).toEqual({ isLost: false });
    // borda = agora - COLD_DAYS
    const expected = new Date(NOW.getTime() - COLD_DAYS * 24 * 3600_000);
    expect(orClause[1].lastActivityAt.lt.getTime()).toBe(expected.getTime());
  });

  it("filial: escopo de branch no AND (não-atribuídos contam)", async () => {
    await listColdLeads("co_1", "branch_x", {}, NOW);
    const w = whereOf();
    expect(w.AND).toEqual(
      expect.arrayContaining([{ OR: [{ branchId: "branch_x" }, { branchId: null }] }]),
    );
  });

  it("filtros origem/motivo/período entram no where", async () => {
    const from = daysAgo(30);
    await listColdLeads("co_1", null, { source: "INSTAGRAM", lostReason: "Preço", from }, NOW);
    const w = whereOf();
    expect(w.source).toBe("INSTAGRAM");
    expect(w.lostReason).toBe("Preço");
    expect(w.createdAt).toEqual({ gte: from });
  });

  it("sem filtros → sem source/lostReason/createdAt", async () => {
    await listColdLeads("co_1", null, {}, NOW);
    const w = whereOf();
    expect(w.source).toBeUndefined();
    expect(w.lostReason).toBeUndefined();
    expect(w.createdAt).toBeUndefined();
  });
});

describe("listColdLeads — mapeamento das linhas", () => {
  it("perdido vira status='lost'; aberto-frio vira 'cold'; ordena pelo mais frio", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", name: "João", phone: "1", source: "WHATSAPP", lostReason: "Preço", lastActivityAt: daysAgo(20), stage: { isLost: true }, customer: null },
      { id: "b", name: "Maria", phone: "2", source: "INSTAGRAM", lostReason: null, lastActivityAt: daysAgo(10), stage: { isLost: false }, customer: null },
    ]);
    const rows = await listColdLeads("co_1", null, {}, NOW);
    expect(rows[0]).toMatchObject({ id: "a", status: "lost", lostReason: "Preço", coldFor: "há 20 dias" });
    expect(rows[1]).toMatchObject({ id: "b", status: "cold", coldFor: "há 10 dias" });
    // orderBy no banco é asc (mais frio primeiro) — o service não reordena.
    expect((prisma.lead.findMany as any).mock.calls[0][0].orderBy).toEqual({ lastActivityAt: "asc" });
  });

  it("prefere nome/telefone do cliente vinculado; draft usa 1º nome", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", name: "Contato Whats", phone: "0000", source: null, lostReason: null, lastActivityAt: daysAgo(9), stage: { isLost: false }, customer: { name: "Ana Paula Souza", phone: "9999" } },
    ]);
    const rows = await listColdLeads("co_1", null, {}, NOW);
    expect(rows[0].name).toBe("Ana Paula Souza");
    expect(rows[0].phone).toBe("9999");
    expect(rows[0].draftText).toContain("Ana");
  });

  it("sem nome vira 'Cliente'", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "a", name: "", phone: null, source: null, lostReason: null, lastActivityAt: daysAgo(9), stage: { isLost: false }, customer: null },
    ]);
    const rows = await listColdLeads("co_1", null, {}, NOW);
    expect(rows[0].name).toBe("Cliente");
    expect(rows[0].phone).toBeNull();
  });
});

describe("coldLeadDraft", () => {
  it("usa o primeiro nome e menciona condição/interesse", () => {
    const d = coldLeadDraft("Carlos Souza");
    expect(d).toContain("Carlos");
    expect(d.toLowerCase()).toMatch(/interesse|condição/);
  });
});
