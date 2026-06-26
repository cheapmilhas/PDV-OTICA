import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Comissão Fase 2 — serviço de configuração de metas por níveis.
 *
 * Prova o fluxo de salvar/ler em SellerCommissionTier (mock do Prisma):
 *  - salvar metas PADRÃO da loja (userId null) e ler de volta;
 *  - salvar OVERRIDE de um vendedor (userId set) sem afetar o padrão;
 *  - re-salvar atualiza (não duplica) os 3 níveis;
 *  - listar overrides configurados;
 *  - remover override.
 * Mais a validação zod (monotonicidade mini ≤ meta ≤ mega).
 */

// Estado do mock declarado via vi.hoisted — disponível ao factory (hoisted) e aos testes.
const mock = vi.hoisted(() => {
  const state = { store: [] as any[], idSeq: 1 };
  const tierClient = {
    findMany: vi.fn(async ({ where, distinct }: any) => {
      let rows = state.store.filter((r) => r.companyId === where.companyId);
      if (where.userId !== undefined) {
        if (where.userId === null) rows = rows.filter((r) => r.userId === null);
        else if (where.userId?.not === null) rows = rows.filter((r) => r.userId !== null);
        else rows = rows.filter((r) => r.userId === where.userId);
      }
      if (distinct?.includes("userId")) {
        const seen = new Set<string | null>();
        rows = rows.filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)));
      }
      return rows.map((r) => ({ ...r, targetAmount: { toString: () => r.targetAmount }, percent: { toString: () => r.percent } }));
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      const r = state.store.find(
        (x) => x.companyId === where.companyId && x.userId === (where.userId ?? null) && x.level === where.level
      );
      return r ? { id: r.id } : null;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const r = state.store.find((x) => x.id === where.id);
      r.targetAmount = data.targetAmount;
      r.percent = data.percent;
      return r;
    }),
    create: vi.fn(async ({ data }: any) => {
      const r = { id: `t${state.idSeq++}`, ...data };
      state.store.push(r);
      return r;
    }),
    deleteMany: vi.fn(async ({ where }: any) => {
      const before = state.store.length;
      state.store = state.store.filter((r) => !(r.companyId === where.companyId && r.userId === where.userId));
      return { count: before - state.store.length };
    }),
  };
  return { state, tierClient };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sellerCommissionTier: mock.tierClient,
    // $transaction(fn) chama fn com um "tx" que reusa o mesmo client.
    $transaction: (fn: any) => fn({ sellerCommissionTier: mock.tierClient }),
  },
}));

import {
  getCommissionTiers,
  saveCommissionTiers,
  listConfiguredOverrides,
  deleteCommissionTiers,
} from "@/services/commission-tier.service";
import { commissionTiersSchema } from "@/lib/validations/commission-tier.schema";

const PRD = {
  mini: { targetAmount: 10000, percent: 1 },
  meta: { targetAmount: 20000, percent: 2 },
  mega: { targetAmount: 30000, percent: 3 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.state.store = [];
  mock.state.idSeq = 1;
});

describe("commission-tier.service — padrão da loja (userId null)", () => {
  it("salva os 3 níveis da loja e lê de volta com 2 casas", async () => {
    await saveCommissionTiers("co1", { userId: null, ...PRD });
    const t = await getCommissionTiers("co1", null);

    expect(t.userId).toBeNull();
    expect(t.mini).toEqual({ targetAmount: "10000.00", percent: "1.00" });
    expect(t.meta).toEqual({ targetAmount: "20000.00", percent: "2.00" });
    expect(t.mega).toEqual({ targetAmount: "30000.00", percent: "3.00" });
    // exatamente 3 linhas (1 por nível), sem duplicar
    expect(mock.state.store.filter((r:any) => r.userId === null)).toHaveLength(3);
  });

  it("re-salvar ATUALIZA (não duplica) os níveis", async () => {
    await saveCommissionTiers("co1", { userId: null, ...PRD });
    await saveCommissionTiers("co1", {
      userId: null,
      mini: { targetAmount: 12000, percent: 1.5 },
      meta: { targetAmount: 22000, percent: 2.5 },
      mega: { targetAmount: 33000, percent: 3.5 },
    });
    const t = await getCommissionTiers("co1", null);
    expect(t.mini).toEqual({ targetAmount: "12000.00", percent: "1.50" });
    expect(mock.state.store.filter((r:any) => r.userId === null)).toHaveLength(3); // ainda 3
  });

  it("loja sem config → níveis null", async () => {
    const t = await getCommissionTiers("co1", null);
    expect(t.mini).toBeNull();
    expect(t.meta).toBeNull();
    expect(t.mega).toBeNull();
  });
});

describe("commission-tier.service — override por vendedor", () => {
  it("salva override do vendedor SEM afetar o padrão da loja", async () => {
    await saveCommissionTiers("co1", { userId: null, ...PRD });
    await saveCommissionTiers("co1", {
      userId: "U1",
      mini: { targetAmount: 15000, percent: 2 },
      meta: { targetAmount: 25000, percent: 3 },
      mega: { targetAmount: 40000, percent: 5 },
    });

    const loja = await getCommissionTiers("co1", null);
    const u1 = await getCommissionTiers("co1", "U1");

    expect(loja.mini).toEqual({ targetAmount: "10000.00", percent: "1.00" }); // intacto
    expect(u1.userId).toBe("U1");
    expect(u1.mega).toEqual({ targetAmount: "40000.00", percent: "5.00" });
  });

  it("lista os vendedores com override configurado", async () => {
    await saveCommissionTiers("co1", { userId: "U1", ...PRD });
    await saveCommissionTiers("co1", { userId: "U2", ...PRD });
    const overrides = await listConfiguredOverrides("co1");
    expect(overrides.sort()).toEqual(["U1", "U2"]);
  });

  it("remover override apaga as metas do vendedor (volta ao padrão)", async () => {
    await saveCommissionTiers("co1", { userId: "U1", ...PRD });
    await deleteCommissionTiers("co1", "U1");
    const u1 = await getCommissionTiers("co1", "U1");
    expect(u1.mini).toBeNull();
    expect(mock.state.store.filter((r:any) => r.userId === "U1")).toHaveLength(0);
  });
});

describe("commissionTiersSchema — validação", () => {
  it("aceita níveis monotônicos (mini ≤ meta ≤ mega)", () => {
    const r = commissionTiersSchema.safeParse({ userId: null, ...PRD });
    expect(r.success).toBe(true);
  });

  it("rejeita valor-alvo fora de ordem (meta < mini)", () => {
    const r = commissionTiersSchema.safeParse({
      userId: null,
      mini: { targetAmount: 20000, percent: 1 },
      meta: { targetAmount: 10000, percent: 2 },
      mega: { targetAmount: 30000, percent: 3 },
    });
    expect(r.success).toBe(false);
  });

  it("rejeita % fora de ordem (mega < meta)", () => {
    const r = commissionTiersSchema.safeParse({
      userId: null,
      mini: { targetAmount: 10000, percent: 1 },
      meta: { targetAmount: 20000, percent: 5 },
      mega: { targetAmount: 30000, percent: 3 },
    });
    expect(r.success).toBe(false);
  });

  it("rejeita valores negativos e % acima de 100", () => {
    expect(commissionTiersSchema.safeParse({ userId: null, ...PRD, mini: { targetAmount: -1, percent: 1 } }).success).toBe(false);
    expect(commissionTiersSchema.safeParse({ userId: null, ...PRD, mega: { targetAmount: 30000, percent: 150 } }).success).toBe(false);
  });
});
