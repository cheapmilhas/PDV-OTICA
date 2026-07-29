import type { BillingCycle } from "@prisma/client";

/**
 * Aritmética PURA de calendário para encadear períodos de cobrança.
 *
 * Existe porque `trial-conversion-charge.ts` usa `setMonth` cru, que ESTOURA
 * o mês em vez de clampear (31/01 + 1 mês vira 03/03, não 28/02). Esse módulo
 * é a versão correta dessa conta, usada pelo motor que precisa saber "qual é
 * o próximo período" mês após mês, sem acumular esse tipo de erro.
 *
 * Tudo em UTC (`Date.UTC`, `getUTC*`) — nunca hora local, que varia por fuso
 * do processo. Nunca lê o relógio (`new Date()` sem argumento): todo dado
 * vem de fora, para o módulo ser exercitável sem depender de "agora".
 */

export interface NextPeriodInput {
  /** Fim do período anterior. Também é o início do novo — ver nota abaixo. */
  previousEnd: Date;
  cycle: BillingCycle;
}

export interface Period {
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Quantos meses cada ciclo avança.
 *
 * É um `Record<BillingCycle, number>` — e não um `cycle === "YEARLY" ? 12 : 1` —
 * de propósito. Com o ternário, adicionar um valor ao enum `BillingCycle` no
 * schema (ex.: `QUARTERLY`) compilaria em silêncio e o motor faturaria o
 * trimestral como MENSAL: um terço do devido, sem erro, sem log, sem teste
 * vermelho. Com o Record, o mesmo dia vira erro de compilação (TS2741,
 * "Property 'QUARTERLY' is missing"), obrigando quem mexer no enum a decidir
 * aqui quantos meses o ciclo novo avança.
 *
 * Não é hipótese remota: `recurring-expenses` já opera com MONTHLY/BIMONTHLY/
 * QUARTERLY/YEARLY.
 */
const MONTHS_BY_CYCLE: Record<BillingCycle, number> = {
  MONTHLY: 1,
  YEARLY: 12,
};

/**
 * Próximo período de cobrança, encadeado a partir do FIM do anterior.
 *
 * 🔑 Duas regras de sobrevivência:
 *
 * - `periodStart = previousEnd`, NUNCA "agora". Encadear a partir do relógio
 *   de parede causaria *drift*: cada execução do cron atrasaria o período em
 *   segundos/horas, e ao longo de meses o cliente ganharia ou perderia dias
 *   de cobrança. O período sempre encadeia do fim do anterior — por isso a
 *   função nem recebe "now" como parâmetro.
 *
 * - Intervalo semiaberto `[periodStart, periodEnd)`: o fim de um período é
 *   exatamente o início do próximo. Sem essa igualdade, `isContiguous`
 *   também quebra (ver abaixo).
 *
 * Fim de mês: a "âncora" é o dia-do-mês de `previousEnd`. Se esse dia não
 * existe no mês de destino (ex.: dia 31 num mês de 30, ou 29/02 fora de ano
 * bissexto), usa o ÚLTIMO dia desse mês — nunca estoura pro mês seguinte
 * como `setMonth` cru faria.
 *
 * ⚠️ Decisão de design sobre encadeamento longo: a âncora NÃO é preservada
 * através de um clamp. Ou seja, 31/01 → 28/02 → 28/03 (não 31/03). A função
 * só recebe `previousEnd` — o valor "31" já não existe mais depois que
 * 28/02 foi calculado, então não há como o próximo passo "lembrar" dele sem
 * um parâmetro adicional (ex.: um `anchorDay` carregado à parte pelo
 * chamador) que está fora do contrato desta task. Ver ressalva no relatório
 * da Task 2 — se o produto quiser preservar a âncora original indefinidamente,
 * isso exige um campo persistido, não só aritmética pura.
 */
export function nextPeriod(input: NextPeriodInput): Period {
  const { previousEnd, cycle } = input;

  // `previousEnd` vem do banco (fim do período anterior). Uma Date inválida se
  // propagaria como NaN por toda a aritmética e produziria um período
  // "Invalid Date" — que o Prisma aceitaria gravar como null/erro tardio, longe
  // da causa. Falha aqui, alto e claro.
  if (Number.isNaN(previousEnd.getTime())) {
    throw new Error("billing-clock: previousEnd é uma data inválida");
  }

  // A tabela é exaustiva em tempo de compilação, mas `cycle` pode chegar de uma
  // linha do banco gravada antes de um deploy que reverteu o enum. Sem esta
  // guarda, o lookup daria `undefined` e a conta viraria NaN silencioso.
  const monthsToAdd = MONTHS_BY_CYCLE[cycle];
  if (monthsToAdd === undefined) {
    throw new Error(`billing-clock: ciclo de cobrança não suportado: ${String(cycle)}`);
  }

  const periodStart = new Date(previousEnd);

  const anchorDay = previousEnd.getUTCDate();
  const year = previousEnd.getUTCFullYear();
  const month = previousEnd.getUTCMonth();
  const targetYear = year + Math.floor((month + monthsToAdd) / 12);
  const targetMonth = (month + monthsToAdd) % 12;

  const periodEnd = new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      lastValidDay(targetYear, targetMonth, anchorDay),
      previousEnd.getUTCHours(),
      previousEnd.getUTCMinutes(),
      previousEnd.getUTCSeconds(),
      previousEnd.getUTCMilliseconds(),
    ),
  );

  return { periodStart, periodEnd };
}

/**
 * `day` se o mês (0-indexado) tiver esse dia, senão o último dia do mês.
 *
 * `Date.UTC(year, month, 0)` é o truque padrão para "último dia do mês
 * anterior" — por isso `month + 1` aqui aponta para o mês seguinte ao alvo,
 * e o dia 0 desse mês seguinte é o último dia do mês alvo.
 */
function lastValidDay(year: number, month: number, day: number): number {
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.min(day, lastDayOfMonth);
}

/**
 * Verdadeiro se a sequência de períodos não tem buraco NEM sobreposição:
 * o fim de cada um deve ser EXATAMENTE igual ao início do próximo.
 *
 * Existe para o motor de cobrança detectar obrigações faltando ou duplicadas
 * na linha do tempo de uma assinatura — a Task 7 transforma um `false` daqui
 * em alarme operacional.
 *
 * Lista vazia ou de um elemento só é contígua por vacuidade (nada para
 * comparar). Assume que `periods` já vem ordenada por `periodStart` — esta
 * função não ordena, só verifica adjacência.
 */
export function isContiguous(periods: Period[]): boolean {
  for (let i = 1; i < periods.length; i++) {
    const previous = periods[i - 1];
    const current = periods[i];
    if (previous.periodEnd.getTime() !== current.periodStart.getTime()) {
      return false;
    }
  }
  return true;
}
