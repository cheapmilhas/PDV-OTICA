import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { postProvision, type ProvisionRequest } from "@/lib/vis-provision-client";

/**
 * Outbox durável do provisionamento Vis → Domus (F2).
 *
 * - `enqueueProvisioning` grava a linha de outbox DENTRO da tx de criação da
 *   Company (mesma tx → nunca há Company medical PROVISIONING sem outbox).
 * - `runProvisioningOnce` processa UMA Company (fast-path síncrono OU worker).
 * - `drainProvisioningOutbox` é o worker: pega as linhas vencidas e processa.
 *
 * Política de retry: backoff exponencial (base 30s, teto 1h), maxAttempts 10.
 * Falha terminal (409 do Domus) OU esgotar tentativas → PROVISION_FAILED.
 */

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 60 * 60_000;
const MAX_ATTEMPTS = 10;
// Janela de lease do claim: enquanto uma execução processa uma linha, empurra
// nextAttemptAt para o futuro; concorrentes (fast-path + cron) não a reivindicam.
// Cobre o postProvision (I/O de rede) com folga; se a execução morre, o lease
// expira e outro tick reprocessa. Ver P0#2 (exclusão mútua do outbox).
const LEASE_MS = 2 * 60_000;

const log = logger.child({ service: "provisioning-outbox" });

/** Grava a linha de outbox na tx de criação. O attemptId inicial marca a tentativa. */
export async function enqueueProvisioning(
  tx: Prisma.TransactionClient,
  companyId: string,
  payload: ProvisionRequest,
  attemptId: string,
): Promise<void> {
  await tx.company.update({
    where: { id: companyId },
    data: { provisioningState: "PROVISIONING", provisioningAttemptId: attemptId },
  });
  await tx.provisioningOutbox.create({
    data: { companyId, payload: payload as unknown as Prisma.InputJsonValue },
  });
}

function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempts, BACKOFF_CAP_MS);
}

/** Monta o link de aceite do convite. Base = medical.vis.app.br (Marco 2). */
function buildInviteUrl(token: string): string {
  const base = process.env.MEDICAL_APP_URL ?? "https://medical.vis.app.br";
  return `${base}/aceitar-convite?token=${token}`;
}

/**
 * Processa o provisionamento de UMA company. Idempotente por chamada: relê o
 * outbox do banco (nunca confia num payload de fora). Usado pelo fast-path e
 * pelo worker. Retorna o estado final desta tentativa.
 */
export async function runProvisioningOnce(
  companyId: string,
  db: PrismaClient = prisma,
): Promise<"PROVISIONED" | "PROVISIONING" | "PROVISION_FAILED"> {
  const now = new Date();
  // Claim atômico (P0#2): reivindica a linha empurrando nextAttemptAt para o
  // futuro. Só quem venceu o updateMany (count === 1) processa; concorrentes
  // (fast-path + cron simultâneos) veem count === 0 e saem sem re-POSTar nem
  // duplicar e-mail. Crash-safe: se esta execução morrer, o lease expira em
  // LEASE_MS e outro tick reprocessa.
  const claim = await db.provisioningOutbox.updateMany({
    where: { companyId, nextAttemptAt: { lte: now } },
    data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (claim.count === 0) {
    // Ou já foi drenada, ou outra execução tem o lease agora.
    return "PROVISIONING";
  }

  const row = await db.provisioningOutbox.findUnique({ where: { companyId } });
  if (!row) return "PROVISIONED"; // já drenado por outra tentativa

  const payload = row.payload as unknown as ProvisionRequest;
  const result = await postProvision(payload);

  if (result.kind === "applied") {
    // Monta o link de convite quando veio token cru (provisionamento NOVO).
    // Em replay idempotente o token é undefined → preserva o link já gravado.
    const inviteUrl = result.inviteToken ? buildInviteUrl(result.inviteToken) : undefined;
    await db.$transaction([
      db.company.update({
        where: { id: companyId },
        data: {
          provisioningState: "PROVISIONED",
          ...(inviteUrl ? { medicalInviteUrl: inviteUrl } : {}),
        },
      }),
      db.provisioningOutbox.delete({ where: { companyId } }),
    ]);
    log.info("provisionado", { companyId, inviteGerado: !!inviteUrl });
    return "PROVISIONED";
  }

  if (result.kind === "terminal") {
    await db.$transaction([
      db.company.update({ where: { id: companyId }, data: { provisioningState: "PROVISION_FAILED" } }),
      db.provisioningOutbox.update({ where: { companyId }, data: { failureReason: result.error } }),
    ]);
    log.error("provisionamento TERMINAL", { companyId, error: result.error });
    return "PROVISION_FAILED";
  }

  // transitório: incrementa tentativas; se esgotou, vira terminal.
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db.$transaction([
      db.company.update({ where: { id: companyId }, data: { provisioningState: "PROVISION_FAILED" } }),
      db.provisioningOutbox.update({
        where: { companyId },
        data: { attempts, failureReason: `esgotou ${MAX_ATTEMPTS} tentativas: ${result.reason}` },
      }),
    ]);
    log.error("provisionamento esgotou tentativas", { companyId, attempts, reason: result.reason });
    return "PROVISION_FAILED";
  }
  await db.provisioningOutbox.update({
    where: { companyId },
    data: { attempts, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) },
  });
  log.warn("provisionamento transitório, reenfileirado", { companyId, attempts, reason: result.reason });
  return "PROVISIONING";
}

/**
 * Worker: processa as linhas vencidas (nextAttemptAt <= agora). Ignora linhas
 * TERMINAIS (failureReason setado = PROVISION_FAILED): elas ficam só para o
 * super admin inspecionar, nunca são re-POSTadas (senão o cron martelaria um
 * conflito 409 pra sempre). O claim atômico em runProvisioningOnce garante que
 * fast-path e cron não processem a mesma linha em paralelo (P0#2).
 */
export async function drainProvisioningOutbox(db: PrismaClient = prisma): Promise<number> {
  const due = await db.provisioningOutbox.findMany({
    where: { nextAttemptAt: { lte: new Date() }, failureReason: null },
    select: { companyId: true },
    take: 50,
  });
  let claimed = 0;
  for (const { companyId } of due) {
    const state = await runProvisioningOnce(companyId, db).catch((err) => {
      log.error("erro no drain", { companyId, error: err instanceof Error ? err.message : String(err) });
      return null;
    });
    // PROVISIONING vindo de claim perdido (outro tick pegou) não conta como trabalho.
    if (state && state !== "PROVISIONING") claimed++;
  }
  return due.length;
}
