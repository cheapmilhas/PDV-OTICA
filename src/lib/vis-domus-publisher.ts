import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkSubscription } from "@/lib/subscription";
import { projectEntitlement } from "@/lib/entitlement-projection";
import { signVisDomus } from "@/lib/vis-domus-hmac";
import { randomUUID } from "crypto";

/**
 * Publisher Vis → Domus: publica a decisão de entitlement de uma clínica.
 *
 * O Vis é a fonte de verdade. Chamado APÓS a escrita da Subscription mudar de
 * estado (webhook Asaas, dunning, ação do super admin). Só publica para Company
 * VIS_MEDICAL com domusClinicId — o vínculo com a clínica no Domus.
 *
 * NÃO lança em falha de rede: loga e retorna. A entrega garantida é o cron de
 * pull diário do Domus (reparação). O webhook é o caminho rápido, não o único.
 */

const WINDOW_LOG = "vis-domus-publisher";

export interface EntitlementPayload {
  version: 1;
  eventId: string;
  sourceUpdatedAt: string; // max(Subscription.updatedAt, Company.updatedAt)
  generatedAt: string;
  visCompanyId: string;
  domusClinicId: string;
  subscriptionStatus: string;
  planName: string | null;
  entitlement: { writeAllowed: boolean; reason: string };
}

/**
 * Monta o payload de entitlement de uma Company VIS_MEDICAL.
 * Retorna null se a company não é medical ou não tem vínculo (nada a publicar).
 */
export async function buildEntitlementPayload(
  companyId: string,
  now: Date,
): Promise<EntitlementPayload | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, platformProduct: true, domusClinicId: true, updatedAt: true },
  });
  if (!company || company.platformProduct !== "VIS_MEDICAL" || !company.domusClinicId) {
    return null;
  }

  const sub = await prisma.subscription.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { updatedAt: true, plan: { select: { name: true } } },
  });

  const decision = await checkSubscription(companyId);
  const dto = projectEntitlement({
    allowed: decision.allowed,
    status: decision.status,
    planName: decision.planName ?? sub?.plan?.name,
  });

  // sourceUpdatedAt = relógio do estado. MAX das duas datas: block/unblock muda
  // Company.updatedAt sem tocar a Subscription — usar só a Subscription faria o
  // Domus descartar o snapshot novo como fora de ordem.
  const subUpdated = sub?.updatedAt?.getTime() ?? 0;
  const compUpdated = company.updatedAt.getTime();
  const sourceUpdatedAt = new Date(Math.max(subUpdated, compUpdated)).toISOString();

  return {
    version: 1,
    eventId: randomUUID(),
    sourceUpdatedAt,
    generatedAt: now.toISOString(),
    visCompanyId: company.id,
    domusClinicId: company.domusClinicId,
    subscriptionStatus: dto.subscriptionStatus,
    planName: dto.planName,
    entitlement: { writeAllowed: dto.writeAllowed, reason: dto.reason },
  };
}

/**
 * Dispara a publicação SEM bloquear o chamador (fire-and-forget).
 *
 * O publish é best-effort e o pull diário repara — então a ação do admin
 * (block/unblock) não deve esperar o round-trip ao Domus (até 5s). Chama isto,
 * não `publishEntitlementForCompany` diretamente, de dentro de handlers de UI.
 */
export function schedulePublishEntitlement(companyId: string): void {
  void publishEntitlementForCompany(companyId).catch(() => {
    // publishEntitlementForCompany já loga; o void.catch só evita unhandled rejection.
  });
}

/**
 * Publica o entitlement de uma Company no Domus (webhook assinado).
 * Best-effort: nunca lança. Falha de rede fica para o pull de reparação.
 */
export async function publishEntitlementForCompany(companyId: string): Promise<void> {
  const secret = process.env.VIS_DOMUS_WEBHOOK_SECRET;
  const url = process.env.DOMUS_WEBHOOK_URL;
  if (!secret || !url) {
    logger.warn("publisher desabilitado (sem secret/url) — pull de reparação cobre", {
      window: WINDOW_LOG,
      hasSecret: !!secret,
      hasUrl: !!url,
    });
    return;
  }

  try {
    const now = new Date();
    const payload = await buildEntitlementPayload(companyId, now);
    if (!payload) return; // não é medical vinculada — nada a publicar

    const rawBody = JSON.stringify(payload);
    const ts = now.getTime();
    const signature = signVisDomus(secret, ts, rawBody);

    const res = await fetch(`${url}/api/internal/vis/entitlements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vis-timestamp": String(ts),
        "x-vis-signature": signature,
      },
      body: rawBody,
      // 10s (não 5s): o receptor do Domus é serverless e o PRIMEIRO webhook
      // pega cold start — 5s estourava e caía no pull de reparação. O publisher
      // é fire-and-forget (não segura a resposta do admin), então 10s não pesa
      // na UX. A janela HMAC é ±5min, então a espera não invalida a assinatura.
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      logger.warn("publish falhou (pull de reparação cobre)", {
        window: WINDOW_LOG,
        companyId,
        status: res.status,
      });
    }
  } catch (err) {
    // Timeout/rede: não propaga. O cron de pull do Domus reconcilia.
    logger.warn("publish erro de rede (pull de reparação cobre)", {
      window: WINDOW_LOG,
      companyId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
