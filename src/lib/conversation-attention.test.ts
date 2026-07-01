import { describe, it, expect } from "vitest";
import { conversationNeedsHumanAttention, conversationAttentionTier } from "./conversation-attention";

/**
 * Sinal de "precisa de atenção humana" de uma CONVERSA (não de um lead).
 *
 * Este é o guardrail SAGRADO da reclamação: uma reclamação/cobrança tem
 * isLead=false → NÃO vira card no funil → sem este sinal, o cliente furioso
 * some no "Não-lead". O sinal é FUNÇÃO PURA (sem I/O) p/ que a PROD (finalize)
 * e o EVAL (harness) usem a MESMA lógica — senão o eval mede código morto.
 *
 * Regra aprovada pelo dono (2026-06-30):
 *  - ALARME VERMELHO (needsHumanAttention=true, meta ~100% recall):
 *    intenção RECLAMACAO/COBRANCA_FINANCEIRO  OU  urgent=true (qualquer intenção,
 *    rede de segurança p/ o cliente irritado que a IA classificou errado);
 *  - TIER SUAVE (marcador secundário, não o alarme): GARANTIA_CONSERTO — reusa a
 *    mesma definição de leadNeedsAttention p/ não forkar um 3º conceito de atenção.
 */

describe("conversationNeedsHumanAttention — alarme vermelho (sagrado)", () => {
  it("RECLAMACAO acende o alarme (mesmo sem urgent)", () => {
    expect(conversationNeedsHumanAttention({ intent: "RECLAMACAO", urgent: false })).toBe(true);
  });

  it("COBRANCA_FINANCEIRO acende o alarme", () => {
    expect(conversationNeedsHumanAttention({ intent: "COBRANCA_FINANCEIRO", urgent: false })).toBe(true);
  });

  it("urgent=true acende o alarme MESMO com intenção não-flag (rede de segurança)", () => {
    // Cliente furioso que a IA classificou como OUTRO/NOVA_COMPRA — o maior buraco
    // de recall. urgent é ortogonal à intenção e cobre a classificação errada.
    expect(conversationNeedsHumanAttention({ intent: "OUTRO", urgent: true })).toBe(true);
    expect(conversationNeedsHumanAttention({ intent: "NOVA_COMPRA", urgent: true })).toBe(true);
  });

  it("GARANTIA_CONSERTO sozinha NÃO acende o alarme vermelho (é tier suave)", () => {
    expect(conversationNeedsHumanAttention({ intent: "GARANTIA_CONSERTO", urgent: false })).toBe(false);
  });

  it("intenção de venda tranquila NÃO acende o alarme", () => {
    expect(conversationNeedsHumanAttention({ intent: "NOVA_COMPRA", urgent: false })).toBe(false);
    expect(conversationNeedsHumanAttention({ intent: "ORCAMENTO_PRECO", urgent: false })).toBe(false);
  });

  it("pós-venda / ruído tranquilo NÃO acende o alarme", () => {
    expect(conversationNeedsHumanAttention({ intent: "AGUARDANDO_OS", urgent: false })).toBe(false);
    expect(conversationNeedsHumanAttention({ intent: "COMPROU_RECENTE", urgent: false })).toBe(false);
    expect(conversationNeedsHumanAttention({ intent: "OUTRO", urgent: false })).toBe(false);
  });

  it("valores nulos/ausentes são seguros (não acende)", () => {
    expect(conversationNeedsHumanAttention({ intent: null, urgent: null })).toBe(false);
    expect(conversationNeedsHumanAttention({})).toBe(false);
  });
});

describe("conversationAttentionTier — tier p/ o badge do inbox", () => {
  it("RECLAMACAO/COBRANCA → 'red' (alarme sagrado)", () => {
    expect(conversationAttentionTier({ intent: "RECLAMACAO", urgent: false })).toBe("red");
    expect(conversationAttentionTier({ intent: "COBRANCA_FINANCEIRO", urgent: false })).toBe("red");
  });

  it("urgent=true → 'red' mesmo com intenção não-flag", () => {
    expect(conversationAttentionTier({ intent: "OUTRO", urgent: true })).toBe("red");
  });

  it("GARANTIA_CONSERTO → 'soft' (marcador secundário)", () => {
    expect(conversationAttentionTier({ intent: "GARANTIA_CONSERTO", urgent: false })).toBe("soft");
  });

  it("resto → null (sem marcador)", () => {
    expect(conversationAttentionTier({ intent: "NOVA_COMPRA", urgent: false })).toBeNull();
    expect(conversationAttentionTier({ intent: "OUTRO", urgent: false })).toBeNull();
    expect(conversationAttentionTier({})).toBeNull();
  });
});
