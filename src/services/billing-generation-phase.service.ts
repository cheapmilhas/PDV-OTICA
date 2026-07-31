import { prisma as defaultPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { captureMessage } from "@/lib/sentry";
import { isContiguous, type Period } from "@/lib/billing-clock";
import {
  isObligationGenerationEnabled,
  isShadowModeEnabled,
} from "@/lib/billing-engine-flags";
import {
  runObligationsForCompanies,
  type BatchEntry,
  type ObligationDeps,
} from "@/services/billing-obligation.service";
import {
  runShadowForCompanies,
  type ShadowDeps,
  type ShadowReport,
} from "@/services/billing-shadow.service";

const log = logger.child({ service: "billing-generation-phase" });

/**
 * A FASE DE GERAÇÃO do cron de cobrança (Plano B, Task 7).
 *
 * Até aqui `runObligationsForCompanies` e `runShadowForCompanies` não tinham
 * chamador nenhum: o motor e o sombra eram código morto. Este módulo é o
 * chamador — e existe como ARQUIVO SEPARADO, não como mais um trecho dentro de
 * `invoice-reminders.service.ts`, por três razões:
 *
 * 1. **Posicionamento.** `runInvoiceReminders` tem um early return no topo
 *    (`invoiceGenerationEnabled`, de `SaasEmailConfig`) e a fase de geração TEM
 *    que ficar antes dele — ver a nota grande em `runGenerationPhase`. Um módulo
 *    à parte torna a ordem explícita na chamada, em vez de depender de alguém
 *    lembrar de não mover trinta linhas para baixo.
 * 2. **Flags independentes.** Geração, sombra, emissão e enforcement são quatro
 *    chaves separadas (`billing-engine-flags.ts`); nenhuma delas é
 *    `invoiceGenerationEnabled`. Misturar as duas famílias no mesmo arquivo é
 *    como o acoplamento nasce.
 * 3. **Testabilidade sem gateway.** O Asaas é produção SEM sandbox. Este módulo
 *    recebe o motor e o sombra por injeção, então a suíte exercita a ORDEM e a
 *    telemetria sem que exista caminho até `ensureInvoiceCharge`.
 *
 * ## O que esta fase NÃO faz
 *
 * Não decide quem é cobrado nem quanto — isso é dos serviços que ela chama. Ela
 * só responde a "quem entra no lote", "em que ordem as fases rodam" e "o que o
 * operador lê no fim". Nenhuma linha aqui fala com o gateway.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Telemetria
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O resumo da fase de geração, embutido no `RunSummary` do cron.
 *
 * 🔑 `semAncora` é contado SEPARADO de `falhas`, e essa separação é o ponto.
 * Hoje, pré-bootstrap, TODA assinatura devolve `skipped/needs_bootstrap`: são 16
 * linhas por rodada que NÃO são erro nenhum — são o motor se recusando a
 * adivinhar onde a linha do tempo começa. Somá-las a `falhas` faria o cron
 * reportar 16 erros por dia para sempre, o operador aprenderia a ignorar o
 * número, e o dia em que um erro REAL aparecesse ele estaria escondido no meio
 * do ruído que a gente mesmo criou.
 *
 * A distinção que o resumo faz é exatamente a que o plano pede: "não há o que
 * cobrar" (`nadaAFazer`) ≠ "não sei quem é essa gente" (`semAncora`).
 */
export interface GenerationSummary {
  /** Empresas que entraram no lote desta rodada. */
  avaliadas: number;
  /** Obrigações materializadas agora (`created: true`). */
  criadas: number;
  /** Cobranças que chegaram ao gateway nesta rodada. */
  emitidas: number;
  /** Obrigações isentas quitadas no ato (cortesia, conta interna). */
  quitadas: number;
  /**
   * 🚨 SEM ÂNCORA — o bootstrap não rodou para estas assinaturas. NÃO é erro:
   * é o estado normal e esperado de hoje. Contado à parte para não virar ruído.
   */
  semAncora: number;
  /**
   * Nada a fazer: período seguinte fora do horizonte, já liquidada, sem
   * assinatura viva, ciclo gerenciado pelo Asaas, emissão não liberada. Também
   * não é erro.
   */
  nadaAFazer: number;
  /** Falhas de verdade — as que merecem olho humano. */
  falhas: number;
  /** Motivo → contagem, para o log dizer O QUE aconteceu, não só quantos. */
  porMotivo: Record<string, number>;
  /** `null` quando a etapa 1 está desligada — o motor nem abriu conexão. */
  skipped: "generation_disabled" | null;
  /** Buracos na linha do tempo detectados nesta rodada (alarme, não bloqueio). */
  descontinuidades: number;
  /** Resumo do modo sombra, quando a etapa 3 está ligada. */
  sombra: { avaliadas: number; cobraria: number; totalCents: number } | null;
}

export interface GenerationDeps {
  prismaClient?: typeof defaultPrisma;
  isGenerationEnabledFn?: typeof isObligationGenerationEnabled;
  isShadowEnabledFn?: typeof isShadowModeEnabled;
  runObligationsFn?: typeof runObligationsForCompanies;
  runShadowFn?: typeof runShadowForCompanies;
  obligationDeps?: ObligationDeps;
  shadowDeps?: ShadowDeps;
  now?: Date;
}

/**
 * Motivos que representam AUSÊNCIA de trabalho, não defeito.
 *
 * `needs_bootstrap` fica de fora de propósito — ele tem contador próprio
 * (`semAncora`) porque é o único que hoje vale para 100% da base e porque a ação
 * do operador é diferente: os outros pedem espera, este pede o bootstrap.
 */
const SEM_TRABALHO = new Set([
  "outside_horizon",
  "already_settled",
  "no_effective_subscription",
  "native_asaas_subscription",
  "issuance_not_enabled",
  "courtesy",
  "internal",
  "generation_disabled",
]);

// ─────────────────────────────────────────────────────────────────────────────
// A fase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roda a geração de obrigações e, se ligado, o modo sombra.
 *
 * 🚨 **A POSIÇÃO É A GARANTIA — esta função é chamada ANTES do early return de
 * `invoiceGenerationEnabled` em `runInvoiceReminders`.**
 *
 * `invoiceGenerationEnabled` mora em `SaasEmailConfig`, nasce `false` e é
 * editada numa tela intitulada "E-mails". Se a fase de geração ficasse DEPOIS
 * daquele `return`, o motor de cobrança inteiro — as quatro etapas do rollout —
 * ficaria refém de um botão de e-mail: desligar lembretes desligaria o
 * faturamento do SaaS, em silêncio, e ninguém relacionaria as duas coisas.
 * `billing-engine-flags.ts` rejeita esse acoplamento explicitamente, e é por
 * isso que as quatro chaves são env var. A ordem no chamador é o que faz a
 * rejeição valer na prática.
 *
 * A ordem em relação às fases ANTIGAS (Passo 1 do plano) também é deliberada: a
 * geração vem primeiro para que uma fatura criada agora já seja pega pelo
 * lembrete do MESMO tick, em vez de esperar 24h pela rodada seguinte.
 *
 * 🔑 NUNCA LANÇA. É chamada no topo de um cron que também manda lembretes; uma
 * exceção aqui apagaria as fases A e B junto. Motor e sombra já prometem não
 * lançar por empresa, mas a promessa deles não cobre uma falha na LISTAGEM das
 * empresas — e é essa que o try/catch daqui isola.
 */
export async function runGenerationPhase(
  deps: GenerationDeps = {},
): Promise<GenerationSummary> {
  const prisma = deps.prismaClient ?? defaultPrisma;
  const isGenerationEnabled = deps.isGenerationEnabledFn ?? isObligationGenerationEnabled;
  const isShadowEnabled = deps.isShadowEnabledFn ?? isShadowModeEnabled;
  const runObligations = deps.runObligationsFn ?? runObligationsForCompanies;
  const runShadow = deps.runShadowFn ?? runShadowForCompanies;
  const now = deps.now ?? new Date();

  const summary = emptySummary();

  // 🔑 Sombra e geração são flags INDEPENDENTES, e as quatro combinações são
  // estados legítimos do rollout:
  //
  //   ambas OFF   → nada acontece (o de hoje);
  //   só sombra   → o dono lê o relatório antes de deixar o motor escrever;
  //   só geração  → o motor materializa a linha do tempo sem diagnóstico;
  //   ambas ON    → a rodada mede E materializa.
  //
  // Na última, a ORDEM importa: o sombra roda DEPOIS da geração de propósito.
  // Rodando antes, ele relataria o estado ANTERIOR à rodada — diria "cobraria"
  // sobre um período que o motor acabou de materializar na mesma execução, e o
  // dono compararia relatório e banco sem nunca fecharem. Depois, o relatório
  // descreve o mundo que ficou.
  if (!isGenerationEnabled()) {
    summary.skipped = "generation_disabled";
    // Mesmo com a geração desligada o sombra pode rodar: é justamente para isso
    // que ele existe (medir ANTES de ligar o motor). Ver a lista de combinações
    // acima — travar o sombra atrás da geração inverteria a ordem do rollout.
    summary.sombra = await runShadowPhase({
      prisma,
      isShadowEnabled,
      runShadow,
      shadowDeps: deps.shadowDeps,
      now,
      summary,
    });
    return summary;
  }

  let companyIds: string[];
  try {
    companyIds = await listCompanyIds(prisma);
  } catch (error) {
    // Falha na LISTAGEM: o lote nem começou. Não há empresa a atribuir, então
    // isto é uma falha da rodada, não de ninguém — e é o único caminho que o
    // contrato "nunca lança" do motor não cobre.
    summary.falhas++;
    summary.porMotivo.listagem_falhou = 1;
    log.error("Falha ao listar empresas da fase de geração — rodada pulada", {
      error: error instanceof Error ? error.message : String(error),
    });
    return summary;
  }

  summary.avaliadas = companyIds.length;

  // 🔑 O TETO DE UMA OBRIGAÇÃO POR ASSINATURA POR RODADA (Passo 2) já é
  // ESTRUTURAL no motor, e por isso NÃO é reimplementado aqui.
  //
  // `runObligationForCompany` chama `resolveNextObligationPlan` UMA vez por
  // empresa e a função devolve UM plano — não uma lista. Somado a isso, a
  // precedência "trabalho pendente antes de trabalho novo" faz uma `PLANNED`
  // existente ser retomada em vez de gerar período novo, e o horizonte de
  // `ISSUE_LEAD_DAYS` recusa qualquer período que comece a mais de 5 dias. As
  // três regras juntas dão exatamente a recuperação gradual que o plano pede:
  // uma obrigação por assinatura por rodada, em ordem de `sequence` ascendente,
  // nunca cobrando o mês 5 antes do mês 3.
  //
  // Acrescentar um contador aqui seria um segundo teto medindo a mesma coisa —
  // e um segundo teto que discordasse do primeiro viraria um bug silencioso com
  // duas fontes de verdade. Um teste desta suíte prova o teto rodando o motor
  // real (com banco falso) seis vezes seguidas.
  const entries = await runObligations(companyIds, {
    ...deps.obligationDeps,
    now,
  });

  tallyOutcomes(entries, summary);

  // Detector de descontinuidade (Passo 4) — ALARME, nunca bloqueio. Roda depois
  // da geração para enxergar o buraco que a rodada de hoje eventualmente criou.
  summary.descontinuidades = await detectGaps(prisma);

  summary.sombra = await runShadowPhase({
    prisma,
    isShadowEnabled,
    runShadow,
    shadowDeps: deps.shadowDeps,
    now,
    summary,
  });

  log.info("Fase de geração concluída", {
    avaliadas: summary.avaliadas,
    criadas: summary.criadas,
    emitidas: summary.emitidas,
    quitadas: summary.quitadas,
    semAncora: summary.semAncora,
    nadaAFazer: summary.nadaAFazer,
    falhas: summary.falhas,
    descontinuidades: summary.descontinuidades,
    porMotivo: summary.porMotivo,
  });

  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contagem dos desfechos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Traduz os desfechos do motor em números que o operador consegue agir.
 *
 * 🔑 `needs_bootstrap` NÃO É ERRO e não vai para o log de erro. Ele é o estado
 * de 100% da base hoje; tratá-lo como falha encheria o log com 16 linhas
 * vermelhas por rodada, todo dia, até o bootstrap rodar. Um log que grita todo
 * dia sobre o esperado é um log que ninguém lê no dia do inesperado.
 *
 * O que ele ganha é UMA linha de `info` por rodada, com a contagem agregada —
 * suficiente para o operador ver que o bootstrap continua pendente, insuficiente
 * para virar ruído.
 */
function tallyOutcomes(entries: BatchEntry[], summary: GenerationSummary): void {
  for (const { companyId, outcome } of entries) {
    const motivo = motivoDe(outcome);
    summary.porMotivo[motivo] = (summary.porMotivo[motivo] ?? 0) + 1;

    switch (outcome.kind) {
      case "issued":
        summary.emitidas++;
        break;
      case "planned":
        if (outcome.created) summary.criadas++;
        break;
      case "settled":
        summary.quitadas++;
        if (outcome.created) summary.criadas++;
        break;
      case "skipped":
        if (outcome.reason === "needs_bootstrap") {
          summary.semAncora++;
        } else if (SEM_TRABALHO.has(outcome.reason)) {
          summary.nadaAFazer++;
        } else {
          // Motivo de `skipped` que não está em nenhuma das duas listas: um
          // valor NOVO acrescentado ao enum sem passar por aqui. Conta como
          // falha de propósito — o desconhecido aparece, não desaparece.
          summary.falhas++;
          log.warn("Motivo de skip não classificado na fase de geração", {
            companyId,
            reason: outcome.reason,
          });
        }
        break;
      case "failed":
        summary.falhas++;
        log.error("Motor de obrigação falhou para uma empresa", {
          companyId,
          reason: outcome.reason,
          detail: outcome.detail,
          retryable: outcome.retryable,
        });
        break;
    }
  }

  if (summary.semAncora > 0) {
    // UMA linha por rodada, `info`, agregada. Ver a docstring acima.
    log.info("Assinaturas sem âncora de período (bootstrap pendente)", {
      semAncora: summary.semAncora,
      de: entries.length,
      nota: "estado NORMAL antes do bootstrap — não é erro e não bloqueia nada",
    });
  }
}

function motivoDe(outcome: BatchEntry["outcome"]): string {
  switch (outcome.kind) {
    case "skipped":
      return outcome.reason;
    case "failed":
      return outcome.reason;
    case "issued":
      return "issued";
    case "planned":
      return outcome.created ? "planned_created" : "planned_existing";
    case "settled":
      return "settled";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Passo 4 — detector de descontinuidade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buraco na linha do tempo de alguma assinatura?
 *
 * 🔑 **ALARME, NÃO BLOQUEIO** — a decisão que o plano pede explicitamente. Um
 * buraco entre a obrigação 3 e a 5 significa que um mês não foi materializado,
 * ou que uma linha sumiu. É informação para o operador, e não pode PARAR a
 * cobrança dos outros: bloquear transformaria "uma assinatura com histórico
 * torto" em "ninguém foi cobrado este mês", que é o modo de falha mais caro
 * desta cadeia inteira.
 *
 * ## Por que Sentry (`captureMessage`) e não `AdminNotification`
 *
 * 1. **`AdminNotificationType` é um enum do Postgres e não tem valor para isto.**
 *    Os nove existentes são de negócio (`INVOICE_OVERDUE`, `TRIAL_EXPIRING`,
 *    `HEALTH_CRITICAL`…); reusar `HEALTH_CRITICAL` para um buraco de sequência
 *    mentiria na tela do admin, e criar um valor novo exige migração — que esta
 *    task não pode fazer.
 * 2. **É violação de INVARIANTE, não evento de negócio.** O destinatário certo é
 *    quem depura o motor, não quem administra clientes. É exatamente o uso que
 *    `prisma-tenant-guard.ts` já dá ao `captureMessage` neste repo: invariante
 *    estrutural quebrada vira mensagem no Sentry, não linha no painel.
 * 3. **Não gera dívida de UI.** `AdminNotification` só existe de verdade se
 *    alguém abrir a tela; enquanto a Task 10 não existir, seria alarme num lugar
 *    onde ninguém olha.
 *
 * ⚠️ Custo aceito: sem `SENTRY_DSN` configurado, `captureMessage` é no-op. Por
 * isso o alarme SEMPRE também sai no log (`log.error`) e vai no resumo do cron
 * como `descontinuidades` — três destinos, para que a ausência de configuração
 * de um deles não apague o achado.
 *
 * 🔑 Só considera obrigações NÃO anuladas. `VOID` é período que foi
 * deliberadamente desfeito (duplicata do bootstrap, troca de plano); contá-la
 * faria toda anulação legítima virar alarme falso, e alarme falso recorrente é
 * como um detector deixa de ser lido.
 *
 * 🔑 NUNCA LANÇA: o detector é acessório. Falhar em detectar buraco não pode
 * derrubar a fase que acabou de materializar cobrança.
 */
async function detectGaps(prisma: typeof defaultPrisma): Promise<number> {
  let rows: Array<{ subscriptionId: string; periodStart: Date; periodEnd: Date }>;

  try {
    rows = await prisma.billingObligation.findMany({
      where: { state: { not: "VOID" } },
      // 🔑 A ORDEM É PRÉ-REQUISITO DA CORREÇÃO, não estilo. `isContiguous` NÃO
      // ordena — a docstring dela diz que assume a lista já ordenada por
      // `periodStart`. Sem este `orderBy`, o Postgres devolveria as linhas em
      // ordem física e uma linha do tempo PERFEITA apareceria como buraco:
      // alarme falso em toda rodada, para todo mundo.
      orderBy: [{ subscriptionId: "asc" }, { periodStart: "asc" }],
      select: { subscriptionId: true, periodStart: true, periodEnd: true },
    });
  } catch (error) {
    log.error("Falha ao ler obrigações para detectar descontinuidade (fase segue)", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }

  const porAssinatura = new Map<string, Period[]>();
  for (const row of rows) {
    const lista = porAssinatura.get(row.subscriptionId);
    const periodo: Period = { periodStart: row.periodStart, periodEnd: row.periodEnd };
    if (lista) lista.push(periodo);
    else porAssinatura.set(row.subscriptionId, [periodo]);
  }

  let descontinuas = 0;
  for (const [subscriptionId, periodos] of porAssinatura) {
    if (isContiguous(periodos)) continue;

    descontinuas++;

    // Três destinos, de propósito — ver a nota sobre `SENTRY_DSN` acima.
    log.error("DESCONTINUIDADE na linha do tempo de cobrança", {
      subscriptionId,
      periodos: periodos.length,
      primeiro: periodos[0]?.periodStart.toISOString(),
      ultimo: periodos[periodos.length - 1]?.periodEnd.toISOString(),
    });
    captureMessage("billing: descontinuidade na linha do tempo de obrigações", {
      level: "error",
      extra: {
        subscriptionId,
        periodos: periodos.map((p) => ({
          periodStart: p.periodStart.toISOString(),
          periodEnd: p.periodEnd.toISOString(),
        })),
      },
    });
  }

  return descontinuas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo sombra
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roda o modo sombra quando a etapa 3 está ligada.
 *
 * 🔑 A flag é consultada AQUI, antes de listar empresa nenhuma, além de ser
 * consultada de novo dentro de `runShadowForCompanies`. A checagem dupla não é
 * redundância inútil: sem a daqui, uma rodada com o sombra desligado ainda
 * pagaria a listagem de todas as empresas do banco para depois jogar fora.
 *
 * 🔑 NUNCA LANÇA. O sombra é DIAGNÓSTICO: falhar em medir não pode derrubar a
 * rodada que materializa cobrança de verdade.
 *
 * ⚠️ A trava estrutural do sombra (o teste que percorre o grafo de imports a
 * partir de `billing-shadow.service.ts` e falha se algo capaz de cobrar ficar
 * alcançável) segue INTACTA: a dependência que este arquivo cria aponta para
 * DENTRO do sombra, nunca para fora dele. O sombra não passou a importar nada —
 * quem importa é este módulo, que fica fora do grafo dele.
 */
async function runShadowPhase(ctx: {
  prisma: typeof defaultPrisma;
  isShadowEnabled: () => boolean;
  runShadow: typeof runShadowForCompanies;
  shadowDeps: ShadowDeps | undefined;
  now: Date;
  summary: GenerationSummary;
}): Promise<GenerationSummary["sombra"]> {
  if (!ctx.isShadowEnabled()) return null;

  try {
    const companyIds = await listCompanyIds(ctx.prisma);
    const report: ShadowReport = await ctx.runShadow(companyIds, {
      ...ctx.shadowDeps,
      now: ctx.now,
    });

    // O resumo LEGÍVEL vai inteiro para o log: é o produto desta etapa, e o dono
    // o lê antes de decidir ligar a emissão. Truncá-lo aqui obrigaria a abrir o
    // banco para ler o que já foi calculado.
    log.info("Modo sombra concluído", { resumo: report.resumo });

    return {
      avaliadas: report.avaliadas,
      cobraria: report.cobraria.empresas,
      totalCents: report.cobraria.totalCents,
    };
  } catch (error) {
    ctx.summary.falhas++;
    log.error("Modo sombra falhou (a fase de geração segue)", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auxiliares
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As empresas que entram no lote.
 *
 * 🔑 Filtra pela ASSINATURA, não pela empresa: `Company` não diz nada sobre
 * cobrança, e varrer todas as empresas do banco mandaria ao motor um monte de
 * `no_effective_subscription` que só serviria para inflar o resumo.
 *
 * 🔑 NÃO filtra por `status: ACTIVE` — de propósito, e ao contrário da fase A de
 * `runInvoiceReminders`. Quem está `PAST_DUE` continua tendo dívida a
 * materializar (é justamente quem mais tem), e quem está em `TRIAL` chega ao
 * fim do trial devendo o primeiro período. Quem NÃO entra é o terminal:
 * `CANCELED` e `TRIAL_EXPIRED` não geram período novo, e incluí-los faria o
 * motor materializar cobrança para quem saiu.
 *
 * `resolveEffectiveSubscription`, lá dentro, é quem decide de fato qual
 * assinatura vale — este filtro só evita carregar quem certamente não vale.
 */
async function listCompanyIds(prisma: typeof defaultPrisma): Promise<string[]> {
  const subs = await prisma.subscription.findMany({
    where: { status: { in: ["ACTIVE", "PAST_DUE", "SUSPENDED", "TRIAL"] } },
    select: { companyId: true },
    distinct: ["companyId"],
    // Ordem estável: o lote é sequencial e um `orderBy` fixo faz duas rodadas
    // processarem na mesma ordem, o que torna log e reprodução comparáveis.
    orderBy: { companyId: "asc" },
  });

  return subs.map((s) => s.companyId);
}

function emptySummary(): GenerationSummary {
  return {
    avaliadas: 0,
    criadas: 0,
    emitidas: 0,
    quitadas: 0,
    semAncora: 0,
    nadaAFazer: 0,
    falhas: 0,
    porMotivo: {},
    skipped: null,
    descontinuidades: 0,
    sombra: null,
  };
}
