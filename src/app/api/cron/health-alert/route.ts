import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withHeartbeat } from "@/lib/cron-instrument";
import { getSystemHealthSnapshot, type HealthState } from "@/services/system-health.service";
import { ensureAutoEvent, resolveEvent, listEvents } from "@/services/system-event.service";
import { maybeSendAlert } from "@/services/system-alert.service";

const log = logger.child({ route: "cron/health-alert" });

/**
 * GET /api/cron/health-alert
 *
 * Fecha o laço da Saúde do Sistema: transforma SINAIS ruins ao vivo em
 * INCIDENTES (idempotentes por dedupeKey) e dispara o e-mail de alerta. É a
 * peça nº1 da feature — o dono é avisado no celular sem precisar abrir a tela.
 *
 * Rodar frequente (a cada 15 min) via cron-job.org OU de hora em hora no Vercel.
 * Fail-CLOSED no CRON_SECRET (padrão dos demais crons). Auto-instrumentado com
 * withHeartbeat.
 *
 * Ciclo:
 *  1. monta o snapshot (mesmo do painel).
 *  2. cada sinal em `critical`/`warning` vira um SystemEvent aberto (ensureAutoEvent
 *     é idempotente por dedupeKey → um incidente por condição, não um por passada).
 *  3. sinais que VOLTARAM ao verde e tinham incidente aberto são resolvidos (auto).
 *  4. maybeSendAlert e-maila os incidentes abertos ainda não alertados.
 */

const SEVERITY_BY_STATE: Record<HealthState, "critical" | "warning" | null> = {
  critical: "critical",
  warning: "warning",
  unknown: null, // "não sei" NÃO vira incidente nem alerta (sem dado falso).
  healthy: null,
};

const SOURCE_BY_SIGNAL: Record<string, "vercel" | "database" | "cron" | "integration" | "sentry" | "ai"> = {
  database: "database",
  vercel: "vercel",
  crons: "cron",
  integrations: "integration",
  sentry: "sentry",
  ai: "ai",
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    if (!cronSecret) {
      log.error("CRON_SECRET não configurado — health-alert recusado (fail-closed)");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await withHeartbeat("health-alert", async () => {
      const snapshot = await getSystemHealthSnapshot();
      const signals = Object.values(snapshot.signals);

      // 2 + 3: reconcilia sinais ↔ incidentes automáticos.
      const openBefore = await listEvents({ resolvedLimit: 0 }).catch(() => ({
        open: [],
        resolved: [],
        openCount: 0,
      }));
      const openByDedupe = new Map(
        openBefore.open.filter((e) => e.source !== "manual").map((e) => [dedupeFor(e.source), e])
      );

      let created = 0;
      const stillBad = new Set<string>();
      for (const sig of signals) {
        const severity = SEVERITY_BY_STATE[sig.state];
        const source = SOURCE_BY_SIGNAL[sig.key];
        if (!severity || !source) continue;
        const dedupeKey = `${source}:auto`;
        stillBad.add(dedupeKey);
        const ev = await ensureAutoEvent(dedupeKey, () => ({
          source,
          severity,
          title: `${sig.label}: ${severity === "critical" ? "crítico" : "atenção"}`,
          detail: sig.detail,
        }));
        if (ev) created += 1;
      }

      // 3: sinais que voltaram ao verde → resolve o incidente auto aberto.
      let resolved = 0;
      for (const [dedupeKey, ev] of openByDedupe) {
        if (!stillBad.has(dedupeKey)) {
          await resolveEvent(ev.id, "auto", "Sinal voltou ao normal.").catch(() => null);
          resolved += 1;
        }
      }

      // 4: e-mail de alerta (idempotente por alertedAt).
      const severityLabel = snapshot.overall === "critical" ? "crítico" : "atenção";
      const alert = await maybeSendAlert(severityLabel);

      log.info("health-alert executado", {
        overall: snapshot.overall,
        created,
        resolved,
        alertSent: alert.sent,
        alertReason: alert.reason,
      });
      return NextResponse.json({
        success: true,
        overall: snapshot.overall,
        created,
        resolved,
        alert,
      });
    });
  } catch (error) {
    log.error("Erro no cron health-alert", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Erro no health-alert" }, { status: 500 });
  }
}

/** Reconstrói o dedupeKey auto a partir do source de um evento existente. */
function dedupeFor(source: string): string {
  return `${source}:auto`;
}
