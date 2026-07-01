/**
 * Placar do eval do funil PONDERADO POR IMPACTO (Item 2).
 *
 * A acurácia geral (X/95) era métrica de VAIDADE: misturava erro de R$50k
 * (reclamação que some) com erro de R$0 (NOVA_COMPRA vs ORCAMENTO, mesmo estágio).
 * Aqui separamos em 3 placares por MEDO do dono, cada um respondendo uma pergunta
 * de negócio — FUNÇÃO PURA, sem I/O, testável.
 *
 *  (a) NÃO-PERDE-RECLAMAÇÃO (SAGRADO, meta ~100%): das conversas que DEVIAM
 *      sinalizar humano, quantas sinalizaram? (recall da classe sagrada). +
 *      falsos-positivos (sinalizou sem dever — alarme à toa treina o dono a ignorar).
 *  (b) CAPTURA-LEAD (recall): dos casos que DEVIAM virar lead, quantos viraram?
 *  (c) ESTÁGIO-CERTO | É-LEAD: dos casos lead↔lead, quantos no estágio certo?
 *      Erro de intenção que cai no MESMO estágio pesa 0 (sinônimo NOVA_COMPRA/
 *      ORCAMENTO/RENOVACAO): o que importa é onde o card PARA, não o rótulo.
 */

/** O resultado de 1 caso, reduzido ao que o placar precisa (sem PII). */
export interface EvalCaseResult {
  gotIsLead: boolean;
  gotStage: string;
  expIsLead: boolean;
  expStage: string;
}

const HUMAN_STAGE = "Sinaliza humano";

export interface Scoreboard {
  /** Denominador da métrica (nº de casos que ela mede). */
  total: number;
  /** Acertos (numerador). */
  hits: number;
  /** Recall/acerto em % (0 quando total=0). */
  pct: number;
}

export interface FunnelEvalScore {
  /** (a) SAGRADO — recall de "sinaliza humano" + contagem de falso-positivo. */
  naoPerdeReclamacao: Scoreboard & { falsePositives: number };
  /** (b) recall de captura de lead. */
  capturaLead: Scoreboard;
  /** (c) estágio certo, condicionado a lead↔lead (sinônimo mesmo-estágio = peso 0). */
  estagioCerto: Scoreboard;
}

function pct(hits: number, total: number): number {
  return total === 0 ? 0 : +((hits / total) * 100).toFixed(1);
}

export function scoreFunnelEval(results: ReadonlyArray<EvalCaseResult>): FunnelEvalScore {
  // (a) SAGRADO: recall sobre os que DEVIAM sinalizar humano.
  const sacredCases = results.filter((r) => r.expStage === HUMAN_STAGE);
  const sacredHits = sacredCases.filter((r) => r.gotStage === HUMAN_STAGE).length;
  // Falso-positivo: sinalizou humano SEM que o gabarito pedisse (alarme à toa).
  const falsePositives = results.filter(
    (r) => r.gotStage === HUMAN_STAGE && r.expStage !== HUMAN_STAGE,
  ).length;

  // (b) CAPTURA-LEAD: recall sobre os que DEVIAM ser lead.
  const leadCases = results.filter((r) => r.expIsLead);
  const leadHits = leadCases.filter((r) => r.gotIsLead).length;

  // (c) ESTÁGIO-CERTO | é-lead: só onde AMBOS são lead (expStage/gotStage
  //     comparáveis como estágio de funil). Sinônimo mesmo-estágio já colapsa
  //     aqui — comparamos o ESTÁGIO, não a intenção, então NOVA_COMPRA vs
  //     ORCAMENTO que caem no mesmo estágio contam como acerto (peso 0 no erro).
  const stageCases = results.filter((r) => r.expIsLead && r.gotIsLead);
  const stageHits = stageCases.filter((r) => r.gotStage === r.expStage).length;

  return {
    naoPerdeReclamacao: {
      total: sacredCases.length,
      hits: sacredHits,
      pct: pct(sacredHits, sacredCases.length),
      falsePositives,
    },
    capturaLead: { total: leadCases.length, hits: leadHits, pct: pct(leadHits, leadCases.length) },
    estagioCerto: { total: stageCases.length, hits: stageHits, pct: pct(stageHits, stageCases.length) },
  };
}
