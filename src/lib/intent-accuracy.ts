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

/** Acurácia de UMA intenção (quando a IA disse X, quantas vezes acertou). */
export interface IntentAccuracyDetail {
  /** A intenção PREDITA (o que a IA chutou). */
  intent: string;
  total: number;
  correct: number;
  rate: number;
  hasEnoughSample: boolean;
  /** Confusão nº1: p/ qual intenção X mais foi CORRIGIDA (o erro típico). null se sempre acerta. */
  topConfusion: { intent: string; count: number } | null;
}

/**
 * Acurácia POR intenção predita (gold set das correções humanas reais). Responde
 * "quando a IA diz RENOVACAO, ela acerta X%?" e "quando erra, vira o quê?" — é o
 * que destrava a Fase 4 (automação só liga onde a acurácia por intenção passa o
 * piso), e mostra ao dono ONDE a IA é fraca. Ordenado da pior acurácia p/ a melhor
 * (com amostra suficiente primeiro), p/ o problema aparecer no topo.
 *
 * Puro, sem I/O. Agrupa por `intentPredicted` (o chute); `intent` é a verdade.
 */
export function computeIntentAccuracyByIntent(
  rows: ReadonlyArray<IntentAccuracyRow>,
  minSample: number = ACCURACY_MIN_SAMPLE,
): IntentAccuracyDetail[] {
  // Por intenção predita: total, acertos e histograma das correções (predito != atual).
  const acc = new Map<string, { total: number; correct: number; confusions: Map<string, number> }>();
  for (const r of rows) {
    if (!r.intentPredicted || !r.intent) continue;
    const e = acc.get(r.intentPredicted) ?? { total: 0, correct: 0, confusions: new Map() };
    e.total++;
    if (r.intentPredicted === r.intent) e.correct++;
    else e.confusions.set(r.intent, (e.confusions.get(r.intent) ?? 0) + 1);
    acc.set(r.intentPredicted, e);
  }

  const out: IntentAccuracyDetail[] = [];
  for (const [intent, e] of acc) {
    let topConfusion: { intent: string; count: number } | null = null;
    for (const [to, count] of e.confusions) {
      if (!topConfusion || count > topConfusion.count) topConfusion = { intent: to, count };
    }
    out.push({
      intent,
      total: e.total,
      correct: e.correct,
      rate: e.total === 0 ? 0 : e.correct / e.total,
      hasEnoughSample: e.total >= minSample,
      topConfusion,
    });
  }

  // Amostra suficiente primeiro; dentro disso, pior acurácia no topo (o problema).
  out.sort((a, b) => {
    if (a.hasEnoughSample !== b.hasEnoughSample) return a.hasEnoughSample ? -1 : 1;
    return a.rate - b.rate;
  });
  return out;
}
