import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) } }));
vi.mock("@/lib/cron-instrument", () => ({ withHeartbeat: (_k: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/domus-plan-change/retry-worker", () => ({ runRetryBatch: vi.fn() }));

import { GET } from "./route";
import { runRetryBatch } from "@/lib/domus-plan-change/retry-worker";

const batch = runRetryBatch as unknown as ReturnType<typeof vi.fn>;

function req(auth?: string) {
  return new Request("https://x/api/cron/plan-change-retry", { headers: auth ? { authorization: auth } : {} });
}

const ZERO = { scanned: 0, claimed: 0, completed: 0, terminal: 0, retried: 0, lostLease: 0, errored: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  batch.mockResolvedValue(ZERO);
});

describe("GET /api/cron/plan-change-retry", () => {
  it("401 sem header de auth", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(batch).not.toHaveBeenCalled(); // não processa nada sem auth
  });

  it("401 com Bearer errado", async () => {
    const res = await GET(req("Bearer errado"));
    expect(res.status).toBe(401);
    expect(batch).not.toHaveBeenCalled();
  });

  it("401 fail-CLOSED quando CRON_SECRET não está configurado", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer qualquer"));
    expect(res.status).toBe(401);
    expect(batch).not.toHaveBeenCalled();
  });

  it("200 com Bearer correto → roda o batch e ecoa as métricas", async () => {
    batch.mockResolvedValue({ ...ZERO, scanned: 3, claimed: 2, completed: 1, retried: 1 });
    const res = await GET(req("Bearer s3cr3t"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, scanned: 3, completed: 1, retried: 1 });
  });

  it("500 se o batch lançar (erro geral), mas nunca vaza detalhe", async () => {
    batch.mockRejectedValue(new Error("boom interno"));
    const res = await GET(req("Bearer s3cr3t"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("boom interno"); // erro sanitizado
  });
});
