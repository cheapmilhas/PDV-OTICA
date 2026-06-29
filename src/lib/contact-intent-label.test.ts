import { describe, it, expect } from "vitest";
import { intentLabel } from "./contact-intent-label";

describe("intentLabel", () => {
  it("null/undefined → null", () => {
    expect(intentLabel(null)).toBeNull();
    expect(intentLabel(undefined)).toBeNull();
  });

  it("intenção de venda → rótulo + kind venda", () => {
    expect(intentLabel("RENOVACAO")).toEqual({ label: "Renovação", kind: "venda" });
    expect(intentLabel("AGUARDANDO_OS")?.kind).toBe("venda");
  });

  it("intenção de atenção → kind atencao", () => {
    expect(intentLabel("GARANTIA_CONSERTO")?.kind).toBe("atencao");
  });

  it("valor desconhecido → fallback 'Sugestão da IA', nunca vazio", () => {
    const r = intentLabel("XPTO");
    expect(r?.label).toBe("Sugestão da IA");
  });

  it("vendedor comum (gerencial=false): reclamação/cobrança mascaradas", () => {
    expect(intentLabel("RECLAMACAO", false)?.label).toBe("Precisa de atenção");
    expect(intentLabel("COBRANCA_FINANCEIRO", false)?.label).toBe("Precisa de atenção");
    // venda não é mascarada
    expect(intentLabel("RENOVACAO", false)?.label).toBe("Renovação");
    // gerencial vê o rótulo real
    expect(intentLabel("RECLAMACAO", true)?.label).toBe("Reclamação");
  });
});
