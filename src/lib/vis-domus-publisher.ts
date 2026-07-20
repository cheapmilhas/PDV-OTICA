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
  /**
   * Relógio monotônico (V3a/V3b), capturado no snapshot coerente, como STRING
   * decimal — NUNCA bigint cru: o payload passa por JSON.stringify em
   * publishEntitlementForCompany e BigInt não serializa (quebraria toda a
   * publicação). null quando a company não tem linha de revisão (improvável após
   * backfill). V3c passa a EMITIR este campo no payload v2; até lá é interno.
   */
  sourceRevision: string | null;
  /** Tier do plano ativo (V3b captura; V3c emite em `plan.tier`). */
  planTier: string | null;
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
  // V3b: leitura COERENTE numa transação REPEATABLE READ. Antes, Company,
  // Subscription e checkSubscription (global) davam 3 visões diferentes do banco
  // → torn read (publisher A lia tier velho, calculava relógio novo, sobrescrevia
  // o snapshot certo do publisher B). Agora as 3 leituras + a revisão veem o mesmo
  // snapshot. O fetch fica FORA da tx (não segura conexão durante a rede).
  const snapshot = await prisma.$transaction(
    async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, platformProduct: true, domusClinicId: true, updatedAt: true },
      });
      if (!company || company.platformProduct !== "VIS_MEDICAL" || !company.domusClinicId) {
        return null;
      }

      const sub = await tx.subscription.findFirst({
        where: { companyId },
        // Tiebreaker por id: coerente com checkSubscription (evita empate).
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { updatedAt: true, plan: { select: { name: true, tier: true } } },
      });

      // checkSubscription roda DENTRO da mesma tx (snapshot coerente + a mutação
      // de trial expira no mesmo snapshot).
      const decision = await checkSubscription(companyId, tx);

      // Relógio monotônico (V3a). Ausência de linha (company nova sem bump ainda,
      // improvável após backfill) → revision null (V3c não emite sourceRevision).
      const rev = await tx.entitlementRevision.findUnique({
        where: { companyId },
        select: { revision: true },
      });

      return { company, sub, decision, revision: rev?.revision ?? null };
    },
    { isolationLevel: "RepeatableRead" },
  );

  if (!snapshot) return null;
  const { company, sub, decision, revision } = snapshot;
  // O early return DENTRO da tx já garantiu domusClinicId != null; o narrowing se
  // perde ao sair da tx, então reafirmamos (nunca null aqui).
  const domusClinicId = company.domusClinicId as string;

  const dto = projectEntitlement({
    allowed: decision.allowed,
    status: decision.status,
    planName: decision.planName ?? sub?.plan?.name,
  });

  // sourceUpdatedAt = relógio LEGADO (mantido no payload — o Domus ainda o exige).
  // MAX das duas datas: block/unblock muda Company.updatedAt sem tocar a
  // Subscription — usar só a Subscription faria o Domus descartar como fora de ordem.
  const subUpdated = sub?.updatedAt?.getTime() ?? 0;
  const compUpdated = company.updatedAt.getTime();
  const sourceUpdatedAt = new Date(Math.max(subUpdated, compUpdated)).toISOString();

  return {
    version: 1,
    eventId: randomUUID(),
    sourceUpdatedAt,
    // V3b captura a revisão + tier no snapshot coerente; V3c os emite no payload
    // v2. STRING decimal (não bigint cru — JSON.stringify quebraria a publicação).
    sourceRevision: revision !== null ? revision.toString() : null,
    planTier: sub?.plan?.tier ?? null,
    generatedAt: now.toISOString(),
    visCompanyId: company.id,
    domusClinicId,
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
