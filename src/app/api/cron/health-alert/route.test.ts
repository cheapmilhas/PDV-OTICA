import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("@/lib/cron-instrument", () => ({ withHeartbeat: (_k: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/services/system-health.service", () => ({ getSystemHealthSnapshot: vi.fn() }));
vi.mock("@/services/system-event.service", () => ({ ensureAutoEvent: vi.fn(), resolveEvent: vi.fn(), listEvents: vi.fn() }));
vi.mock("@/services/system-alert.service", () => ({ maybeSendAlert: vi.fn() }));

import { GET } from "./route";
import { getSystemHealthSnapshot } from "@/services/system-health.service";
import { ensureAutoEvent, resolveEvent, listEvents } from "@/services/system-event.service";
import { maybeSendAlert } from "@/services/system-alert.service";

const snapshot = getSystemHealthSnapshot as unknown as ReturnType<typeof vi.fn>;
const ensureAuto = ensureAutoEvent as unknown as ReturnType<typeof vi.fn>;
const resolve = resolveEvent as unknown as ReturnType<typeof vi.fn>;
const list = listEvents as unknown as ReturnType<typeof vi.fn>;
const sendAlert = maybeSendAlert as unknown as ReturnType<typeof vi.fn>;

function req(auth?: string) {
  return new Request("https://x/api/cron/health-alert", { headers: auth ? { authorization: auth } : {} });
}

const sig = (key: string, label: string, state: string, detail = "d") => ({ key, label, state, detail });

function snap(overall: string, signals: Record<string, ReturnType<typeof sig>>) {
  return { overall, capturedAt: "2026-07-07T00:00:00Z", signals, cronRows: [], integrationRows: [], events: { open: [], resolved: [], openCount: 0 }, notMonitored: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  list.mockResolvedValue({ open: [], resolved: [], openCount: 0 });
  ensureAuto.mockResolvedValue({ id: "e1" });
  resolve.mockResolvedValue({ id: "e1" });
  sendAlert.mockResolvedValue({ sent: false, reason: "no_open_unalerted", alertedEventIds: [] });
});

describe("GET /api/cron/health-alert", () => {
  it("401 sem secret correto", async () => {
    const res = await GET(req("Bearer errado"));
    expect(res.status).toBe(401);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it("401 fail-closed se CRON_SECRET ausente", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer s3cr3t"));
    expect(res.status).toBe(401);
  });

  it("tudo saudável → nenhum evento criado, sem alerta", async () => {
    snapshot.mockResolvedValue(
      snap("healthy", {
        database: sig("database", "Banco", "healthy"),
        vercel: sig("vercel", "Vercel", "unknown"),
        sentry: sig("sentry", "Sentry", "unknown"),
        crons: sig("crons", "Crons", "healthy"),
        integrations: sig("integrations", "Integrações", "healthy"),
      })
    );
    const res = await GET(req("Bearer s3cr3t"));
    const b = await res.json();
    expect(res.status).toBe(200);
    expect(ensureAuto).not.toHaveBeenCalled(); // unknown/healthy NÃO viram incidente
    expect(b.created).toBe(0);
  });

  it("sinal crítico → cria incidente auto (dedupeKey por source) e chama alerta", async () => {
    snapshot.mockResolvedValue(
      snap("critical", {
        database: sig("database", "Banco", "critical", "caiu"),
        vercel: sig("vercel", "Vercel", "unknown"),
        sentry: sig("sentry", "Sentry", "unknown"),
        crons: sig("crons", "Crons", "healthy"),
        integrations: sig("integrations", "Integrações", "healthy"),
      })
    );
    const res = await GET(req("Bearer s3cr3t"));
    const b = await res.json();
    expect(res.status).toBe(200);
    expect(ensureAuto).toHaveBeenCalledTimes(1);
    expect(ensureAuto.mock.calls[0][0]).toBe("database:auto");
    expect(sendAlert).toHaveBeenCalledWith("crítico");
    expect(b.overall).toBe("critical");
  });

  it("sinal 'ai' crítico → cria incidente auto com source 'ai'", async () => {
    snapshot.mockResolvedValue(
      snap("critical", {
        database: sig("database", "Banco", "healthy"),
        vercel: sig("vercel", "Vercel", "unknown"),
        sentry: sig("sentry", "Sentry", "unknown"),
        crons: sig("crons", "Crons", "healthy"),
        integrations: sig("integrations", "Integrações", "healthy"),
        ai: sig("ai", "Inteligência do funil", "critical", "parou de qualificar"),
      })
    );
    const res = await GET(req("Bearer s3cr3t"));
    const b = await res.json();
    expect(res.status).toBe(200);
    expect(ensureAuto).toHaveBeenCalledTimes(1);
    expect(ensureAuto.mock.calls[0][0]).toBe("ai:auto");
    expect(ensureAuto.mock.calls[0][1]()).toMatchObject({ source: "ai", severity: "critical" });
    expect(sendAlert).toHaveBeenCalledWith("crítico");
    expect(b.overall).toBe("critical");
  });

  it("sinal que voltou ao verde resolve o incidente auto aberto", async () => {
    list.mockResolvedValue({
      open: [{ id: "old1", source: "cron", severity: "critical", title: "Cron morto", detail: null, status: "open", resolvedAt: null, resolvedBy: null, resolveNote: null, createdAt: "2026-07-07T00:00:00Z", dedupeKey: "cron:auto" }],
      resolved: [],
      openCount: 1,
    });
    snapshot.mockResolvedValue(
      snap("healthy", {
        database: sig("database", "Banco", "healthy"),
        vercel: sig("vercel", "Vercel", "unknown"),
        sentry: sig("sentry", "Sentry", "unknown"),
        crons: sig("crons", "Crons", "healthy"), // cron voltou ao verde
        integrations: sig("integrations", "Integrações", "healthy"),
      })
    );
    const res = await GET(req("Bearer s3cr3t"));
    const b = await res.json();
    expect(resolve).toHaveBeenCalledWith("old1", "auto", expect.any(String));
    expect(b.resolved).toBe(1);
  });

  it("evento manual aberto NÃO é auto-resolvido", async () => {
    list.mockResolvedValue({
      open: [{ id: "m1", source: "manual", severity: "warning", title: "anotação do dono", detail: null, status: "open", resolvedAt: null, resolvedBy: null, resolveNote: null, createdAt: "2026-07-07T00:00:00Z" }],
      resolved: [],
      openCount: 1,
    });
    snapshot.mockResolvedValue(
      snap("healthy", {
        database: sig("database", "Banco", "healthy"),
        vercel: sig("vercel", "Vercel", "unknown"),
        sentry: sig("sentry", "Sentry", "unknown"),
        crons: sig("crons", "Crons", "healthy"),
        integrations: sig("integrations", "Integrações", "healthy"),
      })
    );
    await GET(req("Bearer s3cr3t"));
    expect(resolve).not.toHaveBeenCalled();
  });

  it("evento billing (plan-change) NÃO é auto-resolvido pelo health cron (fix Fase D)", async () => {
    // Achado Codex: o cron reconstruía `${source}:auto` e auto-resolveria o alerta
    // de "cobrado sem plano" quando os sinais voltassem ao verde. Agora só toca
    // eventos com dedupeKey terminado em ":auto" → o billing sobrevive até o e-mail.
    list.mockResolvedValue({
      open: [{ id: "b1", source: "billing", severity: "critical", title: "Cobrado sem plano", detail: null, status: "open", resolvedAt: null, resolvedBy: null, resolveNote: null, createdAt: "2026-07-07T00:00:00Z", dedupeKey: "plan-change:op1:charged-unapplied" }],
      resolved: [],
      openCount: 1,
    });
    snapshot.mockResolvedValue(
      snap("healthy", {
        database: sig("database", "Banco", "healthy"),
        vercel: sig("vercel", "Vercel", "unknown"),
        sentry: sig("sentry", "Sentry", "unknown"),
        crons: sig("crons", "Crons", "healthy"),
        integrations: sig("integrations", "Integrações", "healthy"),
      })
    );
    await GET(req("Bearer s3cr3t"));
    expect(resolve).not.toHaveBeenCalled(); // billing sobrevive
  });
});
