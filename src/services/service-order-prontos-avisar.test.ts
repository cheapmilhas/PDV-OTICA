import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fila "Prontos pra avisar" (OS pronta parada): o filtro status=prontos_avisar
 * deve pegar só OS READY não entregues, com snooze expirado/ausente, e EXCLUIR
 * as que já foram avisadas (WhatsappMessageLog type=OS_READY PENDING/SENT).
 */

const soFindMany = vi.fn();
const soCount = vi.fn();
const logFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    serviceOrder: {
      findMany: (...a: unknown[]) => soFindMany(...a),
      count: (...a: unknown[]) => soCount(...a),
    },
    whatsappMessageLog: {
      findMany: (...a: unknown[]) => logFindMany(...a),
    },
  },
}));

import { serviceOrderService } from "./service-order.service";

beforeEach(() => {
  vi.clearAllMocks();
  soFindMany.mockResolvedValue([]);
  soCount.mockResolvedValue(0);
  logFindMany.mockResolvedValue([]);
});

describe("list status=prontos_avisar", () => {
  it("filtra READY, não entregue, snooze expirado/ausente, ordena por readyAt asc", async () => {
    await serviceOrderService.list({ status: "prontos_avisar", page: 1, pageSize: 20 } as any, "co_1");
    const args = soFindMany.mock.calls[0][0];
    expect(args.where.status).toBe("READY");
    expect(args.where.deliveredAt).toBeNull();
    expect(args.where.readyAt).toEqual({ not: null }); // sem data não entra na fila
    // snooze: OR de null OU já passou
    expect(args.where.OR).toEqual([
      { notifySnoozedUntil: null },
      { notifySnoozedUntil: { lt: expect.any(Date) } },
    ]);
    expect(args.orderBy).toEqual({ readyAt: "asc" });
  });

  it("EXCLUI OS já avisadas (log OS_READY PENDING/SENT) via id notIn", async () => {
    logFindMany.mockResolvedValue([{ referenceId: "os_avisada_1" }, { referenceId: "os_avisada_2" }]);
    await serviceOrderService.list({ status: "prontos_avisar", page: 1, pageSize: 20 } as any, "co_1");
    // a subquery de logs busca só PENDING/SENT do tipo OS_READY
    const logWhere = logFindMany.mock.calls[0][0].where;
    expect(logWhere.type).toBe("OS_READY");
    expect(logWhere.status).toEqual({ in: ["PENDING", "SENT"] });
    // e o where da OS exclui esses ids
    const args = soFindMany.mock.calls[0][0];
    expect(args.where.id).toEqual({ notIn: ["os_avisada_1", "os_avisada_2"] });
  });

  it("sem avisados, NÃO adiciona filtro de id (pega todas as prontas)", async () => {
    logFindMany.mockResolvedValue([]);
    await serviceOrderService.list({ status: "prontos_avisar", page: 1, pageSize: 20 } as any, "co_1");
    const args = soFindMany.mock.calls[0][0];
    expect(args.where.id).toBeUndefined();
  });

  it("multi-tenant: companyId sempre no where", async () => {
    await serviceOrderService.list({ status: "prontos_avisar", page: 1, pageSize: 20 } as any, "co_9");
    expect(soFindMany.mock.calls[0][0].where.companyId).toBe("co_9");
  });
});
