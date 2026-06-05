// src/app/api/admin/observability/route.ts
//
// Payload do cockpit de monitoramento (Fase 5). Reúne o pulso ao vivo do sistema,
// as tendências da frota (24h) e o snapshot de saúde dos clientes. Consumido pela
// página server (carga inicial) E pelo cockpit-client (polling do pulso).
import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getSystemPulse } from "@/lib/monitoring/system-pulse";
import { getSystemTrends } from "@/lib/monitoring/system-trends";
import { getClientHealthSnapshot } from "@/lib/monitoring/client-health-snapshot";
import { getProblemCompanies } from "@/lib/monitoring/problem-companies";
import { detectIssues } from "@/lib/monitoring/issues";
import { evaluateAlerts, alertMetricsFromPulse } from "@/lib/monitoring/alert-rules";
import { captureMessage } from "@/lib/sentry";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminAuth();

    // Em paralelo: pulso (toca DB), tendências (lê MetricSample), saúde da base e
    // empresas problemáticas. getProblemCompanies é best-effort — se falhar, segue
    // com lista vazia (não derruba o cockpit; mesmo princípio do getSystemTrends).
    const [pulse, trends, clientHealth, problemCompanies] = await Promise.all([
      getSystemPulse(),
      getSystemTrends(),
      getClientHealthSnapshot(),
      getProblemCompanies().catch(() => []),
    ]);

    const issues = detectIssues({ pulse, trends, problemCompanies });

    // Alertas: avalia o pulso contra os limiares e notifica via Sentry quando algo
    // dispara. Best-effort — uma falha aqui NÃO derruba o cockpit. (Sentry é no-op
    // se SENTRY_DSN não estiver setado, então é seguro chamar sempre.)
    try {
      const fired = evaluateAlerts(alertMetricsFromPulse(pulse));
      for (const alert of fired) {
        captureMessage(`[monitoramento] ${alert.message}`, {
          level: alert.level,
          extra: { alertId: alert.id, version: pulse.version },
        });
      }
    } catch {
      // alertas são best-effort; nunca quebram a resposta do cockpit.
    }

    return NextResponse.json({ data: { pulse, trends, clientHealth, issues } });
  } catch (error) {
    return handleApiError(error);
  }
}
