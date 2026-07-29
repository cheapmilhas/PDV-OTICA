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
 * Próximo marco a notificar agora: o MENOR marco já atingido (`<= daysOverdue`)
 * que ainda não foi avisado (`> lastStage`). Retorna null se não há aviso novo.
 *
 * 🔑 NÃO pula marcos (spec 2026-07-29 §4.6.2). Antes devolvia o MAIOR marco
 * atingido, e um cliente encontrado já com 14 dias de atraso recebia UM aviso e
 * era suspenso na mesma execução do cron — a régua prometia três avisos e
 * entregava um. Agora cada execução sobe um degrau, então restringir exige
 * necessariamente execuções distintas.
 *
 * - Entrou com 10 dias e lastStage=0 → 3. Na execução seguinte → 7. Depois → 14.
 * - lastStage null trata-se como 0 (nenhum aviso ainda).
 */
export function nextDunningStage(daysOverdue: number, lastStage: number | null): number | null {
  const last = lastStage ?? 0;
  for (const stage of DUNNING_STAGES) {
    if (stage <= daysOverdue && stage > last) {
      return stage; // primeiro pendente — um degrau por execução
    }
  }
  return null;
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
