/**
 * N4 — conversão de trial. Lógica PURA, testável sem banco.
 *
 * Responde: "os trials estão virando cliente pagante?". Mora aqui, e não no
 * server component, porque cada regra abaixo é uma forma conhecida de a métrica
 * MENTIR — e mentira em métrica não dá erro, só decisão errada.
 *
 * 🔑 A unidade é a ASSINATURA-TRIAL, não a empresa (decisão do dono 2026-07-27).
 * Uma empresa pode ter várias assinaturas (`Subscription` tem índice em
 * companyId, NÃO unique). Contar por empresa esconderia a tentativa que falhou
 * de quem trialou duas vezes. Rotular na UI como "trials convertidos".
 */
import { TIMEZONE } from "@/lib/date-utils";
import { formatInTimeZone } from "date-fns-tz";

/** Dados mínimos de uma assinatura para a métrica de conversão. */
export interface SubscriptionForTrial {
  id: string;
  companyId: string;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  /** Instante da PRIMEIRA ativação. Ver ressalva sobre a fonte no README abaixo. */
  activatedAt: Date | null;
}

export interface TrialConversionResult {
  /** Trials que converteram (numerador). */
  converted: number;
  /** Trials com resultado FECHADO: converteram, ou acabaram sem converter. */
  eligible: number;
  /** Taxa 0..1. **null** quando não há elegível — desconhecido não é zero. */
  rate: number | null;
  /** Trials ainda correndo (fora da taxa, mas o operador precisa vê-los). */
  inProgress: number;
  /** Média de dias entre início do trial e ativação. null se ninguém converteu. */
  avgDaysToConvert: number | null;
  /**
   * Trials excluídos por serem ANTERIORES ao corte de coorte. Contados à parte
   * para a tela poder dizer quantos ficaram de fora em vez de fingir que não
   * existem.
   */
  excludedLegacy: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Início da coorte medida: 27/07/2026, dia em que a N4 entrou.
 *
 * Por que existe um corte, e por que ele é ESTA data: antes daqui, converter
 * confirmando fatura à mão NÃO gravava `activatedAt` (o `mark_paid` só passou a
 * gravar nesta entrega). Como `trialEndsAt` sobrevive à expiração, esses trials
 * antigos entrariam na conta — e todos como PERDA, porque a conversão deles
 * nunca foi registrada. A taxa ficaria pior que a realidade por um defeito de
 * registro, não por um fato comercial.
 *
 * Para MEXER nesta data seria preciso auditar/backfillar o `activatedAt` do
 * dado legado primeiro. Sem isso, recuar o corte piora a métrica em silêncio.
 */
export const TRIAL_COHORT_START = new Date("2026-07-27T00:00:00Z");

/**
 * Entrou no NUMERADOR? Teve trial E ativou depois de o trial começar.
 *
 * 🔥 `activatedAt != null` SOZINHO não serve. `checkout-status.ts` grava
 * `activatedAt` em signup de CARTÃO, que nasce ACTIVE sem nunca ter tido trial
 * — contar isso infla a taxa. Por isso exigimos `trialStartedAt`.
 *
 * A ordem (`activatedAt >= trialStartedAt`) descarta dado incoerente que
 * produziria tempo-até-converter negativo na média.
 */
export function isTrialConversion(sub: SubscriptionForTrial): boolean {
  if (!sub.trialStartedAt || !sub.activatedAt) return false;
  return sub.activatedAt.getTime() >= sub.trialStartedAt.getTime();
}

/**
 * Entrou no DENOMINADOR? O trial precisa ter RESULTADO FECHADO em `now`:
 * ou converteu, ou o prazo acabou sem conversão.
 *
 * 🔥 Incluir trial EM ANDAMENTO derrubaria a taxa a cada signup novo — o
 * cliente ainda nem teve chance de converter. Trial sem `trialEndsAt` conta
 * como em andamento (não sabemos quando fecha).
 */
export function isTrialEligible(sub: SubscriptionForTrial, now: Date): boolean {
  if (!sub.trialStartedAt) return false;
  if (isTrialConversion(sub)) return true;
  if (!sub.trialEndsAt) return false;
  return sub.trialEndsAt.getTime() <= now.getTime();
}

/**
 * Taxa de conversão de trial + tempo médio até converter.
 *
 * NÃO filtra por status atual: uma assinatura que converteu e depois cancelou
 * continua sendo conversão histórica. Filtrar por status apagaria conversões
 * reais do passado e faria a série mudar retroativamente.
 */
export function computeTrialConversion(
  subscriptions: SubscriptionForTrial[],
  now: Date,
  /**
   * Corte de coorte: só entram trials INICIADOS a partir daqui.
   *
   * 🔥 Sem isto a métrica MENTE, e a mentira é silenciosa. `trialEndsAt`
   * SOBREVIVE à expiração (os dois caminhos que expiram trial só mudam
   * `status`), então trials antigos entram na conta normalmente. E antes do fix
   * do `mark_paid`, conversão confirmada à mão NÃO gravava `activatedAt` — logo
   * todo cliente antigo que converteu por fatura entra como PERDA. A taxa
   * apareceria pior do que a realidade, e ninguém saberia por quê.
   *
   * Omitir = sem corte (todo o histórico). Use apenas em teste ou quando o dado
   * legado tiver sido auditado.
   */
  cohortStart?: Date
): TrialConversionResult {
  let converted = 0;
  let eligible = 0;
  let inProgress = 0;
  let totalDays = 0;
  let excludedLegacy = 0;

  for (const sub of subscriptions) {
    if (!sub.trialStartedAt) continue; // nunca teve trial: fora da conta inteira

    if (cohortStart && sub.trialStartedAt.getTime() < cohortStart.getTime()) {
      excludedLegacy++;
      continue;
    }

    if (isTrialConversion(sub)) {
      converted++;
      totalDays +=
        ((sub.activatedAt as Date).getTime() - sub.trialStartedAt.getTime()) / MS_PER_DAY;
    }

    if (isTrialEligible(sub, now)) eligible++;
    else inProgress++;
  }

  return {
    converted,
    eligible,
    rate: eligible > 0 ? converted / eligible : null,
    inProgress,
    avgDaysToConvert: converted > 0 ? totalDays / converted : null,
    excludedLegacy,
  };
}

/**
 * Dias inteiros até `target`, contados por DIA LOCAL (America/Sao_Paulo), não
 * por diferença bruta de milissegundos.
 *
 * 🔥 Cortar a string ISO ou dividir o delta por 24h dá o dia UTC: um trial que
 * expira às 22h de São Paulo apareceria como "expira amanhã". É o mesmo bug de
 * fuso que já mordeu as métricas de MRR e a trilha do N7 — a fonte única do
 * projeto é `formatInTimeZone` + `TIMEZONE`.
 */
export function daysUntil(target: Date | null, now: Date): number | null {
  if (!target) return null;
  const dayOf = (d: Date) => formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
  const a = new Date(`${dayOf(now)}T00:00:00Z`).getTime();
  const b = new Date(`${dayOf(target)}T00:00:00Z`).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/** Rótulo curto para a coluna "expira em". Trata vencido e hoje explicitamente. */
export function formatDaysUntil(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "hoje";
  if (days < 0) return `venceu há ${Math.abs(days)}d`;
  return `em ${days}d`;
}
