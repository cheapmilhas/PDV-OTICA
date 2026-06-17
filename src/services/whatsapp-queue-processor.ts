/**
 * Processador da fila de WhatsApp (anti-bloqueio Fase 1).
 *
 * Chamado pelo endpoint /api/cron/whatsapp-dispatch (acionador externo a cada
 * ~3 min) e pelo botão "Processar agora". Envia 1 mensagem por ótica por
 * invocação — o RITMO vem do intervalo do acionador, sem sleep no código.
 *
 * Fluxo por invocação:
 *  1. Recupera linhas PROCESSING presas (> staleMin) de volta para PENDING.
 *  2. Para cada ótica com PENDING: resolve as travas DELA via getWhatsappLimits
 *     (override da ótica → global → default da Fase 1); checa o horário comercial
 *     dela; respeita o teto diário dela; faz CLAIM ATÔMICO de 1 PENDING
 *     (findFirst + updateMany WHERE status=PENDING); reavalia elegibilidade
 *     (opt-out/conexão na hora) e envia. skippedOutOfHours = nenhuma ótica no horário.
 *
 * Travas configuráveis (Fase 2): janela de horário, teto diário e pular-sábado
 * vêm de WhatsappGlobalConfig + overrides por ótica. Sem config → defaults da
 * Fase 1 (8h-18h, 50/dia, sábado útil). Fail-safe no serviço de limites.
 *
 * Claim atômico: o `updateMany({ where: { id, status: "PENDING" }, ... })` é
 * atômico NO POSTGRES — se duas invocações tentarem a mesma linha, só uma terá
 * count===1; a outra (count===0) desiste. Os testes são mockados e provam o
 * WHERE/abort, não a atomicidade real (que é garantia do banco).
 *
 * Não lança: erros por ótica/linha são logados e o loop continua.
 *
 * Dívida conhecida (Fase 1, aceitável): o teto diário lê SENT do dia ANTES do
 * claim, então duas invocações concorrentes da MESMA ótica podem ambas passar o
 * teto e enviar +1 cada (blast-radius ~1 msg/par, dado 1 ótica/iteração e
 * intervalo de ~3 min). Fase 2 pode usar advisory lock por companyId.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isWithinBusinessHours, spDayRange } from "@/lib/whatsapp-business-hours";
import { checkWhatsappEligibility, sendExistingQueued } from "@/lib/whatsapp-send";
import type { SendWhatsappInput } from "@/lib/whatsapp-send";
import { getWhatsappLimits, DEFAULT_WA_LIMITS } from "@/services/whatsapp-limits.service";

const log = logger.child({ service: "whatsapp-queue-processor" });

// As travas (horário, teto diário, pular sábado, stale) agora vêm de
// getWhatsappLimits (override por ótica → global → default). Os defaults da Fase
// 1 vivem em DEFAULT_WA_LIMITS. Por isso não há mais const fixa aqui.

export interface QueueResult {
  /** true quando estava fora do horário comercial (nada foi processado). */
  skippedOutOfHours: boolean;
  /** quantas linhas foram efetivamente travadas (claim count===1). */
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  /** PENDING restantes após a invocação (sinal de fila represada). */
  pendingRestantes: number;
}

export async function processWhatsappQueue(
  now: Date = new Date(),
  options?: { companyId?: string }, // quando setado, processa só essa ótica (run-now)
): Promise<QueueResult> {
  const zero: QueueResult = {
    skippedOutOfHours: false,
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    pendingRestantes: 0,
  };

  // Travas globais (Fase 2): a janela de horário pode variar POR ÓTICA, então a
  // checagem de horário foi movida para dentro do loop por ótica (cada uma resolve
  // seus limites). Aqui resolvemos só o staleMin global (técnico, sem override por
  // ótica) p/ a recuperação de PROCESSING preso. Sem config → defaults da Fase 1.
  const globalLimits = await getWhatsappLimits(
    options?.companyId ?? "__global__",
  ).catch(() => DEFAULT_WA_LIMITS);
  const staleMin = globalLimits.staleMin;

  // Recupera PROCESSING preso (função morreu antes de gravar SENT/FAILED).
  //    Mira processingAt (hora do claim), NÃO createdAt (hora do enfileiramento):
  //    uma linha que esperou muito na fila e acabou de ser travada tem createdAt
  //    antigo mas processingAt recente — usar createdAt a recuperaria mid-envio
  //    e reenviaria. processingAt null (linha enfileirada antes desta migração)
  //    nunca é recuperada por aqui — só linhas efetivamente travadas há > STALE.
  const staleBefore = new Date(now.getTime() - staleMin * 60 * 1000);
  await prisma.whatsappMessageLog
    .updateMany({
      where: {
        status: "PROCESSING",
        processingAt: { lt: staleBefore },
        ...(options?.companyId ? { companyId: options.companyId } : {}),
      },
      data: { status: "PENDING" },
    })
    .catch((e) => {
      log.warn("Falha ao recuperar PROCESSING preso", {
        error: e instanceof Error ? e.message : String(e),
      });
    });

  // 3. Óticas com PENDING. (A conexão é reavaliada por linha em checkElig.)
  const pendingCompanies = await prisma.whatsappMessageLog.findMany({
    where: {
      status: "PENDING",
      ...(options?.companyId ? { companyId: options.companyId } : {}),
    },
    select: { companyId: true },
    distinct: ["companyId"],
  });

  let claimed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  // Rastreia se ALGUMA ótica estava dentro do seu horário. Se nenhuma estava,
  // o retorno marca skippedOutOfHours (coerente com o comportamento da Fase 1).
  let anyInBusinessHours = false;

  for (const { companyId } of pendingCompanies) {
    try {
      // Travas resolvidas POR ÓTICA (override → global → default). Fail-safe no
      // serviço: erro de banco → defaults da Fase 1.
      const limits = await getWhatsappLimits(companyId);

      // horário comercial DESTA ótica (janela + pular sábado configuráveis).
      if (!isWithinBusinessHours(now, limits)) continue;
      anyInBusinessHours = true;

      // teto diário (resolvido) — já enviou o teto hoje? pula.
      const { start, end } = spDayRange(now);
      const sentToday = await prisma.whatsappMessageLog.count({
        where: { companyId, status: "SENT", sentAt: { gte: start, lt: end } },
      });
      if (sentToday >= limits.dailyCap) continue;

      // claim atômico de 1 PENDING mais antiga.
      const target = await prisma.whatsappMessageLog.findFirst({
        where: { companyId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!target) continue;

      const claim = await prisma.whatsappMessageLog.updateMany({
        where: { id: target.id, status: "PENDING" },
        data: { status: "PROCESSING", processingAt: now },
      });
      if (claim.count === 0) continue; // outra invocação travou antes
      claimed++;

      // relê a linha travada (phone/content/customer/refs).
      const row = await prisma.whatsappMessageLog.findUnique({ where: { id: target.id } });
      if (!row) continue;

      // reavalia elegibilidade na hora (pega opt-out e desconexão recentes).
      // Busca o customer atual p/ acceptsMarketing (opt-out). periodKey=null:
      // NÃO deduplicar contra a própria linha PROCESSING (o dedupe já aconteceu
      // no enqueue) — senão checkElig acharia esta linha e marcaria already_sent.
      const customer = row.customerId
        ? await prisma.customer.findUnique({
            where: { id: row.customerId },
            select: { id: true, name: true, phone: true, acceptsMarketing: true },
          })
        : null;

      const input: SendWhatsappInput = {
        companyId: row.companyId,
        customer: {
          id: row.customerId,
          name: customer?.name ?? null,
          phone: customer?.phone ?? row.phone,
          acceptsMarketing: customer?.acceptsMarketing ?? null,
        },
        type: row.type,
        template: row.content, // já renderizado no enqueue → vai verbatim
        referenceId: row.referenceId,
        periodKey: null, // não deduplicar contra a própria linha
      };

      const elig = await checkWhatsappEligibility(input);
      if (!elig.eligible) {
        await prisma.whatsappMessageLog
          .update({ where: { id: row.id }, data: { status: "SKIPPED", skipReason: elig.skipReason } })
          .catch((e) => {
            // Se falhar, a linha fica PROCESSING e será recuperada (stale) e
            // reavaliada — mas logar p/ não ficar invisível se persistir.
            log.warn("Falha ao marcar SKIPPED na fila", {
              companyId: row.companyId, logId: row.id,
              error: e instanceof Error ? e.message : String(e),
            });
          });
        skipped++;
        continue;
      }

      const r = await sendExistingQueued({
        logId: row.id,
        companyId: row.companyId,
        number: elig.number ?? row.phone,
        content: row.content, // já renderizado no enqueue → envia verbatim
      });
      if (r === "SENT") sent++;
      else failed++;
    } catch (err) {
      log.error("Falha ao processar a fila da ótica", {
        companyId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const pendingRestantes = await prisma.whatsappMessageLog.count({
    where: {
      status: "PENDING",
      ...(options?.companyId ? { companyId: options.companyId } : {}),
    },
  });

  // skippedOutOfHours: havia ótica(s) com PENDING mas NENHUMA estava no seu
  // horário → nada foi enviável por causa de horário. (Fila vazia não conta.)
  const skippedOutOfHours = pendingCompanies.length > 0 && !anyInBusinessHours;

  return { skippedOutOfHours, claimed, sent, skipped, failed, pendingRestantes };
}
