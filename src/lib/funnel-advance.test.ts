import { describe, it, expect } from "vitest";
import { decideFunnelAdvance, FUNNEL_CONFIDENCE_MIN } from "./funnel-advance";
import type { FunnelStage } from "./funnel-advance";

/**
 * Régua de avanço do funil (Fatia 3) — função PURA, sem banco.
 *
 * Régua aprovada pelo dono:
 *  - só avança 1 passo: Novo→Em atendimento, Em atendimento→Orçamento enviado;
 *  - NUNCA toca terminal (isWon/isLost);
 *  - Novo→Em atendimento: intenção de COMPRA (5 intenções) + cliente engajou;
 *  - Em atendimento→Orçamento: sinal OBJETIVO = ótica mandou R$ (outbound);
 *  - RECLAMACAO/COBRANCA → flag (sinaliza humano), NÃO move;
 *  - confiança baixa / OUTRO / pós-venda → hold (não move, silencioso).
 */

// Estágios típicos de uma ótica, em ordem.
const STAGES: FunnelStage[] = [
  { id: "s_novo", order: 0, isWon: false, isLost: false },
  { id: "s_atend", order: 1, isWon: false, isLost: false },
  { id: "s_orc", order: 2, isWon: false, isLost: false },
  { id: "s_fechado", order: 3, isWon: true, isLost: false },
  { id: "s_perdido", order: 4, isWon: false, isLost: true },
];

function base(over: Partial<Parameters<typeof decideFunnelAdvance>[0]> = {}) {
  return decideFunnelAdvance({
    intent: "NOVA_COMPRA",
    confidence: 0.9,
    currentStageId: "s_novo",
    stages: STAGES,
    clientEngaged: true,
    oticaSentValue: false,
    ...over,
  });
}

describe("decideFunnelAdvance — régua de avanço do funil", () => {
  // ---- Novo → Em atendimento ----
  it("Novo + intenção de compra + cliente engajou → move p/ Em atendimento", () => {
    const r = base({ intent: "NOVA_COMPRA", currentStageId: "s_novo", clientEngaged: true });
    expect(r.action).toBe("move");
    expect(r.targetStageId).toBe("s_atend");
  });

  it.each(["NOVA_COMPRA", "ORCAMENTO_PRECO", "RENOVACAO", "AGENDAMENTO_INFO", "CONVENIO_PLANO"] as const)(
    "as 5 intenções de compra avançam de Novo (%s)",
    (intent) => {
      const r = base({ intent, currentStageId: "s_novo", clientEngaged: true });
      expect(r.action).toBe("move");
      expect(r.targetStageId).toBe("s_atend");
    },
  );

  it("Novo + cliente NÃO engajou (só saudação) → hold", () => {
    const r = base({ currentStageId: "s_novo", clientEngaged: false });
    expect(r.action).toBe("hold");
  });

  // ---- Em atendimento → Orçamento enviado ----
  it("Em atendimento + ótica mandou R$ → move p/ Orçamento enviado", () => {
    const r = base({ currentStageId: "s_atend", oticaSentValue: true });
    expect(r.action).toBe("move");
    expect(r.targetStageId).toBe("s_orc");
  });

  it("Em atendimento SEM R$ da ótica → hold (não infla Orçamento)", () => {
    const r = base({ currentStageId: "s_atend", oticaSentValue: false });
    expect(r.action).toBe("hold");
  });

  // ---- só avança 1 / nunca pula ----
  it("Novo + ótica já mandou R$ → avança só 1 (p/ Em atendimento, não pula p/ Orçamento)", () => {
    const r = base({ currentStageId: "s_novo", clientEngaged: true, oticaSentValue: true });
    expect(r.action).toBe("move");
    expect(r.targetStageId).toBe("s_atend"); // 1 passo só
  });

  // ---- terminais: nunca toca ----
  it("card em Fechado (isWon) → hold (terminal, nunca move)", () => {
    const r = base({ currentStageId: "s_fechado", oticaSentValue: true });
    expect(r.action).toBe("hold");
  });

  it("card em Perdido (isLost) → hold (terminal)", () => {
    const r = base({ currentStageId: "s_perdido" });
    expect(r.action).toBe("hold");
  });

  it("Orçamento enviado → hold (próximo é terminal, só humano/venda)", () => {
    const r = base({ currentStageId: "s_orc", oticaSentValue: true });
    expect(r.action).toBe("hold");
  });

  // ---- reclamação/cobrança → flag ----
  it("RECLAMACAO → flag (sinaliza humano), NÃO move", () => {
    const r = base({ intent: "RECLAMACAO", currentStageId: "s_novo" });
    expect(r.action).toBe("flag");
    expect(r.targetStageId).toBeUndefined();
  });

  it("COBRANCA_FINANCEIRO → flag", () => {
    const r = base({ intent: "COBRANCA_FINANCEIRO", currentStageId: "s_atend", oticaSentValue: true });
    expect(r.action).toBe("flag");
  });

  it("mistura: intenção de compra MAS reclamação prevalece → flag", () => {
    // quando a intenção classificada é RECLAMACAO, mesmo com R$, sinaliza.
    const r = base({ intent: "RECLAMACAO", currentStageId: "s_atend", oticaSentValue: true, clientEngaged: true });
    expect(r.action).toBe("flag");
  });

  // ---- pós-venda / OUTRO → hold ----
  it.each(["COMPROU_RECENTE", "AGUARDANDO_OS", "SEGUNDA_VIA_RECEITA", "GARANTIA_CONSERTO", "OUTRO"] as const)(
    "intenção pós-venda/OUTRO não avança (%s)",
    (intent) => {
      const r = base({ intent, currentStageId: "s_novo", clientEngaged: true });
      expect(r.action).toBe("hold");
    },
  );

  // ---- confiança baixa → hold silencioso ----
  it("confiança abaixo do limiar → hold (não move, silencioso)", () => {
    const r = base({ confidence: FUNNEL_CONFIDENCE_MIN - 0.01, currentStageId: "s_novo", clientEngaged: true });
    expect(r.action).toBe("hold");
  });

  it("confiança baixa NÃO vira flag mesmo em reclamação? — reclamação sempre sinaliza", () => {
    // Segurança: reclamação sinaliza mesmo com confiança baixa (não engole risco).
    const r = base({ intent: "RECLAMACAO", confidence: 0.1, currentStageId: "s_novo" });
    expect(r.action).toBe("flag");
  });

  // ---- robustez ----
  it("estágio atual desconhecido → hold (não inventa)", () => {
    const r = base({ currentStageId: "inexistente" });
    expect(r.action).toBe("hold");
  });

  // ---- funil com >3 estágios (HIGH #2): a IA só atua nos 2 primeiros trechos ----
  it("funil de 4 abertos: 3º estágio aberto NÃO avança por R$ (só humano)", () => {
    const FOUR: FunnelStage[] = [
      { id: "s_novo", order: 0, isWon: false, isLost: false },
      { id: "s_atend", order: 1, isWon: false, isLost: false },
      { id: "s_proposta", order: 2, isWon: false, isLost: false },
      { id: "s_orc", order: 3, isWon: false, isLost: false },
      { id: "s_fechado", order: 4, isWon: true, isLost: false },
    ];
    // card no 3º aberto (Proposta) com R$ → NÃO move (estágio avançado = humano)
    const r = decideFunnelAdvance({
      intent: "ORCAMENTO_PRECO", confidence: 0.9, currentStageId: "s_proposta",
      stages: FOUR, clientEngaged: true, oticaSentValue: true,
    });
    expect(r.action).toBe("hold");
    expect(r.reason).toMatch(/avançad/i);
  });

  it("funil de 4 abertos: 2º estágio (Em atendimento) AINDA avança por R$", () => {
    const FOUR: FunnelStage[] = [
      { id: "s_novo", order: 0, isWon: false, isLost: false },
      { id: "s_atend", order: 1, isWon: false, isLost: false },
      { id: "s_proposta", order: 2, isWon: false, isLost: false },
      { id: "s_fechado", order: 3, isWon: true, isLost: false },
    ];
    const r = decideFunnelAdvance({
      intent: "NOVA_COMPRA", confidence: 0.9, currentStageId: "s_atend",
      stages: FOUR, clientEngaged: true, oticaSentValue: true,
    });
    expect(r.action).toBe("move");
    expect(r.targetStageId).toBe("s_proposta");
  });

  it("não há próximo estágio aberto (funil só tem Novo+terminais) → hold", () => {
    const onlyNovo: FunnelStage[] = [
      { id: "s_novo", order: 0, isWon: false, isLost: false },
      { id: "s_fechado", order: 1, isWon: true, isLost: false },
    ];
    const r = decideFunnelAdvance({
      intent: "NOVA_COMPRA", confidence: 0.9, currentStageId: "s_novo",
      stages: onlyNovo, clientEngaged: true, oticaSentValue: false,
    });
    // próximo seria o Fechado (terminal) → não move
    expect(r.action).toBe("hold");
  });
});
