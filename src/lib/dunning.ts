/**
 * Régua de inadimplência (dunning) — lógica PURA, testável sem banco.
 *
 * A régua avisa o cliente em etapas antes de suspender/cancelar. Os marcos são
 * "≥ N dias completos de atraso" (daysOverdue é floor da diferença, em UTC).
 */

/** Marcos de aviso ao cliente, em dias de atraso (crescente). */
export const DUNNING_STAGES = [3, 7, 14] as const;

/** A partir de 14 dias completos, a assinatura é suspensa. */
export const SUSPEND_DAYS = 14;

/** A partir de 30 dias completos, cancela — MAS só se os avisos foram dados. */
export const CANCEL_DAYS = 30;

/**
 * Próximo marco a notificar agora: o MAIOR marco já atingido (`<= daysOverdue`)
 * que ainda não foi avisado (`> lastStage`). Retorna null se não há aviso novo.
 *
 * - Pula marcos: entrou com 10 dias de atraso e lastStage=0 → retorna 7 (não 3).
 *   No run seguinte, lastStage=7 e daysOverdue=10 → null (próximo é 14, ainda não atingido).
 * - lastStage null trata-se como 0 (nenhum aviso ainda).
 */
export function nextDunningStage(daysOverdue: number, lastStage: number | null): number | null {
  const last = lastStage ?? 0;
  let candidate: number | null = null;
  for (const stage of DUNNING_STAGES) {
    if (stage <= daysOverdue && stage > last) {
      candidate = stage; // mantém o maior aplicável
    }
  }
  return candidate;
}

/**
 * Pode cancelar? Só com ≥30 dias E os avisos registrados (lastStage atingiu o
 * último marco da régua = 14). Sem avisos → NÃO cancela (a régua exige comunicar
 * antes); o cron envia o aviso pendente e adia o cancelamento.
 */
export function canCancel(daysOverdue: number, lastStage: number | null): boolean {
  const last = lastStage ?? 0;
  return daysOverdue >= CANCEL_DAYS && last >= SUSPEND_DAYS;
}

/** Texto do aviso in-app ao cliente, escalonado em tom por marco. */
export function dunningMessage(stage: number, daysOverdue: number): { title: string; message: string } {
  if (stage >= 14) {
    return {
      title: "Acesso será suspenso por falta de pagamento",
      message: `Sua assinatura está com ${daysOverdue} dias em atraso. Regularize o pagamento para evitar a suspensão do acesso.`,
    };
  }
  if (stage >= 7) {
    return {
      title: "Pagamento em atraso há uma semana",
      message: `Sua assinatura está com ${daysOverdue} dias em atraso. Regularize para manter seu acesso ativo.`,
    };
  }
  return {
    title: "Pagamento da assinatura em atraso",
    message: `Identificamos um atraso de ${daysOverdue} dias no pagamento da sua assinatura. Por favor, regularize.`,
  };
}
