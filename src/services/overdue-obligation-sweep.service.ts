import { prisma as defaultPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "overdue-obligation-sweep" });

/**
 * Varredor de obrigações vencidas: faz o VENCIMENTO virar ESCRITA DE COLUNA.
 *
 * ## Por que este módulo existe (o buraco do escritor único)
 *
 * Até aqui existia **exatamente UM** escritor capaz de CRIAR inadimplência no
 * sistema inteiro: `src/app/api/webhooks/asaas/route.ts` no evento
 * `PAYMENT_OVERDUE` — `{ status: "PAST_DUE", pastDueSince: new Date() }`. Todos
 * os outros caminhos apenas **zeram** `pastDueSince` (recuperação, workflow de
 * fatura, ação de admin).
 *
 * A consequência é observável em produção: uma obrigação que vence **sem passar
 * pelo gateway** nunca faz ninguém ficar `PAST_DUE`. Foi o caso Óticas Ultra —
 * a fatura de junho nunca foi ao Asaas, o webhook nunca disparou, e o sistema
 * inteiro seguiu achando que estava tudo `ACTIVE` por três meses. Receita
 * perdida em silêncio, sem uma linha de log dizendo que havia dívida.
 *
 * É também a invariante **I2** ("vencimento GRAVA ESTADO, nunca só calcula")
 * saindo do papel: `dueAt` cruzar o passado é o relógio andando, não coluna
 * mudando. Enquanto ninguém carimbar `pastDueSince`, nenhum trigger de revisão
 * de entitlement dispara (todos observam `NEW.x IS DISTINCT FROM OLD.x`) e a
 * decisão de restrição sairia de uma data de calendário em vez de um estado
 * escrito.
 *
 * ## O que ele NÃO faz
 *
 * Não suspende, não cancela, não avisa e não emite cobrança. Ele escreve UMA
 * transição — `pastDueSince: null → dueAt` (+ `status: PAST_DUE`) — e para. A
 * régua de 14/30 dias segue sendo trabalho exclusivo do cron de dunning, que só
 * enxerga a transição no tick **SEGUINTE**. Ver a nota de posicionamento em
 * `src/app/api/cron/dunning/route.ts`.
 */

/** Uma transição efetivamente escrita — o que a telemetria do cron reporta. */
export interface SweptSubscription {
  subscriptionId: string;
  companyId: string;
  /** `dueAt` da obrigação vencida mais antiga: o início REAL da inadimplência. */
  pastDueSince: Date;
}

export interface SweepResult {
  /** Assinaturas que ganharam carimbo nesta rodada. */
  marked: SweptSubscription[];
  /**
   * Candidatas que a guarda idempotente recusou (já carimbadas, ou em estado
   * terminal). Contadas, não listadas: é o caso NORMAL de toda rodada depois da
   * primeira, e listá-las encheria o log de ruído.
   */
  skipped: number;
  /** Falhas por assinatura — uma linha ruim não derruba a varredura. */
  errors: number;
}

/**
 * Cliente de banco aceito pela varredura — só os DOIS métodos que ela de fato
 * chama, no mesmo espírito de `SubscriptionDbClient` (`src/lib/subscription.ts`)
 * e de `ReadDeps` (`dunning-event.service.ts`).
 *
 * 🔑 Estreito de propósito. Exigir `typeof prisma` inteiro obrigaria todo teste
 * a montar um objeto gigante ou a calar o compilador com `as never` — e foi
 * exatamente assim que um typo já passou compilando neste repo. Com esta
 * interface, tanto o `prisma` real quanto um duplo de teste satisfazem por
 * ESTRUTURA, com a checagem de tipos ligada no `where` e no `data`.
 */
export type SweepDbClient = {
  billingObligation: { findMany: typeof defaultPrisma.billingObligation.findMany };
  subscription: { updateMany: typeof defaultPrisma.subscription.updateMany };
};

export interface SweepDeps {
  prismaClient?: SweepDbClient;
  now?: Date;
}

/**
 * Estados de assinatura em que uma dívida vencida ainda pode VIRAR
 * inadimplência.
 *
 * `SUSPENDED`/`CANCELED` ficam de fora pelo mesmo motivo do webhook
 * (`route.ts:642`): são terminais da régua e ressuscitá-los para `PAST_DUE`
 * regrediria o estado, fazendo o cron re-suspender e re-notificar o admin a
 * cada rodada. `TRIAL_EXPIRED` também fica de fora — quem nunca converteu não
 * tem mensalidade vencida; a obrigação dele, se existir, é problema de outra
 * entrega.
 */
const MARKABLE_STATUSES = ["ACTIVE", "PAST_DUE", "TRIAL"] as const;

/**
 * Carimba `pastDueSince` em quem tem obrigação EMITIDA e VENCIDA e ainda não
 * foi reconhecido como inadimplente.
 *
 * 🔑 **`pastDueSince` recebe o `dueAt` da obrigação, NUNCA `now()`.** Se
 * recebesse `now()`, cada rodada que encontrasse a mesma dívida reiniciaria o
 * relógio da régua e o cliente jamais chegaria aos 14 dias — a inadimplência
 * seria eterna e inconsequente. O carimbo tem que dizer QUANDO a dívida
 * começou, e isso é o vencimento, não o instante da varredura. (Na prática a
 * guarda `pastDueSince: null` já impede a segunda escrita; usar `dueAt` é o que
 * torna a régua correta mesmo se a guarda for afrouxada um dia, e o que faz um
 * atraso de 20 dias descoberto hoje valer 20 dias, não zero.)
 *
 * 🔑 **Só obrigação `CHARGE` conta.** `COURTESY`, `INTERNAL` e `LEGACY_WAIVED`
 * são isentas: nascem `PAID` e nunca deveriam ter `dueAt`, mas o bootstrap e as
 * ferramentas manuais escrevem `disposition` à mão e uma linha isenta com
 * `dueAt` no passado É possível. Carimbar inadimplência por uma cortesia seria
 * cobrar exatamente quem o dono isentou. O filtro de `state: "ISSUED"` já
 * exclui as isentas criadas pelo motor (que nascem `PAID`), mas os dois filtros
 * juntos são o que fecha a porta para a escrita manual.
 *
 * 🔑 **Guarda idempotente `pastDueSince: null`**, o mesmo padrão do webhook: não
 * reseta o relógio de dunning de quem já está na régua, e não ressuscita estado
 * terminal.
 *
 * 🔑 **NUNCA LANÇA.** É chamado de dentro de um cron que decide suspensão e
 * cancelamento; uma exceção aqui derrubaria a régua inteira por causa de uma
 * linha ruim. Toda falha vira `errors++` e a varredura segue.
 */
export async function sweepOverdueObligations(deps: SweepDeps = {}): Promise<SweepResult> {
  const prisma = deps.prismaClient ?? defaultPrisma;
  const now = deps.now ?? new Date();

  const result: SweepResult = { marked: [], skipped: 0, errors: 0 };

  let candidates: Array<{
    id: string;
    dueAt: Date | null;
    subscriptionId: string;
    subscription: { id: string; companyId: string };
  }>;

  try {
    // I1 lido do banco: obrigação EMITIDA (`ISSUED`) com `dueAt` no PASSADO.
    // `PLANNED` não conta — dívida não emitida é dívida que ninguém foi cobrado
    // por, e restringir/marcar por ela puniria o cliente pela nossa falha de
    // emissão. `PAID`/`VOID` estão liquidadas por definição.
    //
    // ⚠️ MULTI-TENANT: `billing_obligations` NÃO tem `companyId` — o tenant é
    // transitivo por `subscriptionId`. Por isso a varredura desce até
    // `subscription.companyId` no `select`, e é ele que vai para o log e para o
    // resultado. Nenhum consumidor precisa reabrir o banco para descobrir de
    // quem é a dívida.
    candidates = await prisma.billingObligation.findMany({
      where: {
        state: "ISSUED",
        disposition: "CHARGE",
        dueAt: { lt: now },
        subscription: {
          pastDueSince: null,
          status: { in: [...MARKABLE_STATUSES] },
        },
      },
      // Mais antiga primeiro: se uma assinatura tem DUAS obrigações vencidas, o
      // carimbo tem que ser o da PRIMEIRA. Marcar pela mais recente encurtaria a
      // dívida e daria ao cliente dias de escrita que ele não tem.
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        dueAt: true,
        subscriptionId: true,
        subscription: { select: { id: true, companyId: true } },
      },
    });
  } catch (error) {
    // A varredura é ADITIVA: se ela não roda, o comportamento é exatamente o de
    // antes desta entrega (só o webhook cria inadimplência). Falhar aqui não
    // pode derrubar a régua de quem já está marcado.
    log.error("Falha ao listar obrigações vencidas — varredura pulada nesta rodada", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...result, errors: 1 };
  }

  // Uma assinatura pode ter várias obrigações vencidas; só a mais antiga
  // interessa (a lista já vem ordenada por `dueAt` ascendente).
  const firstOverdueBySubscription = new Map<string, (typeof candidates)[number]>();
  for (const obligation of candidates) {
    if (!obligation.dueAt) continue; // impossível pelo WHERE; barato de garantir
    if (!firstOverdueBySubscription.has(obligation.subscriptionId)) {
      firstOverdueBySubscription.set(obligation.subscriptionId, obligation);
    }
  }

  for (const obligation of firstOverdueBySubscription.values()) {
    const dueAt = obligation.dueAt;
    if (!dueAt) continue;

    try {
      // CAS: o WHERE repete as guardas do `findMany` porque entre a leitura e
      // esta escrita o webhook pode ter marcado, o admin pode ter recuperado, e
      // o cron pode ter suspendido. `updateMany` (não `update`) é idempotente
      // sob concorrência: a segunda escrita altera 0 linhas em vez de estourar.
      const written = await prisma.subscription.updateMany({
        where: {
          id: obligation.subscriptionId,
          pastDueSince: null,
          status: { notIn: ["SUSPENDED", "CANCELED"] },
        },
        data: { status: "PAST_DUE", pastDueSince: dueAt },
      });

      if (written.count === 0) {
        result.skipped++;
        continue;
      }

      result.marked.push({
        subscriptionId: obligation.subscriptionId,
        companyId: obligation.subscription.companyId,
        pastDueSince: dueAt,
      });

      log.warn("Obrigação vencida sem passar pelo gateway — inadimplência carimbada", {
        subscriptionId: obligation.subscriptionId,
        companyId: obligation.subscription.companyId,
        obligationId: obligation.id,
        dueAt: dueAt.toISOString(),
      });
    } catch (error) {
      result.errors++;
      log.error("Falha ao carimbar inadimplência de uma assinatura (varredura segue)", {
        subscriptionId: obligation.subscriptionId,
        obligationId: obligation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
