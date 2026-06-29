/**
 * Placar de acurácia da classificação de intenção da IA (Fase 3).
 *
 * Acurácia = (nº de leads em que o palpite da IA foi mantido) / (nº de leads
 * que a IA classificou E já têm intenção definida). Um lead "corrigido" para
 * uma intenção diferente conta como ERRO da IA; mantido = ACERTO.
 *
 * Regra anti-vexame (revisão de arquitetura): NUNCA mostrar "100%" com 1 caso.
 * `hasEnoughSample` só fica true ao atingir o piso — a UI esconde o número até lá.
 *
 * Puro, sem I/O. Só conta leads com intentPredicted != null (a IA opinou) e
 * intent != null (já há verdade atual). Lead criado manualmente (sem IA) fica
 * de fora — não infla nem deprime a acurácia.
 */

/** Piso de amostra abaixo do qual o placar não é exibido (evita % enganoso). */
export const ACCURACY_MIN_SAMPLE = 20;

export interface IntentAccuracyRow {
  intentPredicted: string | null;
  intent: string | null;
}

export interface IntentAccuracy {
  /** Leads que entram na conta (IA opinou E há intenção atual). */
  total: number;
  /** Quantos a IA acertou (palpite mantido). */
  correct: number;
  /** correct/total, ou 0 se total=0. */
  rate: number;
  /** total >= piso → a UI pode exibir o número. */
  hasEnoughSample: boolean;
}

export function computeIntentAccuracy(
  rows: ReadonlyArray<IntentAccuracyRow>,
  minSample: number = ACCURACY_MIN_SAMPLE,
): IntentAccuracy {
  let total = 0;
  let correct = 0;
  for (const r of rows) {
    if (!r.intentPredicted || !r.intent) continue; // fora da amostra
    total++;
    if (r.intentPredicted === r.intent) correct++;
  }
  return {
    total,
    correct,
    rate: total === 0 ? 0 : correct / total,
    hasEnoughSample: total >= minSample,
  };
}
