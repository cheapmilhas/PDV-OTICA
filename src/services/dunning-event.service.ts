import { prisma as defaultPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "dunning-event" });

/**
 * Ação gravada na trilha, por marco da régua. Valores do enum `DunningAction`
 * (`prisma/schema.prisma:4693`): os marcos 3 e 7 são lembrete; o 14 é o ÚLTIMO
 * aviso antes de perder a escrita, e por isso é `WARNING_EMAIL`.
 */
export function noticeActionFor(stage: number): "REMINDER_EMAIL" | "WARNING_EMAIL" {
  return stage >= 14 ? "WARNING_EMAIL" : "REMINDER_EMAIL";
}

/** Status que provam que o aviso REALMENTE saiu. */
const DISPATCHED = ["SENT", "DELIVERED"] as const;

interface Deps {
  db?: {
    dunningEvent: {
      create: (args: never) => Promise<unknown>;
      findFirst: (args: never) => Promise<unknown>;
    };
  };
}

interface RecordInput {
  companyId: string;
  invoiceId: string;
  stage: number;
  delivered: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Registra uma tentativa de aviso da régua.
 *
 * 🔑 Grava TAMBÉM o que não foi entregue. A distinção entre `FAILED` (tentou e
 * falhou) e `SKIPPED` (nem tentou — modo de teste, sem destinatário, canal
 * desligado) é o que impede punir o cliente por problema nosso: foi exatamente o
 * caso da clínica MedFacil, cujo e-mail de cobrança foi redirecionado pelo modo
 * de teste e nunca chegou. Ver spec 2026-07-29 §4.6.2.
 *
 * Best-effort: falha ao gravar a trilha nunca derruba o cron — mas devolve
 * `false`, e quem chama decide (o cron NÃO avança a régua sem trilha).
 */
export async function recordDunningNotice(
  input: RecordInput,
  deps: Deps = {}
): Promise<boolean> {
  const db = deps.db ?? defaultPrisma;
  const status = input.delivered ? "SENT" : input.skipped ? "SKIPPED" : "FAILED";

  try {
    await db.dunningEvent.create({
      data: {
        companyId: input.companyId,
        invoiceId: input.invoiceId,
        action: noticeActionFor(input.stage),
        channel: "EMAIL",
        status,
        sentAt: input.delivered ? new Date() : null,
        errorDetail: input.error ?? null,
      },
    } as never);
    return true;
  } catch (error) {
    log.error("Falha ao gravar trilha de dunning", {
      companyId: input.companyId,
      stage: input.stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Existe aviso EFETIVAMENTE DESPACHADO do marco `stage` para esta empresa?
 *
 * 🔑 O marco importa. `DunningEvent` não tem coluna `stage` (a spec §4.6.3 pediu
 * uma decisão aqui; sem migração nesta fatia, a resolução é a `action`): o marco
 * 14 grava `WARNING_EMAIL` e os marcos 3/7 gravam `REMINDER_EMAIL`. Consultar
 * "qualquer aviso" faria um lembrete do dia 3 autorizar a restrição do dia 14 —
 * I3 viraria "foi avisado alguma vez", que é bem mais fraco do que se pretende.
 *
 * 🔑 Fail-closed: erro de leitura devolve `false`. Na dúvida sobre ter avisado,
 * não se restringe o acesso do cliente.
 *
 * 📌 Limite aceito: sem `stage` nem unique na tabela, dois marcos que compartilham
 * a mesma `action` são indistinguíveis (hoje 3 e 7, ambos `REMINDER_EMAIL`) e uma
 * reexecução do cron grava linha duplicada. Nenhum dos dois afeta a decisão de
 * restringir, que só consulta `WARNING_EMAIL`. Coluna `stage` + unique
 * `(invoiceId, action, stage)` ficam para a fatia que carregar migração (Plano B).
 */
export async function hasDispatchedNotice(
  companyId: string,
  stage: number,
  deps: Deps = {}
): Promise<boolean> {
  const db = deps.db ?? defaultPrisma;

  try {
    const found = await db.dunningEvent.findFirst({
      where: {
        companyId,
        action: noticeActionFor(stage),
        status: { in: [...DISPATCHED] },
      },
      select: { id: true },
    } as never);
    return found !== null;
  } catch (error) {
    log.error("Falha ao ler trilha de dunning — assumindo NÃO avisado", {
      companyId,
      stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
