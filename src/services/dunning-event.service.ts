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
  db?: Pick<typeof defaultPrisma, "dunningEvent">;
}

/**
 * Dependência de `hasDispatchedNotice`: só o método que ela de fato chama
 * (`findFirst`), não o delegate `dunningEvent` inteiro.
 *
 * 🔑 Deliberadamente mais estreita que `Deps` (usada por `recordDunningNotice`,
 * que também precisa de `create`): é o que permite `SubscriptionDbClient`
 * (`src/lib/subscription.ts`), que só expõe `findFirst`, satisfazer esta
 * assinatura por estrutura — sem `as never` mascarando a checagem de tipos
 * (uma tarefa anterior foi refeita exatamente por causa disso).
 */
interface ReadDeps {
  db?: { dunningEvent: Pick<typeof defaultPrisma.dunningEvent, "findFirst"> };
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
        // Marco explícito (Plano B). Antes desta coluna, os marcos 3 e 7
        // gravavam ambos `REMINDER_EMAIL` e ficavam indistinguíveis para
        // sempre. Também é o que dá idempotência à régua: o unique
        // (invoiceId, action, stage) faz a reexecução do cron colidir em vez
        // de gravar linha duplicada.
        stage: input.stage,
        channel: "EMAIL",
        status,
        sentAt: input.delivered ? new Date() : null,
        errorDetail: input.error ?? null,
      },
    });
    return true;
  } catch (error) {
    // P2002 = violação do unique (invoiceId, action, stage). Isso NÃO é falha:
    // é a idempotência funcionando. Significa que o aviso deste marco JÁ está
    // registrado — o melhor cenário possível, não o pior.
    //
    // 🔑 Por que distinguir importa: tratar a colisão como erro faria o dia em
    // que a trilha REALMENTE falhar (banco fora do ar) parecer idêntico ao dia
    // em que ela funcionou perfeitamente. Ruído que mascara sinal — e esta
    // trilha é a prova de I3, o que autoriza restringir a escrita de um tenant.
    if (isUniqueViolation(error)) {
      log.info("Trilha de dunning já registrada para este marco (idempotência)", {
        companyId: input.companyId,
        stage: input.stage,
      });
      return true;
    }
    log.error("Falha ao gravar trilha de dunning", {
      companyId: input.companyId,
      stage: input.stage,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * O erro é violação de constraint UNIQUE do Postgres?
 *
 * Checa o `code` do Prisma sem depender de `instanceof`: o cliente do Prisma é
 * mockado nos testes, e um mock não produz instância de `PrismaClientKnownRequestError`.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/**
 * Existe aviso EFETIVAMENTE DESPACHADO do marco `stage` para esta empresa?
 *
 * 🔑 O marco importa. Consultar "qualquer aviso" faria um lembrete do dia 3
 * autorizar a restrição do dia 14 — I3 viraria "foi avisado alguma vez", que é
 * bem mais fraco do que se pretende.
 *
 * 🔑 Fail-closed: erro de leitura devolve `false`. Na dúvida sobre ter avisado,
 * não se restringe o acesso do cliente.
 *
 * ## Por que a consulta aceita DUAS formas do mesmo fato
 *
 * A coluna `stage` chegou no Plano B; as linhas gravadas antes dela têm
 * `stage = NULL` e só carregam a `action`, que era o substituto na ausência da
 * coluna. Consultar SÓ por `stage` seria mais preciso, mas descartaria toda a
 * evidência já gravada: uma empresa realmente avisada no marco 14 antes da
 * migração passaria a parecer NÃO avisada.
 *
 * Isso não desbloquearia ninguém indevidamente (o efeito é não restringir, que
 * é o lado seguro de I3), mas apagaria trilha legítima e faria o cron reenviar
 * avisos já entregues. Então a consulta aceita:
 *
 *   - `stage` exatamente igual (linhas novas — precisão máxima); OU
 *   - `stage: null` **com** a `action` correspondente (linhas legadas).
 *
 * ⚠️ O ramo legado herda a imprecisão antiga: uma linha legada do marco 3 tem a
 * mesma `action` do marco 7, então ela satisfaz a consulta dos dois. Aceito e
 * TEMPORÁRIO — some sozinho conforme as linhas novas (com `stage`) substituem
 * as antigas. O marco 14, que é o único que autoriza restringir, nunca teve
 * essa ambiguidade: `WARNING_EMAIL` é só dele.
 */
export async function hasDispatchedNotice(
  companyId: string,
  stage: number,
  deps: ReadDeps = {}
): Promise<boolean> {
  const db = deps.db ?? defaultPrisma;

  try {
    const found = await db.dunningEvent.findFirst({
      where: {
        companyId,
        status: { in: [...DISPATCHED] },
        OR: [
          { stage },
          { stage: null, action: noticeActionFor(stage) },
        ],
      },
      select: { id: true },
    });
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
