import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    leadStage: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    lead: {
      count: vi.fn(),
    },
    // Roda o callback com o mesmo mock (create + shift são atômicos no código real).
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  DEFAULT_LEAD_STAGES,
  ensureOpticalStages,
  createStage,
  deleteStage,
} from "@/services/lead-stage.service";
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";

describe("colunas de ótica", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DEFAULT_LEAD_STAGES tem 8 colunas na ordem certa e o 'Exame feito' com a flag", () => {
    expect(DEFAULT_LEAD_STAGES.map((s) => s.name)).toEqual([
      "Novo",
      "Em atendimento",
      "Exame agendado",
      "Exame feito",
      "Orçamento enviado",
      "Aguardando OS/lab",
      "Fechado",
      "Perdido",
    ]);
    const examDone = DEFAULT_LEAD_STAGES.find((s) => s.name === "Exame feito");
    expect(examDone?.systemKey).toBe(LEAD_STAGE_KEYS.EXAM_DONE);
    const examScheduled = DEFAULT_LEAD_STAGES.find((s) => s.name === "Exame agendado");
    expect(examScheduled?.systemKey).toBe(LEAD_STAGE_KEYS.EXAM_SCHEDULED);
    const orders = DEFAULT_LEAD_STAGES.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(DEFAULT_LEAD_STAGES.filter((s) => s.isWon)).toHaveLength(1);
    expect(DEFAULT_LEAD_STAGES.filter((s) => s.isLost)).toHaveLength(1);
  });

  it("ensureOpticalStages: ótica sem as colunas de exame ganha as 3 novas (não duplica as que já tem)", async () => {
    prismaMock.leadStage.findMany.mockResolvedValue([
      { id: "s0", name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null },
      { id: "s1", name: "Em atendimento", order: 1, isWon: false, isLost: false, systemKey: null },
      { id: "s2", name: "Orçamento enviado", order: 2, isWon: false, isLost: false, systemKey: null },
      { id: "s3", name: "Fechado", order: 3, isWon: true, isLost: false, systemKey: null },
      { id: "s4", name: "Perdido", order: 4, isWon: false, isLost: true, systemKey: null },
    ]);
    prismaMock.leadStage.createMany.mockResolvedValue({ count: 3 });

    const created = await ensureOpticalStages("company_1");

    expect(created).toBe(3);
    const call = prismaMock.leadStage.createMany.mock.calls[0][0];
    const names = call.data.map((s: { name: string }) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(["Exame agendado", "Exame feito", "Aguardando OS/lab"]),
    );
    expect(names).not.toContain("Novo");
    const examDone = call.data.find((s: { name: string }) => s.name === "Exame feito");
    expect(examDone.systemKey).toBe(LEAD_STAGE_KEYS.EXAM_DONE);
    expect(call.data.every((s: { companyId: string }) => s.companyId === "company_1")).toBe(true);
  });

  it("ensureOpticalStages: idempotente — ótica que já tem as colunas não cria nada (mas 'Exame agendado' sem flag ainda recebe o backfill)", async () => {
    prismaMock.leadStage.findMany.mockResolvedValue([
      { id: "s0", name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null },
      { id: "s2", name: "Exame agendado", order: 2, isWon: false, isLost: false, systemKey: null },
      { id: "s3", name: "Exame feito", order: 3, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
      { id: "s5", name: "Aguardando OS/lab", order: 5, isWon: false, isLost: false, systemKey: null },
    ]);

    const created = await ensureOpticalStages("company_1");

    expect(created).toBe(0);
    expect(prismaMock.leadStage.createMany).not.toHaveBeenCalled();
    // Backfill da flag EXAM_SCHEDULED — "Exame agendado" já existia por nome mas
    // sem systemKey (fixture reflete o cenário Atacadão pré-feature).
    expect(prismaMock.leadStage.update).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: { systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
    });
  });

  it("ensureOpticalStages: colunas novas entram ANTES das terminais (Fechado/Perdido ficam por último)", async () => {
    // Funil legado: Novo=0, Em atendimento=1, Orçamento enviado=2, Fechado=3 (isWon), Perdido=4 (isLost).
    prismaMock.leadStage.findMany.mockResolvedValue([
      { id: "s0", name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null },
      { id: "s1", name: "Em atendimento", order: 1, isWon: false, isLost: false, systemKey: null },
      { id: "s2", name: "Orçamento enviado", order: 2, isWon: false, isLost: false, systemKey: null },
      { id: "sWon", name: "Fechado", order: 3, isWon: true, isLost: false, systemKey: null },
      { id: "sLost", name: "Perdido", order: 4, isWon: false, isLost: true, systemKey: null },
    ]);
    prismaMock.leadStage.createMany.mockResolvedValue({ count: 3 });

    const created = await ensureOpticalStages("company_1");
    expect(created).toBe(3);

    // (a) As 3 novas colunas ocupam orders 3,4,5 (logo abaixo da primeira terminal).
    const call = prismaMock.leadStage.createMany.mock.calls[0][0];
    const byName = new Map<string, number>(
      call.data.map((s: { name: string; order: number }) => [s.name, s.order]),
    );
    expect(byName.get("Exame agendado")).toBe(3);
    expect(byName.get("Exame feito")).toBe(4);
    expect(byName.get("Aguardando OS/lab")).toBe(5);

    // (b) As terminais foram empurradas para DEPOIS das novas: Fechado 3→6, Perdido 4→7.
    const updateCalls = prismaMock.leadStage.update.mock.calls.map((c) => c[0]);
    const fechado = updateCalls.find((u) => u.where.id === "sWon");
    const perdido = updateCalls.find((u) => u.where.id === "sLost");
    expect(fechado?.data.order).toBe(6);
    expect(perdido?.data.order).toBe(7);

    // Nenhuma coluna NÃO-terminal foi reordenada (só as 2 terminais sofreram update).
    expect(prismaMock.leadStage.update).toHaveBeenCalledTimes(2);
    const updatedIds = updateCalls.map((u) => u.where.id);
    expect(updatedIds).not.toContain("s0");
    expect(updatedIds).not.toContain("s1");
    expect(updatedIds).not.toContain("s2");

    // Board final (por order asc): Novo, Em atendimento, Orçamento, [3 novas], Fechado, Perdido.
    const finalOrder = [
      ...[
        { name: "Novo", order: 0 },
        { name: "Em atendimento", order: 1 },
        { name: "Orçamento enviado", order: 2 },
      ],
      ...call.data.map((s: { name: string; order: number }) => ({ name: s.name, order: s.order })),
      { name: "Fechado", order: 6 },
      { name: "Perdido", order: 7 },
    ]
      .sort((a, b) => a.order - b.order)
      .map((s) => s.name);
    expect(finalOrder).toEqual([
      "Novo",
      "Em atendimento",
      "Orçamento enviado",
      "Exame agendado",
      "Exame feito",
      "Aguardando OS/lab",
      "Fechado",
      "Perdido",
    ]);
  });

  it("ensureOpticalStages: coluna custom NÃO-terminal parada depois das terminais também é empurrada (sem colisão de order)", async () => {
    // Dono criou "Garantia" (não-terminal) em order 5, DEPOIS de Fechado=3/Perdido=4.
    prismaMock.leadStage.findMany.mockResolvedValue([
      { id: "s0", name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null },
      { id: "s1", name: "Em atendimento", order: 1, isWon: false, isLost: false, systemKey: null },
      { id: "s2", name: "Orçamento enviado", order: 2, isWon: false, isLost: false, systemKey: null },
      { id: "sWon", name: "Fechado", order: 3, isWon: true, isLost: false, systemKey: null },
      { id: "sLost", name: "Perdido", order: 4, isWon: false, isLost: true, systemKey: null },
      { id: "sGar", name: "Garantia", order: 5, isWon: false, isLost: false, systemKey: null },
    ]);
    prismaMock.leadStage.createMany.mockResolvedValue({ count: 3 });

    const created = await ensureOpticalStages("company_1");
    expect(created).toBe(3);

    // insertAt = 3 (menor order terminal). As 3 novas ocupam 3,4,5.
    const call = prismaMock.leadStage.createMany.mock.calls[0][0];
    const newByName = new Map<string, number>(
      call.data.map((s: { name: string; order: number }) => [s.name, s.order]),
    );
    expect(newByName.get("Exame agendado")).toBe(3);
    expect(newByName.get("Exame feito")).toBe(4);
    expect(newByName.get("Aguardando OS/lab")).toBe(5);

    // Empurra TODAS as colunas com order >= 3: Fechado 3→6, Perdido 4→7, Garantia 5→8.
    const updateCalls = prismaMock.leadStage.update.mock.calls.map((c) => c[0]);
    const shifted = new Map<string, number>(
      updateCalls.map((u) => [u.where.id as string, u.data.order as number]),
    );
    expect(shifted.get("sWon")).toBe(6);
    expect(shifted.get("sLost")).toBe(7);
    expect(shifted.get("sGar")).toBe(8);
    expect(prismaMock.leadStage.update).toHaveBeenCalledTimes(3);

    // Colunas com order < 3 (Novo/Atend/Orçamento) NÃO foram tocadas.
    const updatedIds = updateCalls.map((u) => u.where.id);
    expect(updatedIds).not.toContain("s0");
    expect(updatedIds).not.toContain("s1");
    expect(updatedIds).not.toContain("s2");

    // Board final: nenhum order duplicado; terminais + Garantia ficam DEPOIS das colunas de exame.
    const finalStages = [
      { name: "Novo", order: 0 },
      { name: "Em atendimento", order: 1 },
      { name: "Orçamento enviado", order: 2 },
      ...call.data.map((s: { name: string; order: number }) => ({ name: s.name, order: s.order })),
      { name: "Fechado", order: shifted.get("sWon")! },
      { name: "Perdido", order: shifted.get("sLost")! },
      { name: "Garantia", order: shifted.get("sGar")! },
    ];
    const orders = finalStages.map((s) => s.order);
    expect(new Set(orders).size).toBe(orders.length); // sem duplicatas
    const finalOrder = [...finalStages].sort((a, b) => a.order - b.order).map((s) => s.name);
    expect(finalOrder).toEqual([
      "Novo",
      "Em atendimento",
      "Orçamento enviado",
      "Exame agendado",
      "Exame feito",
      "Aguardando OS/lab",
      "Fechado",
      "Perdido",
      "Garantia",
    ]);
  });
  it("ensureOpticalStages: backfill Atacadão — ótica já tem TODAS as colunas mas 'Exame agendado' está com systemKey null → grava a flag EXAM_SCHEDULED", async () => {
    prismaMock.leadStage.findMany.mockResolvedValue([
      { id: "s0", name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null },
      { id: "s1", name: "Em atendimento", order: 1, isWon: false, isLost: false, systemKey: null },
      { id: "s2", name: "Exame agendado", order: 2, isWon: false, isLost: false, systemKey: null },
      { id: "s3", name: "Exame feito", order: 3, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
      { id: "s4", name: "Orçamento enviado", order: 4, isWon: false, isLost: false, systemKey: null },
      { id: "s5", name: "Aguardando OS/lab", order: 5, isWon: false, isLost: false, systemKey: null },
      { id: "s6", name: "Fechado", order: 6, isWon: true, isLost: false, systemKey: null },
      { id: "s7", name: "Perdido", order: 7, isWon: false, isLost: true, systemKey: null },
    ]);

    const created = await ensureOpticalStages("company_1");

    expect(created).toBe(0);
    expect(prismaMock.leadStage.createMany).not.toHaveBeenCalled();
    expect(prismaMock.leadStage.update).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: { systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
    });
  });

  it("ensureOpticalStages: idempotente — 'Exame agendado' já com a flag EXAM_SCHEDULED não dispara update de novo", async () => {
    prismaMock.leadStage.findMany.mockResolvedValue([
      { id: "s0", name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null },
      { id: "s1", name: "Em atendimento", order: 1, isWon: false, isLost: false, systemKey: null },
      { id: "s2", name: "Exame agendado", order: 2, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
      { id: "s3", name: "Exame feito", order: 3, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
      { id: "s4", name: "Orçamento enviado", order: 4, isWon: false, isLost: false, systemKey: null },
      { id: "s5", name: "Aguardando OS/lab", order: 5, isWon: false, isLost: false, systemKey: null },
      { id: "s6", name: "Fechado", order: 6, isWon: true, isLost: false, systemKey: null },
      { id: "s7", name: "Perdido", order: 7, isWon: false, isLost: true, systemKey: null },
    ]);

    const created = await ensureOpticalStages("company_1");

    expect(created).toBe(0);
    expect(prismaMock.leadStage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED } }),
    );
  });

  it("ensureOpticalStages: anti-colisão — se OUTRA coluna já tem EXAM_SCHEDULED, não grava a flag numa segunda coluna 'Exame agendado' sem flag", async () => {
    prismaMock.leadStage.findMany.mockResolvedValue([
      { id: "s0", name: "Novo", order: 0, isWon: false, isLost: false, systemKey: null },
      { id: "s1", name: "Em atendimento", order: 1, isWon: false, isLost: false, systemKey: null },
      // Coluna renomeada por engano, mas já detém a flag estável.
      { id: "sOld", name: "Agendamento antigo", order: 2, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
      // Uma segunda coluna com o NOME "Exame agendado", sem flag (cenário raro/defensivo).
      { id: "s2", name: "Exame agendado", order: 3, isWon: false, isLost: false, systemKey: null },
      { id: "s3", name: "Exame feito", order: 4, isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
      { id: "s4", name: "Orçamento enviado", order: 5, isWon: false, isLost: false, systemKey: null },
      { id: "s5", name: "Aguardando OS/lab", order: 6, isWon: false, isLost: false, systemKey: null },
      { id: "s6", name: "Fechado", order: 7, isWon: true, isLost: false, systemKey: null },
      { id: "s7", name: "Perdido", order: 8, isWon: false, isLost: true, systemKey: null },
    ]);

    const created = await ensureOpticalStages("company_1");

    expect(created).toBe(0);
    expect(prismaMock.leadStage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED } }),
    );
  });
});

describe("createStage — insert-and-shift", () => {
  beforeEach(() => vi.clearAllMocks());

  it("empurra +1 todo estágio com order >= o pedido ANTES de criar (sem colisão de order)", async () => {
    const created = {
      id: "new1",
      name: "Nova",
      order: 6,
      companyId: "company_1",
    };
    prismaMock.leadStage.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.leadStage.create.mockResolvedValue(created);

    const result = await createStage("company_1", { name: "Nova", order: 6 });

    // Abre o vão: UPDATE em lote (não loop) em todo order >= 6 desta empresa.
    expect(prismaMock.leadStage.updateMany).toHaveBeenCalledWith({
      where: { companyId: "company_1", order: { gte: 6 } },
      data: { order: { increment: 1 } },
    });
    // A nova coluna é criada com o companyId e o order pedido.
    expect(prismaMock.leadStage.create).toHaveBeenCalledWith({
      data: { name: "Nova", order: 6, companyId: "company_1" },
    });
    // O shift acontece ANTES do create (invariante: espaço aberto primeiro).
    const shiftOrder = prismaMock.leadStage.updateMany.mock.invocationCallOrder[0];
    const createOrder = prismaMock.leadStage.create.mock.invocationCallOrder[0];
    expect(shiftOrder).toBeLessThan(createOrder);
    // Tudo dentro de uma transação (atômico).
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toBe(created);
  });
});

describe("deleteStage — bloqueios", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloqueia apagar coluna de sistema (systemKey) mesmo sem leads dentro", async () => {
    prismaMock.leadStage.findFirst.mockResolvedValue({
      id: "s_exam",
      companyId: "company_1",
      isWon: false,
      isLost: false,
      systemKey: LEAD_STAGE_KEYS.EXAM_DONE,
    });
    prismaMock.lead.count.mockResolvedValue(0);

    await expect(deleteStage("s_exam", "company_1")).rejects.toThrow(
      "Não é possível apagar uma coluna de sistema",
    );
    expect(prismaMock.leadStage.delete).not.toHaveBeenCalled();
  });

  it("permite apagar coluna comum (sem systemKey, não-terminal, sem leads)", async () => {
    prismaMock.leadStage.findFirst.mockResolvedValue({
      id: "s_custom",
      companyId: "company_1",
      isWon: false,
      isLost: false,
      systemKey: null,
    });
    prismaMock.lead.count.mockResolvedValue(0);
    prismaMock.leadStage.delete.mockResolvedValue({ id: "s_custom" });

    await deleteStage("s_custom", "company_1");

    expect(prismaMock.leadStage.delete).toHaveBeenCalledWith({ where: { id: "s_custom" } });
  });
});
