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
    },
    leadStage: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock)),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { createExamAppointment } from "@/services/exam-appointment.service";
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";

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
