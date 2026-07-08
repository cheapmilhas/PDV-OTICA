import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock("@/services/cron-heartbeat.service", () => ({ getCronHealth: vi.fn() }));
vi.mock("@/services/integrations-status.service", () => ({ getIntegrationsStatus: vi.fn() }));
vi.mock("@/services/system-event.service", () => ({ listEvents: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getCronHealth } from "@/services/cron-heartbeat.service";
import { getIntegrationsStatus } from "@/services/integrations-status.service";
import { listEvents } from "@/services/system-event.service";
import { getSystemHealthSnapshot, worstState } from "./system-health.service";

const queryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const cronHealth = getCronHealth as unknown as ReturnType<typeof vi.fn>;
const integrations = getIntegrationsStatus as unknown as ReturnType<typeof vi.fn>;
const events = listEvents as unknown as ReturnType<typeof vi.fn>;

const allConfigured = [
  { key: "resend", label: "Resend", configured: true, source: "env", hint: "" },
];
const noEvents = { open: [], resolved: [], openCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VERCEL_TOKEN;
  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  cronHealth.mockResolvedValue([]);
  integrations.mockResolvedValue(allConfigured);
  events.mockResolvedValue(noEvents);
});

describe("worstState", () => {
  it("pega o pior estado", () => {
    expect(worstState(["healthy", "warning"])).toBe("warning");
    expect(worstState(["warning", "critical"])).toBe("critical");
    expect(worstState(["healthy"])).toBe("healthy");
  });

  it("unknown NÃO é pior que warning (mas é pior que healthy)", () => {
    expect(worstState(["healthy", "unknown"])).toBe("unknown");
    expect(worstState(["warning", "unknown"])).toBe("warning");
    expect(worstState(["unknown", "critical"])).toBe("critical");
  });

  it("lista vazia = healthy", () => {
    expect(worstState([])).toBe("healthy");
  });
});

describe("getSystemHealthSnapshot", () => {
  it("tudo ok + sem token/DSN → overall unknown (Vercel/Sentry cinza, não crítico)", async () => {
    const snap = await getSystemHealthSnapshot();
    expect(snap.signals.database.state).toBe("healthy");
    expect(snap.signals.vercel.state).toBe("unknown");
    expect(snap.signals.sentry.state).toBe("unknown");
    expect(snap.signals.crons.state).toBe("healthy");
    expect(snap.signals.integrations.state).toBe("healthy");
    // Pior sinal é unknown (Vercel/Sentry sem config) — não vira vermelho falso.
    expect(snap.overall).toBe("unknown");
  });

  it("db-ping falha → database critical E overall critical", async () => {
    queryRaw.mockRejectedValue(new Error("db down"));
    const snap = await getSystemHealthSnapshot();
    expect(snap.signals.database.state).toBe("critical");
    expect(snap.overall).toBe("critical");
  });

  it("cron crítico eleva overall a critical", async () => {
    cronHealth.mockResolvedValue([
      { jobKey: "dunning", label: "Cobrança de inadimplentes", does: "x", area: "cobrancas", external: false, state: "critical", expectedEveryMs: 1, lastStartedAt: null, lastSucceededAt: null, lastStatus: null, lastError: null, lastDurationMs: null, sinceLastSuccessMs: 999 },
    ]);
    const snap = await getSystemHealthSnapshot();
    expect(snap.signals.crons.state).toBe("critical");
    expect(snap.overall).toBe("critical");
  });

  it("businessAreas: cron crítico de cobrança deixa a área Cobranças crítica", async () => {
    cronHealth.mockResolvedValue([
      { jobKey: "dunning", label: "Cobrança de inadimplentes", does: "x", area: "cobrancas", external: false, state: "critical", expectedEveryMs: 1, lastStartedAt: null, lastSucceededAt: null, lastStatus: null, lastError: null, lastDurationMs: null, sinceLastSuccessMs: 999 },
    ]);
    const snap = await getSystemHealthSnapshot();
    const cobrancas = snap.businessAreas.find((a) => a.area === "cobrancas");
    expect(cobrancas?.state).toBe("critical");
    expect(cobrancas?.summary).toContain("Cobrança de inadimplentes");
    // sempre 4 áreas fixas
    expect(snap.businessAreas.map((a) => a.area)).toEqual(["cobrancas", "emails", "whatsapp", "sistema"]);
  });

  it("businessAreas: cron externo atrasado vira warning (não critical) e sugere reativar gatilho", async () => {
    cronHealth.mockResolvedValue([
      { jobKey: "whatsapp-qualify", label: "IA lê as conversas do WhatsApp", does: "x", area: "whatsapp", external: true, state: "warning", expectedEveryMs: 1, lastStartedAt: null, lastSucceededAt: "2026-07-07T00:00:00Z", lastStatus: "ok", lastError: null, lastDurationMs: 5, sinceLastSuccessMs: 999 },
    ]);
    const snap = await getSystemHealthSnapshot();
    expect(snap.signals.crons.state).toBe("warning");
    expect(snap.signals.crons.action).toContain("cron-job.org");
    const wpp = snap.businessAreas.find((a) => a.area === "whatsapp");
    expect(wpp?.state).toBe("warning");
  });

  it("crons só com 'unknown' (nunca rodou) NÃO é problema — mensagem tranquiliza", async () => {
    cronHealth.mockResolvedValue([
      { jobKey: "dunning", label: "Cobrança de inadimplentes", does: "x", area: "cobrancas", external: false, state: "unknown", expectedEveryMs: 1, lastStartedAt: null, lastSucceededAt: null, lastStatus: null, lastError: null, lastDurationMs: null, sinceLastSuccessMs: null },
    ]);
    const snap = await getSystemHealthSnapshot();
    expect(snap.signals.crons.state).toBe("unknown");
    expect(snap.signals.crons.detail).toMatch(/ainda sem registro|monitor foi ligado/i);
    expect(snap.signals.crons.action ?? null).toBeNull();
  });

  it("SENTRY_DSN presente → sentry healthy", async () => {
    process.env.SENTRY_DSN = "https://x@o0.ingest.sentry.io/1";
    const snap = await getSystemHealthSnapshot();
    expect(snap.signals.sentry.state).toBe("healthy");
  });

  it("integração faltando → integrations unknown (não erro)", async () => {
    integrations.mockResolvedValue([
      { key: "resend", label: "Resend", configured: false, source: "nenhum", hint: "" },
    ]);
    const snap = await getSystemHealthSnapshot();
    expect(snap.signals.integrations.state).toBe("unknown");
  });

  it("um serviço lançar não derruba o snapshot (cai em vazio/unknown)", async () => {
    cronHealth.mockRejectedValue(new Error("boom"));
    const snap = await getSystemHealthSnapshot();
    expect(snap.cronRows).toEqual([]);
    // crons vazio → healthy (nenhum atrasado); snapshot ainda monta.
    expect(snap.signals.crons.state).toBe("healthy");
  });

  it("evento aberto aparece no feed com contagem", async () => {
    events.mockResolvedValue({
      open: [{ id: "e1", source: "vercel", severity: "critical", title: "block", detail: null, status: "open", resolvedAt: null, resolvedBy: null, resolveNote: null, createdAt: "2026-07-07T00:00:00Z" }],
      resolved: [],
      openCount: 1,
    });
    const snap = await getSystemHealthSnapshot();
    expect(snap.events.openCount).toBe(1);
    expect(snap.events.open[0].title).toBe("block");
  });

  it("inclui a linha fixa do que NÃO monitora", async () => {
    const snap = await getSystemHealthSnapshot();
    expect(snap.notMonitored.length).toBeGreaterThan(0);
  });
});
