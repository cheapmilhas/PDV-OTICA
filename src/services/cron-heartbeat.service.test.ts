import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { cronHeartbeat: { upsert: vi.fn(), findMany: vi.fn() } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { prisma } from "@/lib/prisma";
import { classifyCron, getCronHealth, beginCronRun, finishCronRun } from "./cron-heartbeat.service";

const upsert = prisma.cronHeartbeat.upsert as unknown as ReturnType<typeof vi.fn>;
const findMany = prisma.cronHeartbeat.findMany as unknown as ReturnType<typeof vi.fn>;

const DAY = 24 * 60 * 60_000;
const NOW = new Date("2026-07-07T12:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("classifyCron", () => {
  it("sem sucesso registrado → unknown (nunca configurado, NÃO crítico)", () => {
    expect(classifyCron(null, DAY, NOW).state).toBe("unknown");
  });
  it("dentro de 2× a cadência → healthy", () => {
    expect(classifyCron(new Date(NOW.getTime() - DAY), DAY, NOW).state).toBe("healthy");
  });
  it("entre 2× e 4× → warning", () => {
    expect(classifyCron(new Date(NOW.getTime() - 3 * DAY), DAY, NOW).state).toBe("warning");
  });
  it("além de 4× → critical", () => {
    expect(classifyCron(new Date(NOW.getTime() - 5 * DAY), DAY, NOW).state).toBe("critical");
  });
});

describe("getCronHealth", () => {
  it("cron do mapa SEM heartbeat aparece como unknown (nunca rodou)", async () => {
    findMany.mockResolvedValue([]);
    const rows = await getCronHealth(NOW);
    const dunning = rows.find((r) => r.jobKey === "dunning")!;
    expect(dunning.state).toBe("unknown");
    expect(dunning.lastSucceededAt).toBeNull();
  });

  it("ordena pior primeiro (critical antes de healthy)", async () => {
    findMany.mockResolvedValue([
      { jobKey: "dunning", lastStartedAt: NOW, lastSucceededAt: new Date(NOW.getTime() - DAY), lastStatus: "ok", lastError: null, lastDurationMs: 10 },
      { jobKey: "recalc-health", lastStartedAt: NOW, lastSucceededAt: new Date(NOW.getTime() - 10 * DAY), lastStatus: "ok", lastError: null, lastDurationMs: 10 },
    ]);
    const rows = await getCronHealth(NOW);
    // recalc-health está muito atrasado → critical → deve vir antes do healthy dunning
    const idxCrit = rows.findIndex((r) => r.jobKey === "recalc-health");
    const idxHealthy = rows.findIndex((r) => r.jobKey === "dunning");
    expect(idxCrit).toBeLessThan(idxHealthy);
    expect(rows[idxCrit].state).toBe("critical");
    expect(rows[idxHealthy].state).toBe("healthy");
  });

  it("whatsapp-qualify usa cadência de 5min (não diária) e, por ser EXTERNO, satura em warning (não critical)", async () => {
    // 30min sem sucesso: p/ cadência diária seria healthy; p/ 5min está >4× o esperado.
    // Mas whatsapp-qualify é acionado por gatilho externo (cron-job.org) → teto em
    // "warning" (reative o gatilho), nunca "critical" (o negócio não parou).
    findMany.mockResolvedValue([
      { jobKey: "whatsapp-qualify", lastStartedAt: NOW, lastSucceededAt: new Date(NOW.getTime() - 30 * 60_000), lastStatus: "ok", lastError: null, lastDurationMs: 5 },
    ]);
    const rows = await getCronHealth(NOW);
    const row = rows.find((r) => r.jobKey === "whatsapp-qualify")!;
    expect(row.state).toBe("warning"); // 5min cadence aplicada (não healthy) + teto externo
    expect(row.external).toBe(true);
  });

  it("cron INTERNO (Vercel) atrasado >4× vira critical — só os externos saturam em warning", async () => {
    // dunning é diário e interno; 5 dias sem sucesso (>4×) → critical de fato.
    findMany.mockResolvedValue([
      { jobKey: "dunning", lastStartedAt: NOW, lastSucceededAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60_000), lastStatus: "ok", lastError: null, lastDurationMs: 5 },
    ]);
    const rows = await getCronHealth(NOW);
    const row = rows.find((r) => r.jobKey === "dunning")!;
    expect(row.state).toBe("critical");
    expect(row.external).toBe(false);
  });
});

describe("begin/finishCronRun (best-effort)", () => {
  it("beginCronRun grava lastStartedAt", async () => {
    upsert.mockResolvedValue({});
    await beginCronRun("dunning");
    expect(upsert.mock.calls[0][0].where).toEqual({ jobKey: "dunning" });
    expect(upsert.mock.calls[0][0].update.lastStartedAt).toBeInstanceOf(Date);
  });
  it("finishCronRun(ok=false) grava status error + mensagem", async () => {
    upsert.mockResolvedValue({});
    await finishCronRun("dunning", false, { error: "boom", durationMs: 5 });
    const u = upsert.mock.calls[0][0].update;
    expect(u.lastStatus).toBe("error");
    expect(u.lastError).toBe("boom");
  });
  it("NUNCA lança mesmo se o banco falhar (fail-safe)", async () => {
    upsert.mockRejectedValue(new Error("db down"));
    await expect(beginCronRun("x")).resolves.toBeUndefined();
    await expect(finishCronRun("x", true)).resolves.toBeUndefined();
  });
});
