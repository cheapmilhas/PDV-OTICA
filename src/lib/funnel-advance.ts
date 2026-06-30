/**
 * Régua de avanço do funil (Funil Inteligente — Fatia 3). FUNÇÃO PURA: decide a
 * ação a partir dos sinais da conversa, SEM tocar banco. O motor no cron aplica
 * o resultado através das travas (só-avança-1, trava humana, kill-switch).
 *
 * Régua aprovada pelo dono (2026-06-30):
 *  - só AVANÇA 1 passo; nunca volta, nunca pula, NUNCA toca terminal (isWon/isLost);
 *  - Novo→Em atendimento: intenção de COMPRA (5 intenções) + cliente engajou;
 *  - Em atendimento→Orçamento: sinal OBJETIVO = a ÓTICA mandou R$ (msg outbound);
 *  - RECLAMACAO/COBRANCA → flag (sinaliza humano), prevalece mesmo com R$;
 *  - confiança < limiar, OUTRO, pós-venda → hold (não move, silencioso).
 */
import type { ContactIntent } from "@/lib/ai/lead-qualifier";

/** Limiar mínimo de confiança da IA p/ ela poder mover um card. */
export const FUNNEL_CONFIDENCE_MIN = 0.6;

/** As 5 intenções que abrem o funil (oportunidade de venda real). */
const ADVANCE_INTENTS: ReadonlySet<ContactIntent> = new Set<ContactIntent>([
  "NOVA_COMPRA", "ORCAMENTO_PRECO", "RENOVACAO", "AGENDAMENTO_INFO", "CONVENIO_PLANO",
]);

/** Intenções que exigem atenção humana — sinalizam, nunca movem. */
const FLAG_INTENTS: ReadonlySet<ContactIntent> = new Set<ContactIntent>([
  "RECLAMACAO", "COBRANCA_FINANCEIRO",
]);

export interface FunnelStage {
  id: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

export interface FunnelAdvanceInput {
  intent: ContactIntent;
  confidence: number;
  currentStageId: string;
  stages: FunnelStage[];
  /** Cliente mandou ao menos 1 mensagem com conteúdo (não só saudação/sticker). */
  clientEngaged: boolean;
  /** A ótica enviou ao menos 1 mensagem (outbound) com valor R$ de produto/serviço. */
  oticaSentValue: boolean;
}

export type FunnelAction = "move" | "hold" | "flag";

export interface FunnelAdvanceResult {
  action: FunnelAction;
  targetStageId?: string;
  reason: string;
}

const hold = (reason: string): FunnelAdvanceResult => ({ action: "hold", reason });
const flag = (reason: string): FunnelAdvanceResult => ({ action: "flag", reason });

/**
 * Resolve o PRÓXIMO estágio não-terminal (menor order > atual). Retorna null se
 * não houver (ex.: o próximo é terminal, ou o atual é o último aberto).
 */
function nextOpenStage(stages: FunnelStage[], currentOrder: number): FunnelStage | null {
  const next = stages
    .filter((s) => s.order > currentOrder && !s.isWon && !s.isLost)
    .sort((a, b) => a.order - b.order)[0];
  return next ?? null;
}

export function decideFunnelAdvance(input: FunnelAdvanceInput): FunnelAdvanceResult {
  const { intent, confidence, currentStageId, stages, clientEngaged, oticaSentValue } = input;

  // 1. Reclamação/cobrança SEMPRE sinaliza humano — prevalece sobre tudo
  //    (mesmo com intenção de compra junto ou confiança baixa). Risco de perder
  //    venda = decisão de gente, não da IA.
  if (FLAG_INTENTS.has(intent)) return flag(`intenção ${intent} — sinaliza humano`);

  // 2. Card terminal (Ganho/Perdido) ou estágio desconhecido → nunca move.
  const current = stages.find((s) => s.id === currentStageId);
  if (!current) return hold("estágio atual desconhecido");
  if (current.isWon || current.isLost) return hold("card terminal — só humano/venda");

  // 3. Confiança baixa → não move (silencioso).
  if (confidence < FUNNEL_CONFIDENCE_MIN) return hold("confiança abaixo do limiar");

  // 4. Há um próximo estágio aberto p/ avançar? (1 passo só)
  const next = nextOpenStage(stages, current.order);
  if (!next) return hold("não há próximo estágio aberto");

  // 5. Régua por POSIÇÃO entre os estágios abertos (robusta a funis com >3
  //    estágios — não confia em order absoluto). A IA só atua nos 2 primeiros
  //    trechos; estágios mais avançados são decisão humana.
  //    - trecho 0 (1º aberto → 2º): intenção de compra + cliente engajou;
  //    - trecho 1 (2º aberto → 3º): exige R$ enviado pela ótica;
  //    - trecho 2+ : IA não avança (deixa pro humano).
  const openStages = stages
    .filter((s) => !s.isWon && !s.isLost)
    .sort((a, b) => a.order - b.order);
  const openIndex = openStages.findIndex((s) => s.id === current.id);

  if (openIndex === 0) {
    // 1º estágio aberto (ex.: Novo) → 2º (ex.: Em atendimento)
    if (ADVANCE_INTENTS.has(intent) && clientEngaged) {
      return { action: "move", targetStageId: next.id, reason: `interesse de compra (${intent})` };
    }
    return hold("sem sinal de interesse de compra");
  }

  if (openIndex === 1) {
    // 2º estágio aberto (ex.: Em atendimento) → 3º (ex.: Orçamento enviado):
    // só com o sinal objetivo do R$ enviado pela ótica.
    if (oticaSentValue) {
      return { action: "move", targetStageId: next.id, reason: "ótica enviou orçamento (R$)" };
    }
    return hold("aguardando orçamento (R$) da ótica");
  }

  // Estágio aberto avançado (3º+) → a IA não mexe; humano conduz daqui.
  return hold("estágio avançado — só humano avança");
}
