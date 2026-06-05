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

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminAuth();

    // Em paralelo: pulso (toca DB), tendências (lê MetricSample) e saúde da base.
    const [pulse, trends, clientHealth] = await Promise.all([
      getSystemPulse(),
      getSystemTrends(),
      getClientHealthSnapshot(),
    ]);

    return NextResponse.json({ data: { pulse, trends, clientHealth } });
  } catch (error) {
    return handleApiError(error);
  }
}
