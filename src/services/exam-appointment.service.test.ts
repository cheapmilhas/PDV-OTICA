import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    lead: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    examAppointment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    leadStage: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  createExamAppointment,
  updateExamAppointment,
  listExamAppointmentsForDay,
} from "@/services/exam-appointment.service";
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";
import { startOfLocalDay, endOfLocalDay } from "@/lib/date-utils";

const COMPANY_ID = "company_1";
const CREATED_BY = "user_creator";

function baseLead(overrides: Partial<{
  id: string;
  customerId: string | null;
  branchId: string | null;
  stage: { id: string; isWon: boolean; isLost: boolean; systemKey: string | null };
}> = {}) {
  return {
    id: "lead_1",
    customerId: "customer_1",
    branchId: "branch_1",
    stage: { id: "stage_novo", isWon: false, isLost: false, systemKey: null },
    ...overrides,
  };
}

describe("createExamAppointment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria o agendamento (status SCHEDULED por default) E move o card para o estágio EXAM_SCHEDULED", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(baseLead());
    prismaMock.examAppointment.create.mockResolvedValue({ id: "appt_1" });
    prismaMock.leadStage.findFirst.mockResolvedValue({ id: "stage_exam_scheduled" });
    prismaMock.lead.updateMany.mockResolvedValue({ count: 1 });

    const scheduledAt = new Date("2026-08-01T12:00:00Z");
    await createExamAppointment(
      { leadId: "lead_1", scheduledAt, assignedUserId: null, note: null },
      COMPANY_ID,
      CREATED_BY,
    );

    expect(prismaMock.examAppointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: "lead_1",
          companyId: COMPANY_ID,
          scheduledAt,
          createdByUserId: CREATED_BY,
        }),
      }),
    );
    expect(prismaMock.leadStage.findFirst).toHaveBeenCalledWith({
      where: { companyId: COMPANY_ID, systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
      select: { id: true },
    });
    expect(prismaMock.lead.updateMany).toHaveBeenCalledWith({
      where: { id: "lead_1", companyId: COMPANY_ID },
      data: { stageId: "stage_exam_scheduled", lastActivityAt: expect.any(Date) },
    });
  });

  it("herda customerId/branchId DO LEAD (não do input)", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(
      baseLead({ customerId: "customer_from_lead", branchId: "branch_from_lead" }),
    );
    prismaMock.examAppointment.create.mockResolvedValue({ id: "appt_1" });
    prismaMock.leadStage.findFirst.mockResolvedValue({ id: "stage_exam_scheduled" });
    prismaMock.lead.updateMany.mockResolvedValue({ count: 1 });

    await createExamAppointment(
      { leadId: "lead_1", scheduledAt: new Date(), assignedUserId: null, note: null },
      COMPANY_ID,
      CREATED_BY,
    );

    expect(prismaMock.examAppointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: "customer_from_lead",
          branchId: "branch_from_lead",
        }),
      }),
    );
  });

  it("lead de outra empresa (findFirst null) → throw notFoundError, NÃO chama create", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(null);

    await expect(
      createExamAppointment(
        { leadId: "lead_alheio", scheduledAt: new Date(), assignedUserId: null, note: null },
        COMPANY_ID,
        CREATED_BY,
      ),
    ).rejects.toThrow();

    expect(prismaMock.lead.findFirst).toHaveBeenCalledWith({
      where: { id: "lead_alheio", companyId: COMPANY_ID, deletedAt: null },
      select: expect.any(Object),
    });
    expect(prismaMock.examAppointment.create).not.toHaveBeenCalled();
  });

  it("assignedUserId informado mas de outra empresa (user.findFirst null) → throw, não cria", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(baseLead());
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      createExamAppointment(
        {
          leadId: "lead_1",
          scheduledAt: new Date(),
          assignedUserId: "user_alheio",
          note: null,
        },
        COMPANY_ID,
        CREATED_BY,
      ),
    ).rejects.toThrow();

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user_alheio", companyId: COMPANY_ID },
      select: { id: true },
    });
    expect(prismaMock.examAppointment.create).not.toHaveBeenCalled();
  });

  it("lead cujo stage já é isWon → cria o agendamento MAS NÃO move o card", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(
      baseLead({ stage: { id: "stage_won", isWon: true, isLost: false, systemKey: null } }),
    );
    prismaMock.examAppointment.create.mockResolvedValue({ id: "appt_1" });

    await createExamAppointment(
      { leadId: "lead_1", scheduledAt: new Date(), assignedUserId: null, note: null },
      COMPANY_ID,
      CREATED_BY,
    );

    expect(prismaMock.examAppointment.create).toHaveBeenCalled();
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it("lead cujo stage já é isLost → cria o agendamento MAS NÃO move o card", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(
      baseLead({ stage: { id: "stage_lost", isWon: false, isLost: true, systemKey: null } }),
    );
    prismaMock.examAppointment.create.mockResolvedValue({ id: "appt_1" });

    await createExamAppointment(
      { leadId: "lead_1", scheduledAt: new Date(), assignedUserId: null, note: null },
      COMPANY_ID,
      CREATED_BY,
    );

    expect(prismaMock.examAppointment.create).toHaveBeenCalled();
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it("lead cujo stage já é EXAM_DONE (systemKey) → cria o agendamento MAS NÃO move o card", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(
      baseLead({
        stage: { id: "stage_exam_done", isWon: false, isLost: false, systemKey: LEAD_STAGE_KEYS.EXAM_DONE },
      }),
    );
    prismaMock.examAppointment.create.mockResolvedValue({ id: "appt_1" });

    await createExamAppointment(
      { leadId: "lead_1", scheduledAt: new Date(), assignedUserId: null, note: null },
      COMPANY_ID,
      CREATED_BY,
    );

    expect(prismaMock.examAppointment.create).toHaveBeenCalled();
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it("sem estágio EXAM_SCHEDULED na ótica (leadStage.findFirst null) → cria agendamento, não move, não explode", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(baseLead());
    prismaMock.examAppointment.create.mockResolvedValue({ id: "appt_1" });
    prismaMock.leadStage.findFirst.mockResolvedValue(null);

    await createExamAppointment(
      { leadId: "lead_1", scheduledAt: new Date(), assignedUserId: null, note: null },
      COMPANY_ID,
      CREATED_BY,
    );

    expect(prismaMock.examAppointment.create).toHaveBeenCalled();
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });
});

describe("updateExamAppointment", () => {
  beforeEach(() => vi.clearAllMocks());

  const APPT_ID = "appt_1";

  it("CANCELLED: muda status E, se o card ainda está em EXAM_SCHEDULED, move p/ o 1º estágio aberto", async () => {
    prismaMock.examAppointment.findFirst.mockResolvedValue({
      id: APPT_ID,
      leadId: "lead_1",
      status: "SCHEDULED",
    });
    prismaMock.examAppointment.update.mockResolvedValue({ id: APPT_ID, status: "CANCELLED" });
    prismaMock.lead.findFirst.mockResolvedValue({
      id: "lead_1",
      stage: { systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
    });
    prismaMock.leadStage.findFirst.mockResolvedValue({ id: "stage_first_open" });
    prismaMock.lead.updateMany.mockResolvedValue({ count: 1 });

    await updateExamAppointment(APPT_ID, { status: "CANCELLED" }, COMPANY_ID);

    expect(prismaMock.examAppointment.update).toHaveBeenCalledWith({
      where: { id: APPT_ID },
      data: { status: "CANCELLED" },
    });
    expect(prismaMock.leadStage.findFirst).toHaveBeenCalledWith({
      where: { companyId: COMPANY_ID, isWon: false, isLost: false },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    expect(prismaMock.lead.updateMany).toHaveBeenCalledWith({
      where: { id: "lead_1", companyId: COMPANY_ID },
      data: { stageId: "stage_first_open", lastActivityAt: expect.any(Date) },
    });
  });

  it("NO_SHOW: muda status E reverte o card (mesmo padrão do CANCELLED)", async () => {
    prismaMock.examAppointment.findFirst.mockResolvedValue({
      id: APPT_ID,
      leadId: "lead_1",
      status: "SCHEDULED",
    });
    prismaMock.examAppointment.update.mockResolvedValue({ id: APPT_ID, status: "NO_SHOW" });
    prismaMock.lead.findFirst.mockResolvedValue({
      id: "lead_1",
      stage: { systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
    });
    prismaMock.leadStage.findFirst.mockResolvedValue({ id: "stage_first_open" });
    prismaMock.lead.updateMany.mockResolvedValue({ count: 1 });

    await updateExamAppointment(APPT_ID, { status: "NO_SHOW" }, COMPANY_ID);

    expect(prismaMock.examAppointment.update).toHaveBeenCalledWith({
      where: { id: APPT_ID },
      data: { status: "NO_SHOW" },
    });
    expect(prismaMock.lead.updateMany).toHaveBeenCalledWith({
      where: { id: "lead_1", companyId: COMPANY_ID },
      data: { stageId: "stage_first_open", lastActivityAt: expect.any(Date) },
    });
  });

  it("ATTENDED: muda status, card NÃO se move", async () => {
    prismaMock.examAppointment.findFirst.mockResolvedValue({
      id: APPT_ID,
      leadId: "lead_1",
      status: "SCHEDULED",
    });
    prismaMock.examAppointment.update.mockResolvedValue({ id: APPT_ID, status: "ATTENDED" });

    await updateExamAppointment(APPT_ID, { status: "ATTENDED" }, COMPANY_ID);

    expect(prismaMock.examAppointment.update).toHaveBeenCalledWith({
      where: { id: APPT_ID },
      data: { status: "ATTENDED" },
    });
    expect(prismaMock.lead.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it("cancelar quando o card já foi movido por humano p/ outro estágio → status muda, card fica (não reverte)", async () => {
    prismaMock.examAppointment.findFirst.mockResolvedValue({
      id: APPT_ID,
      leadId: "lead_1",
      status: "SCHEDULED",
    });
    prismaMock.examAppointment.update.mockResolvedValue({ id: APPT_ID, status: "CANCELLED" });
    prismaMock.lead.findFirst.mockResolvedValue({
      id: "lead_1",
      stage: { systemKey: "OUTRO_ESTAGIO" },
    });

    await updateExamAppointment(APPT_ID, { status: "CANCELLED" }, COMPANY_ID);

    expect(prismaMock.examAppointment.update).toHaveBeenCalledWith({
      where: { id: APPT_ID },
      data: { status: "CANCELLED" },
    });
    expect(prismaMock.leadStage.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it("remarcar (só scheduledAt, sem status) → só atualiza a data, card não mexe", async () => {
    prismaMock.examAppointment.findFirst.mockResolvedValue({
      id: APPT_ID,
      leadId: "lead_1",
      status: "SCHEDULED",
    });
    const novaData = new Date("2026-09-01T10:00:00Z");
    prismaMock.examAppointment.update.mockResolvedValue({ id: APPT_ID, scheduledAt: novaData });

    await updateExamAppointment(APPT_ID, { scheduledAt: novaData }, COMPANY_ID);

    expect(prismaMock.examAppointment.update).toHaveBeenCalledWith({
      where: { id: APPT_ID },
      data: { scheduledAt: novaData },
    });
    expect(prismaMock.lead.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it("remarcar com status SCHEDULED → só atualiza, card não mexe", async () => {
    prismaMock.examAppointment.findFirst.mockResolvedValue({
      id: APPT_ID,
      leadId: "lead_1",
      status: "SCHEDULED",
    });
    const novaData = new Date("2026-09-02T10:00:00Z");
    prismaMock.examAppointment.update.mockResolvedValue({ id: APPT_ID, scheduledAt: novaData, status: "SCHEDULED" });

    await updateExamAppointment(APPT_ID, { status: "SCHEDULED", scheduledAt: novaData }, COMPANY_ID);

    expect(prismaMock.examAppointment.update).toHaveBeenCalledWith({
      where: { id: APPT_ID },
      data: { status: "SCHEDULED", scheduledAt: novaData },
    });
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it("agendamento de outra empresa (findFirst null) → throw notFoundError, não chama update", async () => {
    prismaMock.examAppointment.findFirst.mockResolvedValue(null);

    await expect(
      updateExamAppointment("appt_alheio", { status: "CANCELLED" }, COMPANY_ID),
    ).rejects.toThrow();

    expect(prismaMock.examAppointment.findFirst).toHaveBeenCalledWith({
      where: { id: "appt_alheio", companyId: COMPANY_ID },
      select: expect.any(Object),
    });
    expect(prismaMock.examAppointment.update).not.toHaveBeenCalled();
  });
});

describe("listExamAppointmentsForDay", () => {
  beforeEach(() => vi.clearAllMocks());

  const DAY = new Date("2026-08-15T22:00:00-03:00"); // 22h BRT = 01h UTC do dia seguinte

  it("filtra por companyId e pela janela do dia LOCAL (BRT), via startOfLocalDay/endOfLocalDay, orderBy scheduledAt asc", async () => {
    prismaMock.examAppointment.findMany.mockResolvedValue([]);

    await listExamAppointmentsForDay(DAY, COMPANY_ID);

    const expectedGte = startOfLocalDay(DAY);
    const expectedLte = endOfLocalDay(DAY);

    expect(prismaMock.examAppointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: COMPANY_ID,
          scheduledAt: { gte: expectedGte, lte: expectedLte },
        }),
        orderBy: { scheduledAt: "asc" },
      }),
    );

    // Prova de fuso: a janela NÃO é a UTC crua do dia (00:00Z–23:59:59.999Z),
    // e sim o instante UTC correspondente a 00:00/23:59:59.999 em BRT — o que
    // garante que um exame às 22h BRT não vaza para o dia seguinte.
    expect(expectedGte.toISOString()).not.toBe("2026-08-15T00:00:00.000Z");
    expect(expectedLte.toISOString()).not.toBe("2026-08-15T23:59:59.999Z");
  });

  it("com branchId → where inclui branchId", async () => {
    prismaMock.examAppointment.findMany.mockResolvedValue([]);

    await listExamAppointmentsForDay(DAY, COMPANY_ID, "branch_1");

    expect(prismaMock.examAppointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: "branch_1" }),
      }),
    );
  });

  it("sem branchId (undefined) → where NÃO inclui a chave branchId (retorna todos da empresa)", async () => {
    prismaMock.examAppointment.findMany.mockResolvedValue([]);

    await listExamAppointmentsForDay(DAY, COMPANY_ID);

    const call = prismaMock.examAppointment.findMany.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(call.where, "branchId")).toBe(false);
  });

  it("com branchId null → where NÃO inclui a chave branchId", async () => {
    prismaMock.examAppointment.findMany.mockResolvedValue([]);

    await listExamAppointmentsForDay(DAY, COMPANY_ID, null);

    const call = prismaMock.examAppointment.findMany.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(call.where, "branchId")).toBe(false);
  });
});
