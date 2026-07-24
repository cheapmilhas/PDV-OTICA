import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do cliente HTTP (não faz rede) e do logger.
vi.mock("@/lib/vis-provision-client", () => ({ postProvision: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { runProvisioningOnce, drainProvisioningOutbox } from "../provisioning-outbox.service";
import { postProvision } from "@/lib/vis-provision-client";

const COMPANY = "cmp-1";
const payload = { clinicId: "c1", admin: { email: "a@b.c" } };

/** Fake mínimo do PrismaClient para o service. `claimCount` simula o resultado
 *  do claim atômico (1 = venceu e processa; 0 = outro tick tem o lease). */
function makeDb(row: { attempts: number } | null, claimCount = 1) {
  const state = { companyState: "PROVISIONING" as string, deleted: false, updated: {} as Record<string, unknown> };
  const outboxRow = row ? { companyId: COMPANY, payload, attempts: row.attempts, failureReason: null } : null;
  const db = {
    state,
    provisioningOutbox: {
      updateMany: vi.fn(async () => ({ count: claimCount })),
      findUnique: vi.fn(async () => outboxRow),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.updated = data; }),
      delete: vi.fn(async () => { state.deleted = true; }),
      findMany: vi.fn(async () => []),
    },
    company: {
      update: vi.fn(async ({ data }: { data: { provisioningState?: string } }) => {
        if (data.provisioningState) state.companyState = data.provisioningState;
      }),
    },
    $transaction: vi.fn(async (ops: unknown) => {
      // aceita array de promises (o service usa a forma de array)
      if (Array.isArray(ops)) return Promise.all(ops);
      return (ops as (tx: unknown) => unknown)(db);
    }),
  };
  return db as any;
}

describe("runProvisioningOnce", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applied → PROVISIONED e apaga o outbox", async () => {
    vi.mocked(postProvision).mockResolvedValue({ kind: "applied", appliedRevision: "1" });
    const db = makeDb({ attempts: 0 });
    const r = await runProvisioningOnce(COMPANY, db);
    expect(r).toBe("PROVISIONED");
    expect(db.state.companyState).toBe("PROVISIONED");
    expect(db.provisioningOutbox.delete).toHaveBeenCalled();
  });

  it("terminal → PROVISION_FAILED (não apaga, grava motivo)", async () => {
    vi.mocked(postProvision).mockResolvedValue({ kind: "terminal", error: "identity_conflict" });
    const db = makeDb({ attempts: 0 });
    const r = await runProvisioningOnce(COMPANY, db);
    expect(r).toBe("PROVISION_FAILED");
    expect(db.state.companyState).toBe("PROVISION_FAILED");
    expect(db.provisioningOutbox.delete).not.toHaveBeenCalled();
  });

  it("transitório com tentativas restantes → reenfileira (PROVISIONING)", async () => {
    vi.mocked(postProvision).mockResolvedValue({ kind: "transient", reason: "http 503" });
    const db = makeDb({ attempts: 2 });
    const r = await runProvisioningOnce(COMPANY, db);
    expect(r).toBe("PROVISIONING");
    expect(db.provisioningOutbox.update).toHaveBeenCalled();
    expect(db.state.updated.attempts).toBe(3);
  });

  it("transitório na última tentativa → PROVISION_FAILED (esgotou)", async () => {
    vi.mocked(postProvision).mockResolvedValue({ kind: "transient", reason: "http 503" });
    const db = makeDb({ attempts: 9 }); // 9+1 = 10 = MAX_ATTEMPTS
    const r = await runProvisioningOnce(COMPANY, db);
    expect(r).toBe("PROVISION_FAILED");
    expect(db.state.companyState).toBe("PROVISION_FAILED");
  });

  it("outbox já drenado (row null) → PROVISIONED sem chamar o Domus", async () => {
    const db = makeDb(null);
    const r = await runProvisioningOnce(COMPANY, db);
    expect(r).toBe("PROVISIONED");
    expect(postProvision).not.toHaveBeenCalled();
  });

  it("P0#2: claim perdido (outro tick tem o lease) → PROVISIONING sem POSTar nem ler a linha", async () => {
    const db = makeDb({ attempts: 0 }, 0); // updateMany afeta 0 linhas
    const r = await runProvisioningOnce(COMPANY, db);
    expect(r).toBe("PROVISIONING");
    // não avança: não relê a linha, não chama o Domus, não duplica trabalho/e-mail
    expect(db.provisioningOutbox.findUnique).not.toHaveBeenCalled();
    expect(postProvision).not.toHaveBeenCalled();
  });

  it("P0#2: claim vencido (count=1) → prossegue e POSTa normalmente", async () => {
    vi.mocked(postProvision).mockResolvedValue({ kind: "applied", appliedRevision: "1" });
    const db = makeDb({ attempts: 0 }, 1);
    const r = await runProvisioningOnce(COMPANY, db);
    expect(r).toBe("PROVISIONED");
    expect(db.provisioningOutbox.updateMany).toHaveBeenCalled(); // reivindicou
    expect(postProvision).toHaveBeenCalled();
  });
});

describe("drainProvisioningOutbox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("P0#2: só drena linhas vencidas E não-terminais (failureReason null)", async () => {
    let capturedWhere: Record<string, unknown> = {};
    const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
      capturedWhere = args.where;
      return [] as Array<{ companyId: string }>;
    });
    const db = { provisioningOutbox: { findMany } } as any;
    await drainProvisioningOutbox(db);
    // exclui terminais (PROVISION_FAILED): nunca re-POSTa um conflito 409
    expect(capturedWhere.failureReason).toBeNull();
    // só linhas vencidas
    expect(capturedWhere.nextAttemptAt).toHaveProperty("lte");
  });
});
