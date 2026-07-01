import { describe, it, expect } from "vitest";
import { scoreFunnelEval, type EvalCaseResult } from "./funnel-eval-score";

const H = "Sinaliza humano";

function r(over: Partial<EvalCaseResult>): EvalCaseResult {
  return { gotIsLead: false, gotStage: "Nao-lead", expIsLead: false, expStage: "Nao-lead", ...over };
}

describe("scoreFunnelEval — placar ponderado por impacto", () => {
  it("(a) SAGRADO: recall de sinaliza-humano", () => {
    const s = scoreFunnelEval([
      r({ expStage: H, gotStage: H }),        // acertou
      r({ expStage: H, gotStage: H }),        // acertou
      r({ expStage: H, gotStage: "Nao-lead" }), // PERDEU a reclamação (o custo R$50k)
    ]);
    expect(s.naoPerdeReclamacao.total).toBe(3);
    expect(s.naoPerdeReclamacao.hits).toBe(2);
    expect(s.naoPerdeReclamacao.pct).toBe(66.7);
  });

  it("(a) conta FALSO-POSITIVO (sinalizou sem dever)", () => {
    const s = scoreFunnelEval([
      r({ expStage: "Nao-lead", gotStage: H }),     // alarme à toa
      r({ expIsLead: true, gotIsLead: true, expStage: "Novo", gotStage: H }), // alarme à toa num lead
      r({ expStage: H, gotStage: H }),              // legítimo
    ]);
    expect(s.naoPerdeReclamacao.falsePositives).toBe(2);
  });

  it("(b) CAPTURA-LEAD: recall de virar lead", () => {
    const s = scoreFunnelEval([
      r({ expIsLead: true, gotIsLead: true }),
      r({ expIsLead: true, gotIsLead: false }), // perdeu o lead
      r({ expIsLead: false, gotIsLead: false }), // não conta (não devia ser lead)
    ]);
    expect(s.capturaLead.total).toBe(2);
    expect(s.capturaLead.hits).toBe(1);
    expect(s.capturaLead.pct).toBe(50);
  });

  it("(c) ESTÁGIO só entre lead↔lead; sinônimo mesmo-estágio = acerto (peso 0)", () => {
    const s = scoreFunnelEval([
      // intenção diferente mas MESMO estágio → acerto (o que importa é o estágio)
      r({ expIsLead: true, gotIsLead: true, expStage: "Em atendimento", gotStage: "Em atendimento" }),
      // estágio errado de verdade → falha
      r({ expIsLead: true, gotIsLead: true, expStage: "Orçamento enviado", gotStage: "Em atendimento" }),
      // um é lead o outro não → fora do denominador de estágio
      r({ expIsLead: true, gotIsLead: false, expStage: "Novo", gotStage: "Nao-lead" }),
    ]);
    expect(s.estagioCerto.total).toBe(2);
    expect(s.estagioCerto.hits).toBe(1);
    expect(s.estagioCerto.pct).toBe(50);
  });

  it("total=0 → pct 0 (sem divisão por zero)", () => {
    const s = scoreFunnelEval([]);
    expect(s.naoPerdeReclamacao.pct).toBe(0);
    expect(s.capturaLead.pct).toBe(0);
    expect(s.estagioCerto.pct).toBe(0);
  });
});
