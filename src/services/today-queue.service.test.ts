import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findMany: vi.fn() },
    whatsappMessageLog: { findMany: vi.fn() },
    serviceOrder: { findMany: vi.fn() },
  },
}));

// O relógio do "precisa responder" é testado à parte — aqui mockamos o retorno.
vi.mock("@/services/lead-needs-reply.service", () => ({
  computeNeedsReplyLeadIds: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { computeNeedsReplyLeadIds } from "@/services/lead-needs-reply.service";
import { getTodayQueue } from "./today-queue.service";

const NOW = new Date("2026-07-02T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.lead.findMany as any).mockResolvedValue([]);
  (prisma.whatsappMessageLog.findMany as any).mockResolvedValue([]);
  (prisma.serviceOrder.findMany as any).mockResolvedValue([]);
  (computeNeedsReplyLeadIds as any).mockResolvedValue(new Map());
});

describe("getTodayQueue — agregador da Fila de Hoje (#4)", () => {
  it("multi-tenant: companyId em leads, logs e OS", async () => {
    await getTodayQueue("co_1", null, NOW);
    expect((prisma.lead.findMany as any).mock.calls[0][0].where.companyId).toBe("co_1");
    expect((prisma.whatsappMessageLog.findMany as any).mock.calls[0][0].where.companyId).toBe("co_1");
    expect((prisma.serviceOrder.findMany as any).mock.calls[0][0].where.companyId).toBe("co_1");
  });

  it("só leads ABERTOS (isWon=false, isLost=false)", async () => {
    await getTodayQueue("co_1", null, NOW);
    expect((prisma.lead.findMany as any).mock.calls[0][0].where.stage).toEqual({ isWon: false, isLost: false });
  });

  it("lead com reclamação → item de ATENÇÃO (🔴, topo)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "L1", name: "João Silva", phone: "8599", intent: "RECLAMACAO", urgent: false, lastActivityAt: hoursAgo(1), customer: null },
    ]);
    const { queue } = await getTodayQueue("co_1", null, NOW);
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("attention");
    expect(queue[0].severity).toBe("red");
    expect(queue[0].headline).toContain("João");
  });

  it("lead precisa responder → relógio vem do needs-reply (waitingSince)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "L1", name: "Maria", phone: "8599", intent: "NOVA_COMPRA", urgent: false, lastActivityAt: hoursAgo(1), customer: null },
    ]);
    (computeNeedsReplyLeadIds as any).mockResolvedValue(new Map([["L1", hoursAgo(48)]]));
    const { queue } = await getTodayQueue("co_1", null, NOW);
    expect(queue[0].kind).toBe("needs_reply");
    expect(queue[0].subtext).toContain("há 2 dias");
    expect(queue[0].severity).toBe("yellow"); // 2 dias
  });

  it("um lead entra UMA vez pelo sinal de maior urgência (atenção > responder)", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "L1", name: "Ana", phone: "8599", intent: "RECLAMACAO", urgent: false, lastActivityAt: hoursAgo(1), customer: null },
    ]);
    // Mesmo lead também precisa responder — não deve duplicar.
    (computeNeedsReplyLeadIds as any).mockResolvedValue(new Map([["L1", hoursAgo(10)]]));
    const { queue } = await getTodayQueue("co_1", null, NOW);
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("attention");
  });

  it("lead parado >= SLA_LATE_HOURS sem responder → ATRASADO", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "L1", name: "Ze", phone: "8599", intent: "NOVA_COMPRA", urgent: false, lastActivityAt: hoursAgo(72), customer: null },
    ]);
    const { queue } = await getTodayQueue("co_1", null, NOW);
    expect(queue[0].kind).toBe("sla_late");
  });

  it("lead recente sem sinal → NÃO entra na fila", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "L1", name: "Ze", phone: "8599", intent: "NOVA_COMPRA", urgent: false, lastActivityAt: hoursAgo(2), customer: null },
    ]);
    const { queue } = await getTodayQueue("co_1", null, NOW);
    expect(queue).toHaveLength(0);
  });

  it("OS pronta parada → item os_ready com nome/telefone do cliente da OS", async () => {
    (prisma.serviceOrder.findMany as any).mockResolvedValue([
      { id: "OS1", readyAt: hoursAgo(24 * 6), customer: { name: "Carlos Souza", phone: "8598" } },
    ]);
    const { queue } = await getTodayQueue("co_1", null, NOW);
    expect(queue[0].kind).toBe("os_ready");
    expect(queue[0].severity).toBe("red"); // 6 dias
    expect(queue[0].phone).toBe("8598");
    expect(queue[0].subtext).toContain("há 6 dias");
  });

  it("exclui OS já avisadas (notIn dos logs OS_READY)", async () => {
    (prisma.whatsappMessageLog.findMany as any).mockResolvedValue([{ referenceId: "OS_AVISADA" }]);
    await getTodayQueue("co_1", null, NOW);
    const osWhere = (prisma.serviceOrder.findMany as any).mock.calls[0][0].where;
    expect(osWhere.id).toEqual({ notIn: ["OS_AVISADA"] });
  });

  it("prefere nome/telefone do CLIENTE vinculado sobre os do lead", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "L1", name: "Contato Whats", phone: "0000", intent: "RECLAMACAO", urgent: false, lastActivityAt: hoursAgo(1), customer: { name: "Nome Real", phone: "9999" } },
    ]);
    const { queue } = await getTodayQueue("co_1", null, NOW);
    expect(queue[0].customerName).toBe("Nome Real");
    expect(queue[0].phone).toBe("9999");
  });

  it("ordem final: atenção → responder → OS → atrasado", async () => {
    (prisma.lead.findMany as any).mockResolvedValue([
      { id: "atras", name: "Atrasado", phone: "1", intent: "NOVA_COMPRA", urgent: false, lastActivityAt: hoursAgo(72), customer: null },
      { id: "resp", name: "Responder", phone: "2", intent: "NOVA_COMPRA", urgent: false, lastActivityAt: hoursAgo(1), customer: null },
      { id: "aten", name: "Atencao", phone: "3", intent: "COBRANCA_FINANCEIRO", urgent: false, lastActivityAt: hoursAgo(1), customer: null },
    ]);
    (computeNeedsReplyLeadIds as any).mockResolvedValue(new Map([["resp", hoursAgo(5)]]));
    (prisma.serviceOrder.findMany as any).mockResolvedValue([
      { id: "OS1", readyAt: hoursAgo(24), customer: { name: "OsCliente", phone: "4" } },
    ]);
    const { queue, total } = await getTodayQueue("co_1", null, NOW);
    expect(total).toBe(4);
    expect(queue.map((q) => q.kind)).toEqual(["attention", "needs_reply", "os_ready", "sla_late"]);
  });
});
