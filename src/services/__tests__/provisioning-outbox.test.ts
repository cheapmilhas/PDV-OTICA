import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do cliente HTTP (não faz rede) e do logger.
vi.mock("@/lib/vis-provision-client", () => ({ postProvision: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { runProvisioningOnce } from "../provisioning-outbox.service";
import { postProvision } from "@/lib/vis-provision-client";

const COMPANY = "cmp-1";
const payload = { clinicId: "c1", admin: { email: "a@b.c" } };

/** Fake mínimo do PrismaClient para o service. */
function makeDb(row: { attempts: number } | null) {
  const state = { companyState: "PROVISIONING" as string, deleted: false, updated: {} as Record<string, unknown> };
  const outboxRow = row ? { companyId: COMPANY, payload, attempts: row.attempts, failureReason: null } : null;
  const db = {
    state,
    provisioningOutbox: {
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
});
