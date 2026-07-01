/**
 * SLA de lead não respondido (Fase 3, Item 4a) — a dor nº1 do dono: lead que
 * chega e fica parado sem ninguém responder. Mede há quanto tempo cada lead
 * ABERTO (não ganho, não perdido) está sem atividade (lastActivityAt) e o
 * classifica em 3 faixas. Puro, sem I/O — recebe `now` p/ ser testável.
 *
 * Faixas (horas desde a última atividade):
 *   no prazo  : < SLA_WARN_HOURS
 *   atenção   : SLA_WARN_HOURS .. SLA_LATE_HOURS
 *   atrasado  : >= SLA_LATE_HOURS
 */

export const SLA_WARN_HOURS = 4;   // sem resposta em 4h já merece atenção
export const SLA_LATE_HOURS = 24;  // 1 dia sem resposta = atrasado (perde o lead)

export interface SlaLeadRow {
  id: string;
  lastActivityAt: Date;
  stage: { isWon: boolean; isLost: boolean };
  /**
   * "Precisa responder" (Item 5, sinal AFIADO): o cliente engajou mas a ÓTICA
   * ainda NÃO respondeu com conteúdo humano. undefined = sinal indisponível p/
   * este lead (ex.: lead sem conversa de WhatsApp) — não entra na conta afiada.
   * O tempo parado (lastActivityAt) mede STALENESS; isto mede "a bola está com a
   * ótica": é a diferença entre "ninguém respondeu ainda" e "respondemos, o
   * cliente é que sumiu". A dor nº1 do dono é a primeira.
   */
  needsReply?: boolean;
}

export interface LateLead {
  id: string;
  hoursWaiting: number;
}

export interface LeadSla {
  totalOpen: number;
  onTime: number;
  warning: number;
  late: number;
  /** Atrasados, do mais parado p/ o menos (p/ o gerente priorizar). */
  lateLeads: LateLead[];
  /**
   * AFIADO (Item 5): leads abertos onde a bola está com a ótica (cliente engajou,
   * ótica não respondeu). Subconjunto dos abertos com sinal disponível. `topWaiting`
   * = os que mais esperam por resposta, p/ o gerente atacar primeiro.
   */
  needsReply: number;
  needsReplyLeads: LateLead[];
}

export function computeLeadSla(rows: ReadonlyArray<SlaLeadRow>, now: Date): LeadSla {
  let onTime = 0;
  let warning = 0;
  let late = 0;
  const lateLeads: LateLead[] = [];
  const needsReplyLeads: LateLead[] = [];

  for (const r of rows) {
    if (r.stage.isWon || r.stage.isLost) continue; // não está aguardando resposta
    const hoursWaiting = (now.getTime() - r.lastActivityAt.getTime()) / 3600_000;
    if (hoursWaiting >= SLA_LATE_HOURS) {
      late++;
      lateLeads.push({ id: r.id, hoursWaiting });
    } else if (hoursWaiting >= SLA_WARN_HOURS) {
      warning++;
    } else {
      onTime++;
    }
    // Sinal afiado: a bola está com a ótica (cliente engajou, ótica não respondeu).
    // Ortogonal às faixas de tempo — um lead pode "precisar responder" e ainda
    // estar no prazo (chegou há 1h e ninguém respondeu). undefined não entra.
    if (r.needsReply === true) {
      needsReplyLeads.push({ id: r.id, hoursWaiting });
    }
  }

  lateLeads.sort((a, b) => b.hoursWaiting - a.hoursWaiting);
  needsReplyLeads.sort((a, b) => b.hoursWaiting - a.hoursWaiting);
  return {
    totalOpen: onTime + warning + late,
    onTime, warning, late, lateLeads,
    needsReply: needsReplyLeads.length,
    needsReplyLeads,
  };
}
