import { prisma as defaultPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  decideObligationRecalc,
  type ContractChange,
  type RecalcAction,
} from "@/lib/obligation-recalc";

const log = logger.child({ service: "obligation-recalc" });

/**
 * Aplica a decisão de `@/lib/obligation-recalc` às obrigações de uma assinatura
 * quando o contrato muda (Task 9 do Plano B; spec §4.1.2 e §4.1.3).
 *
 * Chamado pelos três lugares que hoje mudam o contrato sem olhar para
 * `billing_obligations`:
 *   - troca de plano no painel (`admin/clientes/[id]/actions`, `change_plan`);
 *   - extensão de trial no painel (mesma rota, `extend_trial`);
 *   - troca de plano self-service do Domus (`domus-plan-change/deps.ts`,
 *     `applyLocal`).
 *
 * ## 🔑 NUNCA LANÇA, E ISSO É O CONTRATO
 *
 * As três chamadas acontecem DEPOIS de o contrato já estar commitado. Se este
 * módulo lançasse, a rota do admin devolveria 500 com o plano já trocado no
 * banco — o operador veria "erro" e clicaria de novo, e o pior desfecho de uma
 * troca de plano é o operador achando que ela não aconteceu. Toda falha vira
 * `{ kind: "failed" }` com motivo, mesmo espírito de
 * `runObligationForCompany`.
 *
 * ## 🔑 O QUE ELE NÃO FAZ
 *
 * Não calcula preço, não cria obrigação, não fala com o gateway e não anula
 * nada. O recálculo é um HANDOFF para a fase 2 do motor
 * (`billing-obligation.service.ts`, `reserveAttempt`), que é a única escritora
 * do preço de uma obrigação `PLANNED` e a única que roda sob o advisory lock da
 * empresa. Ver `RECALC_IS_A_HANDOFF` no módulo puro: uma segunda conta do mesmo
 * número aqui divergiria da do motor no primeiro reajuste.
 *
 * Também não importa nada da cadeia do gateway — nem transitivamente. Um teste
 * de grafo de imports trava essa fronteira para o modo sombra
 * (`billing-obligation.ts`); a mesma disciplina vale aqui: este módulo roda a
 * partir de uma rota de CRUD do painel e não pode ter caminho até o Asaas.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Contrato
// ─────────────────────────────────────────────────────────────────────────────

/** O que foi feito com UMA obrigação. */
export interface RecalcEntry {
  obligationId: string;
  sequence: number;
  action: RecalcAction["action"];
  reason: string;
}

export type RecalcOutcome =
  | {
      kind: "applied";
      /** Obrigações `PLANNED` cujo congelamento foi invalidado. */
      recalculadas: RecalcEntry[];
      /** 🚨 Obrigações já emitidas: preço mantido, decisão registrada, alerta criado. */
      mantidas: RecalcEntry[];
      /** Obrigações que a mudança não afeta. Contadas, não listadas (é o normal). */
      inalteradas: number;
    }
  | { kind: "failed"; detail: string };

/**
 * Cliente de banco aceito por este serviço — só o que ele de fato chama.
 *
 * 🔑 Estreito de propósito, mesmo padrão de `SweepDbClient`
 * (`overdue-obligation-sweep.service.ts`). Exigir `typeof prisma` inteiro
 * obrigaria todo teste a montar um objeto gigante ou a calar o compilador com
 * `as never` — e foi exatamente assim que um typo já passou compilando neste
 * repo. Aqui tanto o `prisma` real quanto um duplo de teste satisfazem por
 * ESTRUTURA, com a checagem de tipos ligada no `where` e no `data`.
 */
export type RecalcDbClient = {
  billingObligation: {
    findMany: typeof defaultPrisma.billingObligation.findMany;
    updateMany: typeof defaultPrisma.billingObligation.updateMany;
  };
  systemEvent: { upsert: typeof defaultPrisma.systemEvent.upsert };
};

/**
 * Sem `now` de propósito: este serviço não decide nada por relógio. Quem compara
 * datas é o módulo puro, e os valores que ele compara (`periodStart`,
 * `trialEndsAt`) vêm do banco e do chamador — nunca de "agora". Aceitar um `now`
 * injetável sugeriria uma dependência temporal que não existe.
 */
export interface RecalcDeps {
  prismaClient?: RecalcDbClient;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reavalia as obrigações EM ABERTO de uma assinatura contra a mudança de
 * contrato.
 *
 * @param subscriptionId Assinatura cujo contrato mudou.
 * @param companyId      Tenant. **Obrigatório**, ver a nota de escopo abaixo.
 * @param change         O que mudou (troca de plano ou extensão de trial).
 */
export async function applyContractChangeToObligations(
  subscriptionId: string,
  companyId: string,
  change: ContractChange,
  deps: RecalcDeps = {},
): Promise<RecalcOutcome> {
  const prisma = deps.prismaClient ?? defaultPrisma;

  try {
    // 🔑 ESCOPO DE TENANT. `billing_obligations` **não tem `companyId`** — o
    // tenant é transitivo por `subscriptionId`, e o padrão do repo é
    // `where: { subscription: { companyId } }`. Filtrar só por `subscriptionId`
    // "funcionaria" (o id é um cuid global), mas deixaria a rota do admin capaz
    // de reescrever obrigação de OUTRA empresa se algum dia o `subscriptionId`
    // chegasse de corpo de request em vez de leitura interna. A condição
    // redundante é a que transforma um bug futuro de roteamento em zero linhas
    // afetadas, em vez de escrita cross-tenant.
    //
    // Só o que está EM ABERTO: `PAID`/`VOID` são período encerrado e o módulo
    // puro os devolveria como `noop` de qualquer jeito — trazê-los só engordaria
    // o `inalteradas` com linhas antigas e faria a consulta crescer sem limite
    // ao longo dos anos.
    const abertas = await prisma.billingObligation.findMany({
      where: {
        subscriptionId,
        subscription: { companyId },
        state: { in: ["PLANNED", "ISSUED"] },
      },
      select: {
        id: true,
        sequence: true,
        state: true,
        disposition: true,
        planId: true,
        periodStart: true,
        periodEnd: true,
      },
      // Ordem estável por número contábil: o relatório do operador lê na mesma
      // ordem em que a linha do tempo aconteceu, e o teste consegue afirmar
      // sobre a lista sem depender da ordem que o Postgres devolveria.
      orderBy: { sequence: "asc" },
    });

    const recalculadas: RecalcEntry[] = [];
    const mantidas: RecalcEntry[] = [];
    let inalteradas = 0;

    for (const obligation of abertas) {
      const decision = decideObligationRecalc({ obligation, change });

      if (decision.action === "noop") {
        inalteradas += 1;
        continue;
      }

      const entry: RecalcEntry = {
        obligationId: obligation.id,
        sequence: obligation.sequence,
        action: decision.action,
        reason: decision.reason,
      };

      if (decision.action === "recalculate") {
        // 🔑 O QUE O RECÁLCULO ESCREVE — e o que ele deliberadamente NÃO escreve.
        //
        // NÃO escreve: `priceCents`, `planId`, `state`, `disposition`. Todos os
        // quatro são da fase 2 do motor, sob o advisory lock da empresa. Escrever
        // `priceCents` daqui (sem lock, a partir da rota do painel) poderia
        // sobrescrever o valor que uma rodada do cron acabou de reservar junto
        // com a `Invoice`, deixando obrigação e fatura afirmando números
        // diferentes — a divergência que a fase 2 gasta trinta linhas evitando.
        // Escrever `disposition` seria pior: uma isenta `PLANNED` trava a
        // assinatura para sempre.
        //
        // ESCREVE: `dueAt = null`. É o congelamento sendo invalidado. Uma
        // obrigação `PLANNED` só tem `dueAt` se uma reserva anterior o gravou; se
        // ele sobrevivesse a uma troca de plano, a obrigação carregaria um
        // vencimento calculado para um contrato que já não existe — e `dueAt` no
        // passado com `state = ISSUED` é o gatilho EXATO de I1. Zerá-lo mantém a
        // linha incapaz de restringir ninguém até a fase 2 recarimbar tudo junto.
        //
        // CAS em `state: "PLANNED"`: entre a leitura e esta escrita o cron pode
        // ter emitido a obrigação. Um `update` cego apagaria o `dueAt` de uma
        // cobrança que já foi ao gateway — o cliente teria PIX na mão e o sistema
        // não saberia mais quando ela vence. `count === 0` aqui significa "ela
        // saiu de PLANNED no meio do caminho", e o caminho honesto é tratá-la
        // como emitida: mantém e alerta.
        const alterada = await prisma.billingObligation.updateMany({
          where: { id: obligation.id, state: "PLANNED" },
          data: { dueAt: null },
        });

        if (alterada.count === 0) {
          const detail =
            `obrigação ${obligation.id} saiu de PLANNED durante a troca de contrato — ` +
            `tratada como já emitida`;
          await alertar(prisma, companyId, obligation.id, detail, change);
          mantidas.push({ ...entry, action: "keep_and_alert", reason: detail });
          continue;
        }

        log.info("Obrigação não emitida invalidada — a fase 2 refaz a conta", {
          companyId,
          subscriptionId,
          obligationId: obligation.id,
          change: change.kind,
        });
        recalculadas.push(entry);
        continue;
      }

      // `keep_and_alert`: a cobrança existe no gateway. Registra a decisão
      // explícita que a spec §4.1.2 exige e ALERTA. Nada mais é tocado —
      // nem preço, nem estado. Ver `WHY_ISSUED_IS_NEVER_TOUCHED_AUTOMATICALLY`.
      //
      // CAS em `state: "ISSUED"` pelo mesmo motivo do outro ramo: se o webhook
      // marcou paga no intervalo, o período está encerrado e carimbar um
      // `voidReason` numa linha `PAID` só confundiria a leitura da Task 10. Aqui
      // `count === 0` NÃO vira alerta: "pagou no meio do caminho" é desfecho bom.
      const registrada = await prisma.billingObligation.updateMany({
        where: { id: obligation.id, state: "ISSUED" },
        data: { voidReason: decision.voidReason },
      });

      if (registrada.count === 0) {
        inalteradas += 1;
        continue;
      }

      await alertar(prisma, companyId, obligation.id, decision.reason, change);
      log.warn("Obrigação JÁ EMITIDA afetada pela mudança de contrato", {
        companyId,
        subscriptionId,
        obligationId: obligation.id,
        change: change.kind,
        decisao: decision.voidReason,
      });
      mantidas.push(entry);
    }

    return { kind: "applied", recalculadas, mantidas, inalteradas };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error("Falha ao reavaliar obrigações após mudança de contrato", {
      companyId,
      subscriptionId,
      change: change.kind,
      detail,
    });
    return { kind: "failed", detail };
  }
}

/**
 * Alerta o operador sobre uma cobrança já emitida que a mudança de contrato não
 * pode corrigir sozinha.
 *
 * `severity: "critical"` e `source: "billing"` seguindo o precedente de
 * `markFinancialTerminalAndAlert` (`domus-plan-change/deps.ts`): a `dedupeKey`
 * NÃO termina em `:auto`, justamente para que o cron de saúde não a auto-resolva
 * — isto exige um humano decidindo se cancela a cobrança no gateway, se cobra a
 * diferença ou se deixa como está.
 *
 * A chave inclui o `kind` da mudança: uma troca de plano e uma extensão de trial
 * sobre a MESMA obrigação são dois problemas diferentes para o operador resolver,
 * e colapsá-los numa chave só esconderia o segundo. Duas trocas de plano seguidas
 * sobre a mesma obrigação, essas sim, são o mesmo problema — e o `upsert` as
 * dedupa, como deve.
 *
 * ⚠️ Best-effort: falha ao alertar NÃO desfaz o `voidReason` já gravado. Perder o
 * alerta é ruim; perder o registro da decisão seria pior, porque a linha ficaria
 * sem nenhum rastro de que alguém mudou o contrato por cima dela.
 */
async function alertar(
  prisma: RecalcDbClient,
  companyId: string,
  obligationId: string,
  detail: string,
  change: ContractChange,
): Promise<void> {
  const dedupeKey = `billing:obligation-recalc:${obligationId}:${change.kind}`;
  try {
    await prisma.systemEvent.upsert({
      where: { dedupeKey },
      create: {
        source: "billing",
        severity: "critical",
        title:
          change.kind === "plan_change"
            ? "Troca de plano sobre cobrança já emitida"
            : "Trial estendido sobre cobrança já emitida",
        detail: `Empresa ${companyId}: ${detail}`,
        dedupeKey,
      },
      update: {},
    });
  } catch (error) {
    log.error("Falha ao criar alerta de obrigação emitida (decisão já registrada)", {
      companyId,
      obligationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
