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

/** Campos comuns a v1 e v2. */
interface EntitlementPayloadBase {
  eventId: string;
  sourceUpdatedAt: string; // max(Subscription.updatedAt, Company.updatedAt)
  /**
   * Relógio monotônico (V3a), STRING decimal — NUNCA bigint cru (o payload passa
   * por JSON.stringify e BigInt não serializa). Emitido quando presente; o Domus
   * (D1.2) valida `^[0-9]+$` e ordena por ele quando presente, senão por
   * sourceUpdatedAt (que continua sempre emitido — o Domus ainda o exige).
   */
  sourceRevision?: string;
  generatedAt: string;
  visCompanyId: string;
  domusClinicId: string;
  subscriptionStatus: string;
  planName: string | null;
  entitlement: { writeAllowed: boolean; reason: string };
}

/**
 * Payload de entitlement Vis → Domus. União DISCRIMINADA por `version`: v2 SEMPRE
 * tem `plan.tier` (o parser do Domus exige e rejeita v2 sem tier); v1 NUNCA tem
 * `plan` (ramos sem plano ativo — o Domus preserva o tier gravado). O tipo impede
 * a combinação inválida em compile-time (achado Codex P2).
 */
export type EntitlementPayload =
  | (EntitlementPayloadBase & { version: 1 })
  | (EntitlementPayloadBase & { version: 2; plan: { tier: string } });

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
  //
  // Retry curto (V3c, achado Codex): checkSubscription pode EXPIRAR trial
  // (updateMany) dentro da tx; sob REPEATABLE READ, dois publishers concorrentes
  // no mesmo trial dão serialization error (P2034/40001). Sem retry, o webhook
  // daquela execução se perderia (o pull repara, mas o caminho rápido falha à toa).
  const snapshot = await runSnapshotWithRetry(companyId);

  if (!snapshot) return null;
  return assemblePayload(snapshot, now);
}

/** Erros de serialização do Prisma que valem retry (conflito de escrita concorrente). */
function isSerializationError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === "P2034"; // "Transaction failed due to a write conflict or a deadlock"
}

async function runSnapshotWithRetry(companyId: string) {
  const MAX_TRIES = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await readSnapshot(companyId);
    } catch (err) {
      if (isSerializationError(err) && attempt < MAX_TRIES) continue;
      throw err;
    }
  }
}

type EntitlementSnapshot = NonNullable<Awaited<ReturnType<typeof readSnapshot>>>;

async function readSnapshot(companyId: string) {
  return prisma.$transaction(
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
}

/** Monta o DTO/payload a partir do snapshot coerente. Sem acesso a banco/rede. */
function assemblePayload(
  snapshot: EntitlementSnapshot,
  now: Date,
): EntitlementPayload {
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

  // V3c: emite v2 SÓ quando há tier derivável (plano ativo). Ramos sem plano
  // continuam v1 — o Domus exige plan.tier não-vazio em v2 e preserva o tier
  // gravado quando recebe v1 (não regride). Nunca emitir v2 sem tier.
  const tier = sub?.plan?.tier ?? null;

  const base = {
    eventId: randomUUID(),
    sourceUpdatedAt,
    generatedAt: now.toISOString(),
    visCompanyId: company.id,
    domusClinicId,
    subscriptionStatus: dto.subscriptionStatus,
    planName: dto.planName,
    entitlement: { writeAllowed: dto.writeAllowed, reason: dto.reason },
  };

  // sourceRevision (STRING decimal) acompanha ambos v1 e v2 quando presente — o
  // Domus ordena por ele quando vem, senão por sourceUpdatedAt.
  const revisionField = revision !== null ? { sourceRevision: revision.toString() } : {};

  if (tier !== null) {
    return { version: 2, ...base, ...revisionField, plan: { tier } };
  }
  return { version: 1, ...base, ...revisionField };
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
