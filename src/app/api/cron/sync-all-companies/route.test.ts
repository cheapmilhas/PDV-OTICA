import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const syncAllCompanies = vi.fn();
vi.mock("@/services/company-resync.service", () => ({
  syncAllCompanies: (...a: unknown[]) => syncAllCompanies(...a),
}));

vi.mock("@/lib/logger", () => ({
  // warn incluso: o withHeartbeat (batimento best-effort) chama log.warn quando a
  // gravação do heartbeat falha (ex.: DB fora no CI). Sem warn no mock, esse warn
  // estourava dentro do catch → 500 no teste "200 autorizado".
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { GET } from "./route";

function req(auth?: string) {
  return new Request("http://x/api/cron/sync-all-companies", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("GET /api/cron/sync-all-companies", () => {
  const ORIGINAL = process.env.CRON_SECRET;
  beforeEach(() => {
    syncAllCompanies.mockReset().mockResolvedValue({ skipped: false, total: 2, changed: 1, unchanged: 1, errors: 0, dryRun: true });
    process.env.CRON_SECRET = "s3cret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL;
  });

  it("401 sem Bearer correto", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer errado"))).status).toBe(401);
    expect(syncAllCompanies).not.toHaveBeenCalled();
  });

  it("401 fail-closed quando CRON_SECRET não está configurado", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer s3cret"))).status).toBe(401);
  });

  it("200 com o resumo quando autorizado", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, total: 2, changed: 1 });
  });

  it("500 quando o orquestrador lança", async () => {
    syncAllCompanies.mockRejectedValue(new Error("boom"));
    expect((await GET(req("Bearer s3cret"))).status).toBe(500);
  });
});
