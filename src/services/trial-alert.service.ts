/**
 * N5 — alerta de trial expirando para o OPERADOR (o dono do SaaS).
 *
 * O cron `subscription-watch` avisa o CLIENTE por e-mail desde sempre, mas
 * nunca avisou o operador. Resultado: ele descobre que perdeu um trial quando
 * já expirou. Este serviço é a metade que faltava.
 *
 * Lógica PURA aqui; a escrita fica no caller. Cada regra abaixo veio de um
 * defeito real encontrado no challenge do Codex (2026-07-27).
 */
import { Prisma, type AdminRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "trial-alert" });

/**
 * Papéis que recebem alerta comercial de trial.
 *
 * SUPPORT e BILLING ficam de fora de propósito: `AdminUser.role` tem default
 * SUPPORT, então incluí-lo faria qualquer conta nova nascer recebendo alerta
 * de negócio. Quem decide sobre trial é quem decide sobre o cliente.
 */
export const TRIAL_ALERT_ROLES: AdminRole[] = ["SUPER_ADMIN", "ADMIN"];

export interface TrialAlertTarget {
  subscriptionId: string;
  companyId: string;
  companyName: string;
  trialEndsAt: Date;
  daysLeft: number;
}

/**
 * Chave de idempotência do alerta.
 *
 * 🔥 Escolher mal esta string quebra em SILÊNCIO — o alerta simplesmente não
 * chega, ou chega todo dia. As três formas erradas, e por quê:
 *
 * - `"trial-ending"` fixo → um alerta na vida inteira daquele tipo.
 * - só a data (`"2026-08-01"`) → trials DIFERENTES que vencem no mesmo dia
 *   colidem, e só o primeiro é notificado.
 * - só `subscriptionId` → estender o trial nunca gera novo alerta, justamente
 *   quando o operador mais precisa saber que a nova data está chegando.
 *
 * Incluir `trialEndsAt` resolve o terceiro caso de graça: estender o trial muda
 * a data, muda a chave, e o alerta volta a valer para o novo prazo.
 */
export function trialAlertPeriodKey(subscriptionId: string, trialEndsAt: Date): string {
  return `trial:${subscriptionId}:${trialEndsAt.toISOString()}`;
}

/**
 * Link do alerta.
 *
 * 🔥 Não aponta direto para `/admin/clientes/<id>`: aquela página faz
 * `notFound()` quando o produto da empresa difere do cookie `admin.product`
 * ativo. Um alerta de clínica clicado com o painel em "ótica" daria 404 — o
 * operador acharia que o cliente sumiu.
 *
 * A rota intermediária troca o contexto no SERVIDOR e só então redireciona. Tem
 * que ser no servidor porque o cookie é httpOnly: o link não consegue trocá-lo.
 */
export function trialAlertLink(companyId: string): string {
  return `/admin/ir/cliente/${companyId}`;
}

/**
 * Emite o alerta para os operadores elegíveis. Devolve quantas notificações
 * foram REALMENTE criadas (0 quando todas já existiam).
 *
 * 🔑 Notificação DIRECIONADA (uma linha por admin), nunca broadcast: as rotas
 * de "marcar como lida" excluem `adminId: null` de propósito — marcar uma
 * global a esconderia de todos os outros admins. Um alerta global voltaria como
 * não-lido a cada poll do sino, para sempre, e o operador aprenderia a ignorá-lo.
 *
 * 🔑 NUNCA lança. O caller é um cron que também vira status de assinatura; uma
 * falha ao avisar o operador não pode derrubar o processamento dos trials
 * seguintes nem interferir no ciclo de vida do cliente.
 */
export async function alertOperators(target: TrialAlertTarget): Promise<number> {
  try {
    const admins = await prisma.adminUser.findMany({
      where: { active: true, role: { in: TRIAL_ALERT_ROLES } },
      select: { id: true },
    });
    if (admins.length === 0) {
      log.warn("Nenhum admin elegível para alerta de trial", { companyId: target.companyId });
      return 0;
    }

    const periodKey = trialAlertPeriodKey(target.subscriptionId, target.trialEndsAt);
    const { title, message } = trialAlertContent(target);
    const link = trialAlertLink(target.companyId);

    let created = 0;
    for (const admin of admins) {
      try {
        await prisma.adminNotification.create({
          data: {
            adminId: admin.id,
            type: "TRIAL_EXPIRING",
            title,
            message,
            link,
            periodKey,
            metadata: {
              subscriptionId: target.subscriptionId,
              companyId: target.companyId,
              daysLeft: target.daysLeft,
            },
          },
        });
        created++;
      } catch (err) {
        // P2002 = já existe alerta deste trial para este admin. É o mecanismo
        // funcionando, não erro: segue em silêncio. Logar como falha aqui
        // encheria o log toda vez que o cron rodasse dentro da janela.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        log.error("Falha ao criar alerta de trial", {
          adminId: admin.id,
          companyId: target.companyId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return created;
  } catch (err) {
    log.error("Falha geral no alerta de trial", {
      companyId: target.companyId,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/** Texto do alerta. Nomeia o cliente e o prazo — genérico não gera ação. */
export function trialAlertContent(target: TrialAlertTarget): { title: string; message: string } {
  const dias =
    target.daysLeft <= 0
      ? "hoje"
      : target.daysLeft === 1
        ? "amanhã"
        : `em ${target.daysLeft} dias`;
  return {
    title: `Trial de ${target.companyName} termina ${dias}`,
    message:
      target.daysLeft <= 0
        ? `O período de teste de ${target.companyName} termina hoje. Fale com o cliente antes de perder a conversão.`
        : `Faltam ${target.daysLeft} dia(s) para o teste de ${target.companyName} acabar.`,
  };
}
